/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Read-boundary normalizer — `normalizeSloSpec` fills missing `alarms.*`
 * keys with defaults so a future alarm type can land as a type + default-
 * filler change without a saved-object migration.
 */

import { normalizeSloSpec } from '../slo_service';
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
