/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit coverage for `common/slo/slo_datasource_ref.ts` — the shared id-or-
 * name resolution helper introduced to consolidate the pattern that Bug A
 * (listing filter, commit b02e33d9), Bug D (reconciler filter, commit
 * 689acd80), and Bug E (recover match, commit ace8037d) each independently
 * rediscovered during bug bash v3.
 *
 * Every caller-shape input is covered: the internal `ds-N` id, the
 * SQL-plugin `directQueryName` / connectionId, the display `name`, and an
 * unknown input (→ null, no throw).
 */

import type { Datasource } from '../../types/alerting';
import {
  refFromDatasource,
  resolveDatasourceRef,
  resolveDatasourceRefs,
} from '../slo_datasource_ref';

function makeDatasource(overrides: Partial<Datasource> = {}): Datasource {
  return {
    id: 'ds-4',
    name: 'ObservabilityStack_Prometheus',
    type: 'prometheus',
    url: 'http://prometheus:9090/prometheus',
    enabled: true,
    directQueryName: 'observability_stack_cortex',
    ...overrides,
  };
}

function buildResolver(records: Datasource[]) {
  return async (raw: string) => {
    return records.find((r) => r.id === raw || r.name === raw || r.directQueryName === raw) ?? null;
  };
}

describe('resolveDatasourceRef', () => {
  const ds = makeDatasource();
  const resolver = buildResolver([ds]);

  it('resolves against the internal ds-N id', async () => {
    const ref = await resolveDatasourceRef('ds-4', resolver);
    expect(ref).not.toBeNull();
    expect(ref!.id).toBe('ds-4');
    expect(ref!.name).toBe('ObservabilityStack_Prometheus');
    expect(ref!.connectionId).toBe('observability_stack_cortex');
    expect(ref!.forms).toEqual([
      'ds-4',
      'ObservabilityStack_Prometheus',
      'observability_stack_cortex',
    ]);
    expect(ref!.datasource).toBe(ds);
  });

  it('resolves against the display name', async () => {
    const ref = await resolveDatasourceRef('ObservabilityStack_Prometheus', resolver);
    expect(ref).not.toBeNull();
    expect(ref!.id).toBe('ds-4');
    expect(ref!.name).toBe('ObservabilityStack_Prometheus');
  });

  it('resolves against the SQL-plugin connectionId (directQueryName)', async () => {
    const ref = await resolveDatasourceRef('observability_stack_cortex', resolver);
    expect(ref).not.toBeNull();
    expect(ref!.connectionId).toBe('observability_stack_cortex');
    expect(ref!.forms).toContain('observability_stack_cortex');
  });

  it('returns null for unknown input (no throw)', async () => {
    const ref = await resolveDatasourceRef('totally-fake-ds', resolver);
    expect(ref).toBeNull();
  });

  it('treats a resolver returning undefined the same as null', async () => {
    const undefinedResolver = async () => undefined;
    const ref = await resolveDatasourceRef('ds-4', undefinedResolver);
    expect(ref).toBeNull();
  });

  it('re-throws resolver errors instead of swallowing to null', async () => {
    const throwingResolver = async () => {
      throw new Error('registry offline');
    };
    await expect(resolveDatasourceRef('ds-4', throwingResolver)).rejects.toThrow(
      'registry offline'
    );
  });

  it('omits undefined / blank forms (connectionId absent)', async () => {
    const userManaged = makeDatasource({
      id: 'ds-9',
      name: 'UserManaged',
      directQueryName: undefined,
    });
    const ref = await resolveDatasourceRef('ds-9', buildResolver([userManaged]));
    expect(ref).not.toBeNull();
    expect(ref!.connectionId).toBeUndefined();
    expect(ref!.forms).toEqual(['ds-9', 'UserManaged']);
  });

  it('deduplicates when id and name collide (edge case)', async () => {
    const identicallyNamed = makeDatasource({ id: 'same', name: 'same' });
    const ref = await resolveDatasourceRef('same', buildResolver([identicallyNamed]));
    expect(ref).not.toBeNull();
    expect(ref!.forms).toEqual(['same', 'observability_stack_cortex']);
  });
});

describe('refFromDatasource', () => {
  it('builds the envelope directly from an already-resolved Datasource', () => {
    const ref = refFromDatasource(makeDatasource());
    expect(ref.id).toBe('ds-4');
    expect(ref.name).toBe('ObservabilityStack_Prometheus');
    expect(ref.connectionId).toBe('observability_stack_cortex');
    expect(ref.forms).toEqual([
      'ds-4',
      'ObservabilityStack_Prometheus',
      'observability_stack_cortex',
    ]);
  });

  it('produces forms suitable for equality checks against caller input / provenance', () => {
    // Mirrors the SloService.recover match path: both provenance
    // (historical `ds-N`) and user input (the name) must resolve against
    // the same deploy datasource.
    const ref = refFromDatasource(makeDatasource());
    const forms = new Set(ref.forms);
    expect(forms.has('ds-4')).toBe(true); // provenance-recorded form
    expect(forms.has('ObservabilityStack_Prometheus')).toBe(true); // UI form
  });
});

describe('resolveDatasourceRefs (batch)', () => {
  const ds1 = makeDatasource({ id: 'ds-4', name: 'ObservabilityStack_Prometheus' });
  const ds2 = makeDatasource({
    id: 'ds-5',
    name: 'Secondary_Prometheus',
    directQueryName: 'secondary_cortex',
  });
  const resolver = buildResolver([ds1, ds2]);

  it('resolves every entry + preserves input order', async () => {
    const refs = await resolveDatasourceRefs(['ds-5', 'ObservabilityStack_Prometheus'], resolver);
    expect(refs.map((r) => r.id)).toEqual(['ds-5', 'ds-4']);
  });

  it('drops unresolved entries and fires the onUnresolved callback with the raw value', async () => {
    const unresolved: string[] = [];
    const refs = await resolveDatasourceRefs(['ds-4', 'mystery'], resolver, (raw) =>
      unresolved.push(raw)
    );
    expect(refs.map((r) => r.id)).toEqual(['ds-4']);
    expect(unresolved).toEqual(['mystery']);
  });

  it('routes resolver errors through onUnresolved (no uncaught)', async () => {
    const throwing = async (raw: string) => {
      if (raw === 'boom') throw new Error('transport');
      return ds1;
    };
    const errors: Array<[string, unknown]> = [];
    const refs = await resolveDatasourceRefs(['ds-4', 'boom'], throwing, (raw, err) =>
      errors.push([raw, err])
    );
    expect(refs).toHaveLength(1);
    expect(errors[0][0]).toBe('boom');
    expect(errors[0][1]).toBeInstanceOf(Error);
  });
});
