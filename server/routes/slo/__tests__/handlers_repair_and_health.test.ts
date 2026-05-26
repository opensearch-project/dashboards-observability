/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Handler-level tests for repair + rule_health.
 *
 * Framework-agnostic: exercises `handleRepairSLO` / `handleGetRuleHealth`
 * directly (no router), so the surface under test is the request→service
 * mapping + HTTP status translation for error cases.
 */

import { handleGetRuleHealth, handleRepairSLO } from '../handlers';
import {
  RuleHealthReportLite,
  SloDeployContext,
  SloRulerClient,
  SloRulerError,
  SloRuleHealthProbe,
  SloService,
} from '../../../../common/slo/slo_service';
import { DEFAULT_MWMBR_TIERS } from '../../../../common/slo/slo_promql_generator';
import type { AlertingOSClient, Datasource, Logger } from '../../../../common/types/alerting';
import type {
  GeneratedRuleGroup,
  ISloStore,
  SloDocument,
  SloSpec,
} from '../../../../common/slo/slo_types';

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

function makeStore() {
  const saved = new Map<string, SloDocument>();
  const store: ISloStore & { save: jest.Mock; delete: jest.Mock; get: jest.Mock } = {
    get: jest.fn(async (id: string) => saved.get(id) ?? null),
    list: jest.fn(async () => Array.from(saved.values())),
    save: jest.fn(async (doc: SloDocument) => {
      saved.set(doc.id, doc);
    }),
    delete: jest.fn(async (id: string) => saved.delete(id)),
  };
  return { store, saved };
}

function makeRuler() {
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
  return ruler;
}

function makeDeploy(ruler: SloRulerClient): SloDeployContext {
  const datasource: Datasource = {
    id: 'prom-ds-001',
    name: 'prom',
    type: 'prometheus',
    url: '',
    enabled: true,
    directQueryName: 'prom-connection',
  };
  const client = ({ transport: { request: jest.fn() } } as unknown) as AlertingOSClient;
  return { ruler, client, datasource, workspaceId: 'ws-unit' };
}

function makeHealth(
  reports: RuleHealthReportLite[]
): SloRuleHealthProbe & {
  check: jest.Mock;
  invalidate: jest.Mock;
} {
  let idx = 0;
  const check = jest.fn(async () => {
    const r = reports[Math.min(idx, reports.length - 1)];
    idx += 1;
    return r;
  });
  const invalidate = jest.fn();
  return { check, invalidate };
}

function okReport(groups: string[]): RuleHealthReportLite {
  return {
    state: 'ok',
    expectedGroups: groups,
    presentGroups: groups,
    missingGroups: [],
    computedAt: '2026-04-28T00:00:00Z',
  };
}

function missingReport(groups: string[]): RuleHealthReportLite {
  return {
    state: 'rules_missing',
    expectedGroups: groups,
    presentGroups: [],
    missingGroups: groups,
    computedAt: '2026-04-28T00:00:00Z',
  };
}

