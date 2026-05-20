/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SLO_V2_MIGRATION_VERSION, sloV2Migration } from '../slo_v2';
import type { SloDocument } from '../../../../common/slo/slo_types';

function v1Doc(
  overrides: {
    id?: string;
    objectives?: Array<{ name: string; target: number }>;
    backend?: 'prometheus' | 'opensearch';
    compositeSli?: boolean;
  } = {}
) {
  const id = overrides.id ?? 'slo-abc';
  const objectives = overrides.objectives ?? [{ name: 'availability-99-9', target: 0.999 }];
  const backend = overrides.backend ?? 'prometheus';

  const sli: SloDocument['spec']['sli'] = overrides.compositeSli
    ? { type: 'composite', operator: 'all', members: [] }
    : {
        type: 'single',
        definition:
          backend === 'prometheus'
            ? {
                backend: 'prometheus',
                type: 'availability',
                calcMethod: 'events',
                metric: 'http_requests_total',
              }
            : {
                backend: 'opensearch',
                type: 'ratio',
                calcMethod: 'events',
                index: 'idx',
                goodQuery: {},
              },
        dimensions: [{ name: 'service', value: 'api-gateway' }],
      };

  const spec: SloDocument['spec'] = {
    datasourceId: 'prom-ds-001',
    name: 'API Availability',
    enabled: true,
    mode: 'active',
    service: 'api-gateway',
    owner: { teams: ['platform'] },
    sli,
    objectives,
    budgetWarningThresholds: [],
    window: { type: 'rolling', duration: '28d' },
    alerting: { strategy: 'mwmbr', burnRates: [] },
    alarms: {
      sliHealth: { enabled: false },
      attainmentBreach: { enabled: false },
      budgetWarning: { enabled: false },
      noData: { enabled: false, forDuration: '10m' },
      resolved: { enabled: false },
    },
    exclusionWindows: [],
    labels: {},
    annotations: {},
  };

  const status: SloDocument['status'] = {
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'alice',
    updatedAt: '2026-01-02T00:00:00.000Z',
    updatedBy: 'alice',
    provisioning: {
      backend: 'prometheus',
      rulerNamespace: 'slo-generated-prom-ds-001',
    },
  };

  return {
    id,
    attributes: { spec, status },
  };
}

describe('sloV2Migration', () => {
  it('exposes a stable migration version string', () => {
    expect(SLO_V2_MIGRATION_VERSION).toBe('2.0.0');
  });

  it('adds recordingFingerprints (one per objective), alertGroupName, and needsRedeploy', () => {
    const doc = v1Doc({
      objectives: [
        { name: 'availability-99-9', target: 0.999 },
        { name: 'availability-99', target: 0.99 },
      ],
    });
    const out = sloV2Migration(doc);
    const prov = out.attributes.status!.provisioning!;
    if (prov.backend !== 'prometheus') throw new Error('expected prometheus backend');
    expect(prov.recordingFingerprints).toBeDefined();
    expect(Object.keys(prov.recordingFingerprints!)).toEqual([
      'availability-99-9',
      'availability-99',
    ]);
    // Availability + latency-less objectives produce identical fingerprints in
    // this spec (target isn't included in fingerprint), so both map to same hex.
    for (const fp of Object.values(prov.recordingFingerprints!)) {
      expect(fp).toMatch(/^[0-9a-f]{16}$/);
    }
    expect(prov.alertGroupName).toMatch(/^slo:alerts:/);
    expect(prov.needsRedeploy).toBe(true);
  });

  it('preserves rulerNamespace while layering the dedup fields on top', () => {
    const doc = v1Doc();
    const out = sloV2Migration(doc);
    const prov = out.attributes.status!.provisioning!;
    if (prov.backend !== 'prometheus') throw new Error('expected prometheus backend');
    expect(prov.rulerNamespace).toBe('slo-generated-prom-ds-001');
    expect(prov.recordingFingerprints).toBeDefined();
    expect(prov.alertGroupName).toMatch(/^slo:alerts:/);
  });

  it('leaves other top-level attributes untouched', () => {
    const doc = v1Doc();
    const out = sloV2Migration(doc);
    expect(out.id).toBe(doc.id);
    expect(out.attributes.spec).toEqual(doc.attributes.spec);
    expect(out.attributes.status!.version).toBe(1);
    expect(out.attributes.status!.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('skips objectives whose fingerprint is null (composite / opensearch)', () => {
    const doc = v1Doc({ compositeSli: true });
    const out = sloV2Migration(doc);
    const prov = out.attributes.status!.provisioning!;
    if (prov.backend !== 'prometheus') throw new Error('expected prometheus backend');
    expect(prov.recordingFingerprints).toEqual({});
    // Alert group name is still emitted (composite SLOs still need alerts in Phase 4).
    expect(prov.alertGroupName).toMatch(/^slo:alerts:/);
  });

  it('is idempotent — re-applying yields an equal doc', () => {
    const first = sloV2Migration(v1Doc());
    const second = sloV2Migration(first);
    expect(second).toEqual(first);
  });

  it('returns the input unchanged when spec is missing', () => {
    const bad = {
      id: 'slo-bad',
      attributes: { status: v1Doc().attributes.status },
    };
    const warn = jest.fn();
    const out = sloV2Migration((bad as unknown) as ReturnType<typeof v1Doc>, {
      log: { warn },
    });
    expect(out).toBe(bad);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('returns the input unchanged when status is missing', () => {
    const bad = {
      id: 'slo-bad',
      attributes: { spec: v1Doc().attributes.spec },
    };
    const warn = jest.fn();
    const out = sloV2Migration((bad as unknown) as ReturnType<typeof v1Doc>, {
      log: { warn },
    });
    expect(out).toBe(bad);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('returns the input unchanged for non-prometheus provisioning backends', () => {
    const doc = v1Doc();
    (doc.attributes.status!.provisioning as { backend: string }).backend = 'opensearch';
    const out = sloV2Migration(doc);
    expect(out).toBe(doc);
  });
});
