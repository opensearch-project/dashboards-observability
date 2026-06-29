/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Read-boundary normalizer — `normalizeSloSpec` fills missing `alarms.*`
 * keys with defaults so a future alarm type can land as a type + default-
 * filler change without a saved-object migration.
 */

import { normalizeSloSpec, SloService } from '../slo_service';
import { InMemorySloStore } from '../slo_store';
import type { Logger } from '../../types/alerting';
import type { SloSpec } from '../slo_types';

function validSpec(overrides: Partial<SloSpec> = {}): SloSpec {
  return {
    datasourceId: 'prom-ds-001',
    name: 'API Availability',
    enabled: true,
    mode: 'active',
    service: 'api',
    owner: { teams: ['platform'] },
    sli: {
      type: 'single',
      definition: {
        backend: 'prometheus',
        type: 'availability',
        calcMethod: 'events',
        metric: 'http_requests_total',
        goodEventsFilter: 'status_code!~"5.."',
      },
      dimensions: [],
    },
    objectives: [{ name: 'a', target: 0.999 }],
    budgetWarningThresholds: [],
    window: { type: 'rolling', duration: '28d' },
    alerting: { strategy: 'mwmbr', burnRates: [] },
    alarms: {
      sliHealth: { enabled: false },
      attainmentBreach: { enabled: false },
      budgetWarning: { enabled: true },
      noData: { enabled: false, forDuration: '10m' },
      resolved: { enabled: false },
    },
    exclusionWindows: [],
    labels: {},
    annotations: {},
    ...overrides,
  };
}

describe('normalizeSloSpec — alarms defaulting', () => {
  it('fills every missing alarm key with its default', () => {
    const raw = validSpec({
      // Simulate a spec persisted by an older plugin version that didn't
      // yet know about `resolved` or `noData`.
      alarms: ({ budgetWarning: { enabled: true } } as unknown) as SloSpec['alarms'],
    });
    const out = normalizeSloSpec(raw);
    expect(out.alarms.budgetWarning.enabled).toBe(true);
    expect(out.alarms.sliHealth.enabled).toBe(false);
    expect(out.alarms.attainmentBreach.enabled).toBe(false);
    expect(out.alarms.noData.enabled).toBe(false);
    expect(out.alarms.noData.forDuration).toBe('10m');
    expect(out.alarms.resolved.enabled).toBe(false);
  });

  it('preserves explicit values when present', () => {
    const raw = validSpec({
      alarms: {
        sliHealth: { enabled: true },
        attainmentBreach: { enabled: true },
        budgetWarning: { enabled: false },
        noData: { enabled: true, forDuration: '30m' },
        resolved: { enabled: true },
      },
    });
    const out = normalizeSloSpec(raw);
    expect(out.alarms).toEqual(raw.alarms);
  });

  it('is idempotent on an already-normalized spec', () => {
    const a = normalizeSloSpec(validSpec());
    const b = normalizeSloSpec(a);
    expect(a.alarms).toEqual(b.alarms);
  });

  it('never mutates the input spec', () => {
    const raw = validSpec();
    const before = JSON.stringify(raw);
    normalizeSloSpec(raw);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it('handles an entirely absent `alarms` object', () => {
    const raw = { ...validSpec(), alarms: (undefined as unknown) as SloSpec['alarms'] };
    const out = normalizeSloSpec(raw);
    expect(out.alarms.budgetWarning.enabled).toBe(true);
    expect(out.alarms.noData.forDuration).toBe('10m');
  });
});

describe('SloService.create — write-boundary spec stripping (SLO_SPEC_KEYS allow-list)', () => {
  const noopLogger = (): Logger => ({
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  });

  // Local override: the file-level `validSpec` uses an empty `dimensions`
  // array (fine for the read-boundary tests above, which never validate)
  // but `SloService.create` runs the validator, which requires at least
  // one dimension on a non-custom prometheus SLI.
  const creatableSpec = (overrides: Partial<SloSpec> = {}): SloSpec => ({
    ...validSpec(),
    sli: {
      type: 'single',
      definition: {
        backend: 'prometheus',
        type: 'availability',
        calcMethod: 'events',
        metric: 'http_requests_total',
        goodEventsFilter: 'status_code!~"5.."',
      },
      dimensions: [{ name: 'service', value: 'api' }],
    },
    ...overrides,
  });

  it('drops unknown top-level keys before persistence', async () => {
    const svc = new SloService(noopLogger(), new InMemorySloStore());
    // Route-level schema is `unknowns: 'allow'` so a forward-compat client
    // can send keys we don't yet model. The service must not round-trip
    // those into saved-object attributes.
    const spec = ({
      ...creatableSpec(),
      futureFlag: 'should-not-persist',
      randomNonce: 42,
    } as unknown) as SloSpec;
    const doc = await svc.create({ spec });
    expect(doc.spec).not.toHaveProperty('futureFlag');
    expect(doc.spec).not.toHaveProperty('randomNonce');
    // Sanity: a known key still survives.
    expect(doc.spec.name).toBe(spec.name);
  });

  it('does not round-trip a JSON-parsed `__proto__` own-property into the persisted spec', async () => {
    const svc = new SloService(noopLogger(), new InMemorySloStore());
    // A malicious client posts JSON with a literal `__proto__` key.
    // `JSON.parse` (unlike object-literal `__proto__:` syntax) creates an
    // own enumerable property. The service's allow-list normalizer must
    // strip it before it lands as a saved-object attribute.
    const base = creatableSpec();
    const malicious = JSON.parse(
      `{"__proto__":{"polluted":"yes"},"name":${JSON.stringify(base.name)}}`
    ) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(malicious, '__proto__')).toBe(true);

    const spec = ({ ...base, ...malicious } as unknown) as SloSpec;
    const doc = await svc.create({ spec });
    expect(Object.prototype.hasOwnProperty.call(doc.spec, '__proto__')).toBe(false);
    // No prototype pollution: a fresh object must not see the injected key.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