describe('handleRepairSLO', () => {
  it('returns 200 + SloRepairResult on success', async () => {
    const { store } = makeStore();
    const ruler = makeRuler();
    const deploy = makeDeploy(ruler);
    const svc = new SloService(noopLogger(), store);
    // Pin the single-group contract — these handler tests assert on a single
    // upsert. Dedup-path handler coverage lives in
    // `common/slo/__tests__/slo_service_repair_integration.test.ts`.
    svc.setDedupEnabled(false);
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);
    ruler.upsertRuleGroup.mockClear();
    const groups =
      doc.status.provisioning.backend === 'prometheus'
        ? [doc.status.provisioning.alertGroupName ?? '']
        : [];
    const health = makeHealth([missingReport(groups), okReport(groups)]);

    const result = await handleRepairSLO(svc, doc.id, noopLogger(), { health, deploy });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      sloId: doc.id,
      repaired: true,
      health: { state: 'ok' },
    });
    expect(ruler.upsertRuleGroup).toHaveBeenCalledTimes(1);
  });

  it('returns 200 + repaired=false when the probe reports ok', async () => {
    const { store } = makeStore();
    const ruler = makeRuler();
    const deploy = makeDeploy(ruler);
    const svc = new SloService(noopLogger(), store);
    // Pin the single-group contract — these handler tests assert on a single
    // upsert. Dedup-path handler coverage lives in
    // `common/slo/__tests__/slo_service_repair_integration.test.ts`.
    svc.setDedupEnabled(false);
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);
    ruler.upsertRuleGroup.mockClear();
    const groups =
      doc.status.provisioning.backend === 'prometheus'
        ? [doc.status.provisioning.alertGroupName ?? '']
        : [];
    const health = makeHealth([okReport(groups)]);

    const result = await handleRepairSLO(svc, doc.id, noopLogger(), { health, deploy });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ sloId: doc.id, repaired: false });
    expect(ruler.upsertRuleGroup).not.toHaveBeenCalled();
  });

  it('returns 404 when the SLO does not exist', async () => {
    const { store } = makeStore();
    const ruler = makeRuler();
    const deploy = makeDeploy(ruler);
    const svc = new SloService(noopLogger(), store);
    const groups: string[] = [];
    const health = makeHealth([okReport(groups)]);

    const result = await handleRepairSLO(svc, 'nope', noopLogger(), { health, deploy });

    expect(result.status).toBe(404);
  });

  it('returns 502 when the probe reports ruler_unreachable (SloRulerError mapping)', async () => {
    const { store } = makeStore();
    const ruler = makeRuler();
    const deploy = makeDeploy(ruler);
    const svc = new SloService(noopLogger(), store);
    // Pin the single-group contract — these handler tests assert on a single
    // upsert. Dedup-path handler coverage lives in
    // `common/slo/__tests__/slo_service_repair_integration.test.ts`.
    svc.setDedupEnabled(false);
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);
    const groups =
      doc.status.provisioning.backend === 'prometheus'
        ? [doc.status.provisioning.alertGroupName ?? '']
        : [];
    const health = makeHealth([
      {
        state: 'ruler_unreachable',
        expectedGroups: groups,
        presentGroups: [],
        missingGroups: [],
        rulerErrorCode: 'RULER_UNREACHABLE',
        computedAt: '2026-04-28T00:00:00Z',
      },
    ]);

    const result = await handleRepairSLO(svc, doc.id, noopLogger(), { health, deploy });

    // toSloError maps httpStatus 0 → 503 (upstream unavailable / transport
    // failure). Fixed in PR 1 review-cycle 3 (L-4 — 0 was previously 502).
    expect(result.status).toBe(503);
    expect(result.body).toMatchObject({ code: 'RULER_UNREACHABLE' });
  });

  it('returns 501 when no rule-health checker is configured', async () => {
    const { store } = makeStore();
    const ruler = makeRuler();
    const deploy = makeDeploy(ruler);
    const svc = new SloService(noopLogger(), store);
    // Pin the single-group contract — these handler tests assert on a single
    // upsert. Dedup-path handler coverage lives in
    // `common/slo/__tests__/slo_service_repair_integration.test.ts`.
    svc.setDedupEnabled(false);
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);

    const result = await handleRepairSLO(svc, doc.id, noopLogger(), { deploy });

    expect(result.status).toBe(501);
  });

  it('surfaces SloRulerError thrown directly from the ruler via the standard mapping', async () => {
    const { store } = makeStore();
    const ruler = makeRuler();
    ruler.upsertRuleGroup.mockRejectedValueOnce(
      new SloRulerError('RULER_VALIDATION_FAILED', 400, 'bad promql')
    );
    const deploy = makeDeploy(ruler);
    const svc = new SloService(noopLogger(), store);
    const doc = await svc.create({ spec: validSpec() }, 'alice', makeDeploy(makeRuler()));
    const groups =
      doc.status.provisioning.backend === 'prometheus'
        ? [doc.status.provisioning.alertGroupName ?? '']
        : [];
    const health = makeHealth([missingReport(groups)]);

    const result = await handleRepairSLO(svc, doc.id, noopLogger(), { health, deploy });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ code: 'RULER_VALIDATION_FAILED' });
  });
});

describe('handleGetRuleHealth', () => {
  it('returns 200 + RuleHealthResponse on success', async () => {
    const { store } = makeStore();
    const ruler = makeRuler();
    const deploy = makeDeploy(ruler);
    const svc = new SloService(noopLogger(), store);
    // Pin the single-group contract — these handler tests assert on a single
    // upsert. Dedup-path handler coverage lives in
    // `common/slo/__tests__/slo_service_repair_integration.test.ts`.
    svc.setDedupEnabled(false);
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);
    const groups =
      doc.status.provisioning.backend === 'prometheus'
        ? [doc.status.provisioning.alertGroupName ?? '']
        : [];
    const health = makeHealth([okReport(groups)]);

    const result = await handleGetRuleHealth(svc, doc.id, noopLogger(), { health, deploy });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      sloId: doc.id,
      state: 'ok',
      expectedGroups: groups,
      presentGroups: groups,
      missingGroups: [],
      computedAt: expect.any(String),
    });
    expect(health.check).toHaveBeenCalledTimes(1);
  });

  it('returns 200 + state=rules_missing + missingGroups populated', async () => {
    const { store } = makeStore();
    const ruler = makeRuler();
    const deploy = makeDeploy(ruler);
    const svc = new SloService(noopLogger(), store);
    // Pin the single-group contract — these handler tests assert on a single
    // upsert. Dedup-path handler coverage lives in
    // `common/slo/__tests__/slo_service_repair_integration.test.ts`.
    svc.setDedupEnabled(false);
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);
    const groups =
      doc.status.provisioning.backend === 'prometheus'
        ? [doc.status.provisioning.alertGroupName ?? '']
        : [];
    const health = makeHealth([missingReport(groups)]);

    const result = await handleGetRuleHealth(svc, doc.id, noopLogger(), { health, deploy });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      sloId: doc.id,
      state: 'rules_missing',
      missingGroups: groups,
    });
  });

  it('returns 404 when the SLO is missing', async () => {
    const { store } = makeStore();
    const ruler = makeRuler();
    const deploy = makeDeploy(ruler);
    const svc = new SloService(noopLogger(), store);
    const health = makeHealth([okReport([])]);

    const result = await handleGetRuleHealth(svc, 'nope', noopLogger(), { health, deploy });

    expect(result.status).toBe(404);
  });

  it('returns 501 when no rule-health checker is configured', async () => {
    const { store } = makeStore();
    const ruler = makeRuler();
    const deploy = makeDeploy(ruler);
    const svc = new SloService(noopLogger(), store);
    // Pin the single-group contract — these handler tests assert on a single
    // upsert. Dedup-path handler coverage lives in
    // `common/slo/__tests__/slo_service_repair_integration.test.ts`.
    svc.setDedupEnabled(false);
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);

    const result = await handleGetRuleHealth(svc, doc.id, noopLogger(), { deploy });

    expect(result.status).toBe(501);
  });
});
