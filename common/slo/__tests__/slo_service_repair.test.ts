/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SloService.repair tests.
 *
 * Pins the repair algorithm:
 *   1. Healthy SLO → no ruler upsert, { repaired: false }.
 *   2. rules_missing / rules_partial → one ruler upsert + re-probe, { repaired: true }.
 *   3. ruler_unreachable → throws SloRulerError (route maps to 502).
 *   4. Unknown id → SloNotFoundError.
 *   5. Idempotence: second repair on a now-healthy SLO issues no upsert.
 */

import {
  RuleHealthReportLite,
  SloNotFoundError,
  SloRepairContext,
  SloRulerClient,
  SloRulerError,
  SloRuleHealthProbe,
  SloService,
} from '../slo_service';
import { DEFAULT_MWMBR_TIERS } from '../slo_promql_generator';
import type { AlertingOSClient, Datasource, Logger } from '../../types/alerting';
import type { GeneratedRuleGroup, ISloStore, SloDocument, SloSpec } from '../slo_types';

function noopLogger(): Logger {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  };
}

function validSpec(overrides: Partial<SloSpec> = {}): SloSpec {
  return {
    datasourceId: 'prom-ds-001',
    name: `API Availability ${Math.random().toString(36).slice(2, 8)}`,
    enabled: true,
    mode: 'active',
    service: 'api-gateway',
    owner: { teams: ['platform'] },
    sli: {
      type: 'single',
      definition: {
        backend: 'prometheus',
        type: 'availability',
        calcMethod: 'events',
        metric: 'http_requests_total',
      },
      dimensions: [{ name: 'service', value: 'api-gateway' }],
    },
    objectives: [{ name: 'availability-99-9', target: 0.999 }],
    budgetWarningThresholds: [{ threshold: 0.5, severity: 'warning' }],
    window: { type: 'rolling', duration: '28d' },
    alerting: { strategy: 'mwmbr', burnRates: DEFAULT_MWMBR_TIERS.map((t) => ({ ...t })) },
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

/**
 * Build ruler + store + health-probe mocks. The store/ruler doubles match
 * `slo_service_ruler.test.ts` so test behavior stays consistent across the
 * repair test surface.
 */
function makeDeps() {
  const saved = new Map<string, SloDocument>();
  const store: ISloStore & { save: jest.Mock; delete: jest.Mock; get: jest.Mock } = {
    get: jest.fn(async (id: string) => saved.get(id) ?? null),
    list: jest.fn(async () => Array.from(saved.values())),
    save: jest.fn(async (doc: SloDocument) => {
      saved.set(doc.id, doc);
    }),
    delete: jest.fn(async (id: string) => saved.delete(id)),
  };

  const ruler: SloRulerClient & {
    upsertRuleGroup: jest.Mock;
    deleteRuleGroup: jest.Mock;
  } = {
    upsertRuleGroup: jest.fn(
      async (_c: AlertingOSClient, _ds: Datasource, _ns: string, _g: GeneratedRuleGroup) => {
        // no-op
      }
    ),
    deleteRuleGroup: jest.fn(async () => undefined),
  };

  const datasource: Datasource = {
    id: 'prom-ds-001',
    name: 'prom',
    type: 'prometheus',
    url: '',
    enabled: true,
    directQueryName: 'prom-connection',
  };
  const client = ({ transport: { request: jest.fn() } } as unknown) as AlertingOSClient;

  const deploy = {
    ruler,
    client,
    datasource,
    workspaceId: 'ws-unit',
  };

  return { ruler, store, deploy, saved };
}

/**
 * Build a scripted rule-health probe: the caller supplies the sequence of
 * reports the probe should return on successive `check()` calls. `invalidate`
 * is a simple jest.fn so tests can assert it was called between pre- and
 * post-repair checks.
 */
function makeHealthProbe(
  reports: RuleHealthReportLite[]
): SloRuleHealthProbe & {
  checkCalls: jest.Mock;
  invalidateCalls: jest.Mock;
} {
  const checkCalls = jest.fn();
  const invalidateCalls = jest.fn();
  let idx = 0;
  const probe: SloRuleHealthProbe = {
    check: async (input) => {
      checkCalls(input);
      const report = reports[Math.min(idx, reports.length - 1)];
      idx += 1;
      return report;
    },
    invalidate: (ws: string, dsId: string, sloId: string) => {
      invalidateCalls(ws, dsId, sloId);
    },
  };
  return Object.assign(probe, { checkCalls, invalidateCalls });
}

function okReport(expectedGroups: string[]): RuleHealthReportLite {
  return {
    state: 'ok',
    expectedGroups,
    presentGroups: expectedGroups,
    missingGroups: [],
    computedAt: '2026-04-28T00:00:00Z',
  };
}

function missingReport(expectedGroups: string[]): RuleHealthReportLite {
  return {
    state: 'rules_missing',
    expectedGroups,
    presentGroups: [],
    missingGroups: expectedGroups,
    computedAt: '2026-04-28T00:00:00Z',
  };
}

function partialReport(expectedGroups: string[], present: string[]): RuleHealthReportLite {
  return {
    state: 'rules_partial',
    expectedGroups,
    presentGroups: present,
    missingGroups: expectedGroups.filter((g) => !present.includes(g)),
    computedAt: '2026-04-28T00:00:00Z',
  };
}

function unreachableReport(
  expectedGroups: string[],
  code: 'RULER_UNREACHABLE' | 'RULER_AUTH_FAILED' | 'RULER_VALIDATION_FAILED' = 'RULER_UNREACHABLE'
): RuleHealthReportLite {
  return {
    state: 'ruler_unreachable',
    expectedGroups,
    presentGroups: [],
    missingGroups: [],
    rulerErrorCode: code,
    computedAt: '2026-04-28T00:00:00Z',
  };
}

describe('SloService.repair', () => {
  it('returns { repaired: false } and issues no upsert when the probe reports ok', async () => {
    const { ruler, store, deploy } = makeDeps();
    const svc = new SloService(noopLogger(), store);
    svc.setDedupEnabled(false);
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);
    ruler.upsertRuleGroup.mockClear();

    const expected = [
      doc.status.provisioning.backend === 'prometheus' && doc.status.provisioning.alertGroupName
        ? doc.status.provisioning.alertGroupName
        : '',
    ];
    const health = makeHealthProbe([okReport(expected)]);

    const ctx: SloRepairContext = { health, deploy };
    const result = await svc.repair(doc.id, ctx);

    expect(result.repaired).toBe(false);
    expect(result.sloId).toBe(doc.id);
    expect(result.health.state).toBe('ok');
    expect(ruler.upsertRuleGroup).not.toHaveBeenCalled();
    expect(health.checkCalls).toHaveBeenCalledTimes(1);
    expect(health.invalidateCalls).not.toHaveBeenCalled();
  });

  it('upserts once and returns { repaired: true, health.state=ok } on rules_missing', async () => {
    const { ruler, store, deploy } = makeDeps();
    const svc = new SloService(noopLogger(), store);
    svc.setDedupEnabled(false);
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);
    ruler.upsertRuleGroup.mockClear();

    const expected = [
      doc.status.provisioning.backend === 'prometheus' && doc.status.provisioning.alertGroupName
        ? doc.status.provisioning.alertGroupName
        : '',
    ];
    const health = makeHealthProbe([missingReport(expected), okReport(expected)]);

    const result = await svc.repair(doc.id, { health, deploy });

    expect(result.repaired).toBe(true);
    expect(result.health.state).toBe('ok');
    expect(ruler.upsertRuleGroup).toHaveBeenCalledTimes(1);
    const upsertCall = ruler.upsertRuleGroup.mock.calls[0];
    expect(upsertCall[2]).toBe(
      doc.status.provisioning.backend === 'prometheus' ? doc.status.provisioning.rulerNamespace : ''
    );
    expect((upsertCall[3] as GeneratedRuleGroup).groupName).toBe(expected[0]);
    expect(health.checkCalls).toHaveBeenCalledTimes(2);
    expect(health.invalidateCalls).toHaveBeenCalledTimes(1);
    expect(health.invalidateCalls).toHaveBeenCalledWith('ws-unit', 'prom-ds-001', doc.id);
  });

  it('upserts once on rules_partial and returns the post-repair report', async () => {
    const { ruler, store, deploy } = makeDeps();
    const svc = new SloService(noopLogger(), store);
    svc.setDedupEnabled(false);
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);
    ruler.upsertRuleGroup.mockClear();

    const expected = [
      doc.status.provisioning.backend === 'prometheus' && doc.status.provisioning.alertGroupName
        ? doc.status.provisioning.alertGroupName
        : '',
    ];
    const health = makeHealthProbe([partialReport(expected, []), okReport(expected)]);

    const result = await svc.repair(doc.id, { health, deploy });

    expect(result.repaired).toBe(true);
    expect(result.health.state).toBe('ok');
    expect(ruler.upsertRuleGroup).toHaveBeenCalledTimes(1);
  });

  it('throws SloRulerError (route maps to 502) on ruler_unreachable — no upsert', async () => {
    const { ruler, store, deploy } = makeDeps();
    const svc = new SloService(noopLogger(), store);
    svc.setDedupEnabled(false);
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);
    ruler.upsertRuleGroup.mockClear();

    const expected = [
      doc.status.provisioning.backend === 'prometheus' && doc.status.provisioning.alertGroupName
        ? doc.status.provisioning.alertGroupName
        : '',
    ];
    const health = makeHealthProbe([unreachableReport(expected)]);

    await expect(svc.repair(doc.id, { health, deploy })).rejects.toMatchObject({
      name: 'SloRulerError',
      code: 'RULER_UNREACHABLE',
    });
    expect(ruler.upsertRuleGroup).not.toHaveBeenCalled();
  });

  it('propagates the probe-reported code on ruler_unreachable (e.g. RULER_AUTH_FAILED)', async () => {
    const { store, deploy, ruler } = makeDeps();
    const svc = new SloService(noopLogger(), store);
    svc.setDedupEnabled(false);
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);
    ruler.upsertRuleGroup.mockClear();

    const expected = [
      doc.status.provisioning.backend === 'prometheus' && doc.status.provisioning.alertGroupName
        ? doc.status.provisioning.alertGroupName
        : '',
    ];
    const health = makeHealthProbe([unreachableReport(expected, 'RULER_AUTH_FAILED')]);

    await expect(svc.repair(doc.id, { health, deploy })).rejects.toBeInstanceOf(SloRulerError);
    await expect(
      svc.repair(doc.id, {
        health: makeHealthProbe([unreachableReport(expected, 'RULER_AUTH_FAILED')]),
        deploy,
      })
    ).rejects.toMatchObject({
      code: 'RULER_AUTH_FAILED',
    });
  });

  it('throws SloNotFoundError when the SLO id is unknown', async () => {
    const { store, deploy } = makeDeps();
    const svc = new SloService(noopLogger(), store);
    svc.setDedupEnabled(false);
    const health = makeHealthProbe([okReport([])]);

    await expect(svc.repair('not-a-real-id', { health, deploy })).rejects.toBeInstanceOf(
      SloNotFoundError
    );
  });

  it('idempotence: two back-to-back repairs on a healthy SLO issue zero upserts', async () => {
    const { ruler, store, deploy } = makeDeps();
    const svc = new SloService(noopLogger(), store);
    svc.setDedupEnabled(false);
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);
    ruler.upsertRuleGroup.mockClear();

    const expected = [
      doc.status.provisioning.backend === 'prometheus' && doc.status.provisioning.alertGroupName
        ? doc.status.provisioning.alertGroupName
        : '',
    ];
    // Three ok reports — one per check call across two repair invocations.
    // First repair probes once (returns ok, short-circuits). Second repair
    // also probes once, returns ok again.
    const health = makeHealthProbe([okReport(expected), okReport(expected)]);

    const r1 = await svc.repair(doc.id, { health, deploy });
    const r2 = await svc.repair(doc.id, { health, deploy });

    expect(r1.repaired).toBe(false);
    expect(r2.repaired).toBe(false);
    expect(ruler.upsertRuleGroup).not.toHaveBeenCalled();
    expect(health.checkCalls).toHaveBeenCalledTimes(2);
    expect(health.invalidateCalls).not.toHaveBeenCalled();
  });

  it('first repair flips a missing group to healthy; second repair is a no-op', async () => {
    const { ruler, store, deploy } = makeDeps();
    const svc = new SloService(noopLogger(), store);
    svc.setDedupEnabled(false);
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);
    ruler.upsertRuleGroup.mockClear();

    const expected = [
      doc.status.provisioning.backend === 'prometheus' && doc.status.provisioning.alertGroupName
        ? doc.status.provisioning.alertGroupName
        : '',
    ];
    // Sequence: missing → ok (post-repair) → ok (second repair pre-check).
    const health = makeHealthProbe([
      missingReport(expected),
      okReport(expected),
      okReport(expected),
    ]);

    const first = await svc.repair(doc.id, { health, deploy });
    const second = await svc.repair(doc.id, { health, deploy });

    expect(first.repaired).toBe(true);
    expect(first.health.state).toBe('ok');
    expect(second.repaired).toBe(false);
    expect(ruler.upsertRuleGroup).toHaveBeenCalledTimes(1);
  });
});
