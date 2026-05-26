/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SloService ruler-integration tests.
 *
 * Pins the dual-write contract for the single-group path. The dedup path
 * emits two groups per create and is covered separately by
 * `slo_service_dedup.test.ts`. These tests call `svc.setDedupEnabled(false)`
 * so they stay pointed at the single-group contract regardless of the
 * default-on flag.
 *
 *   - create/update: ruler-first, then SO
 *   - delete: ruler-first, then SO
 *   - ruler failure on create → SO never written, error propagates
 *   - SO failure after ruler OK → one best-effort ruler delete (compensation)
 *   - compensation failure → logs warning, rethrows original SO error
 *   - delete: ruler failure propagates; SO stays so user can retry
 *     (prevents a dangling rule group from silently evaluating dead alerts)
 *   - delete without deploy on an SLO with a rule group throws
 *     SloRulerTeardownRequiredError; route maps to 409
 *   - previewRules never touches ruler
 */

import {
  SloDeployContext,
  SloRulerClient,
  SloRulerError,
  SloRulerTeardownRequiredError,
  SloService,
  sloRulerNamespaceFor,
} from '../slo_service';
import { DEFAULT_MWMBR_TIERS } from '../slo_promql_generator';
import type { AlertingOSClient, Datasource, Logger } from '../../types/alerting';
import type { GeneratedRuleGroup, ISloStore, SloDocument, SloSpec } from '../slo_types';

function makeLogger(): Logger & { warnCalls: string[]; infoCalls: string[] } {
  const warnCalls: string[] = [];
  const infoCalls: string[] = [];
  return {
    info: (m: string) => {
      infoCalls.push(m);
    },
    warn: (m: string) => {
      warnCalls.push(m);
    },
    error: () => undefined,
    debug: () => undefined,
    warnCalls,
    infoCalls,
  } as Logger & { warnCalls: string[]; infoCalls: string[] };
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

interface CallLogEntry {
  op: 'ruler.upsert' | 'ruler.delete' | 'store.save' | 'store.delete';
  at: number;
  detail?: string;
}

/**
 * Build ruler + store mocks that share a call-order array so tests can
 * assert the ordering deterministically without pulling in jest-extended.
 */
function makeDeps() {
  const callLog: CallLogEntry[] = [];
  let nextSeq = 0;
  const tick = () => ++nextSeq;

  const ruler: SloRulerClient & {
    upsertRuleGroup: jest.Mock;
    deleteRuleGroup: jest.Mock;
  } = {
    upsertRuleGroup: jest.fn(async (_c, _ds, ns: string, g: GeneratedRuleGroup) => {
      callLog.push({ op: 'ruler.upsert', at: tick(), detail: `${ns}/${g.groupName}` });
    }),
    deleteRuleGroup: jest.fn(async (_c, _ds, ns: string, name: string) => {
      callLog.push({ op: 'ruler.delete', at: tick(), detail: `${ns}/${name}` });
    }),
  };

  const saved = new Map<string, SloDocument>();
  const store: ISloStore & { save: jest.Mock; delete: jest.Mock; get: jest.Mock } = {
    get: jest.fn(async (id: string) => saved.get(id) ?? null),
    list: jest.fn(async () => Array.from(saved.values())),
    save: jest.fn(async (doc: SloDocument) => {
      callLog.push({ op: 'store.save', at: tick(), detail: doc.id });
      saved.set(doc.id, doc);
    }),
    delete: jest.fn(async (id: string) => {
      callLog.push({ op: 'store.delete', at: tick(), detail: id });
      return saved.delete(id);
    }),
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

  const deploy: SloDeployContext = {
    ruler,
    client,
    datasource,
    workspaceId: 'ws-unit',
  };

  return { callLog, ruler, store, deploy };
}

describe('SloService.create with deploy (dual-write)', () => {
  it('calls ruler.upsertRuleGroup BEFORE store.save', async () => {
    const logger = makeLogger();
    const { callLog, ruler, store, deploy } = makeDeps();
    const svc = new SloService(logger, store);
    svc.setDedupEnabled(false);
    svc.setDedupEnabled(false);

    await svc.create({ spec: validSpec() }, 'alice', deploy);

    expect(ruler.upsertRuleGroup).toHaveBeenCalledTimes(1);
    expect(store.save).toHaveBeenCalledTimes(1);

    const upsertIdx = callLog.findIndex((e) => e.op === 'ruler.upsert');
    const saveIdx = callLog.findIndex((e) => e.op === 'store.save');
    expect(upsertIdx).toBeGreaterThanOrEqual(0);
    expect(saveIdx).toBeGreaterThan(upsertIdx);
  });

  it('uses slo-generated-<workspaceId> namespace and records it on the document', async () => {
    const { store, deploy } = makeDeps();
    const svc = new SloService(makeLogger(), store);
    svc.setDedupEnabled(false);
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);

    // The P0 provisioning shape is prometheus-only, so toMatchObject is safe
    // without narrowing — reading the fields through an `as` is the only way
    // to stay in the "unconditional expect" lint rule.
    expect(doc.status.provisioning).toMatchObject({
      backend: 'prometheus',
      rulerNamespace: 'slo-generated-ws-unit',
    });
    expect(sloRulerNamespaceFor('ws-unit')).toBe('slo-generated-ws-unit');
  });

  it('propagates SloRulerError and NEVER calls store.save', async () => {
    const { ruler, store, deploy } = makeDeps();
    ruler.upsertRuleGroup.mockRejectedValueOnce(
      new SloRulerError('RULER_VALIDATION_FAILED', 400, 'invalid PromQL')
    );
    const svc = new SloService(makeLogger(), store);
    svc.setDedupEnabled(false);

    await expect(svc.create({ spec: validSpec() }, 'alice', deploy)).rejects.toMatchObject({
      name: 'SloRulerError',
      code: 'RULER_VALIDATION_FAILED',
      httpStatus: 400,
    });
    expect(store.save).not.toHaveBeenCalled();
    expect(ruler.deleteRuleGroup).not.toHaveBeenCalled(); // no compensation needed
  });

  it('compensates with deleteRuleGroup when store.save fails after ruler success', async () => {
    const { callLog, ruler, store, deploy } = makeDeps();
    store.save.mockImplementationOnce(async () => {
      // record the call but don't actually save
      callLog.push({ op: 'store.save', at: Date.now(), detail: 'failed' });
      throw new Error('SO write failed: index rate limited');
    });
    const svc = new SloService(makeLogger(), store);
    svc.setDedupEnabled(false);

    await expect(svc.create({ spec: validSpec() }, 'alice', deploy)).rejects.toThrow(
      /SO write failed/
    );

    expect(ruler.upsertRuleGroup).toHaveBeenCalledTimes(1);
    expect(ruler.deleteRuleGroup).toHaveBeenCalledTimes(1);
    // Compensation targets the same (namespace, groupName) the upsert used
    const upsert = ruler.upsertRuleGroup.mock.calls[0];
    const del = ruler.deleteRuleGroup.mock.calls[0];
    expect(del[2]).toBe(upsert[2]); // namespace
    expect(del[3]).toBe((upsert[3] as GeneratedRuleGroup).groupName); // group name
  });

  it('swallows compensation failures and rethrows the ORIGINAL SO error', async () => {
    const logger = makeLogger();
    const { ruler, store, deploy } = makeDeps();
    const soErr = new Error('SO write failed: conflict');
    store.save.mockRejectedValueOnce(soErr);
    ruler.deleteRuleGroup.mockRejectedValueOnce(
      new SloRulerError('RULER_UNREACHABLE', 0, 'ECONNRESET')
    );
    const svc = new SloService(logger, store);
    svc.setDedupEnabled(false);

    await expect(svc.create({ spec: validSpec() }, 'alice', deploy)).rejects.toBe(soErr);
    // warning logged for the rollback failure
    expect(logger.warnCalls.some((m) => m.includes('rollback failed'))).toBe(true);
  });
});

describe('SloService.create without deploy (backward compat)', () => {
  it('skips ruler calls entirely', async () => {
    const { ruler, store } = makeDeps();
    const svc = new SloService(makeLogger(), store);
    svc.setDedupEnabled(false);
    await svc.create({ spec: validSpec() }, 'alice'); // no deploy arg

    expect(ruler.upsertRuleGroup).not.toHaveBeenCalled();
    expect(ruler.deleteRuleGroup).not.toHaveBeenCalled();
    expect(store.save).toHaveBeenCalledTimes(1);
  });
});

describe('SloService.update with deploy', () => {
  it('calls ruler.upsertRuleGroup before store.save on update', async () => {
    const { callLog, ruler, store, deploy } = makeDeps();
    const svc = new SloService(makeLogger(), store);
    svc.setDedupEnabled(false);
    const doc = await svc.create({ spec: validSpec() }, 'alice'); // create without deploy to avoid coupling
    ruler.upsertRuleGroup.mockClear();
    store.save.mockClear();
    callLog.length = 0;

    await svc.update(
      doc.id,
      { spec: { description: 'updated' }, version: doc.status.version },
      'alice',
      deploy
    );

    expect(ruler.upsertRuleGroup).toHaveBeenCalledTimes(1);
    expect(store.save).toHaveBeenCalledTimes(1);
    const upsertIdx = callLog.findIndex((e) => e.op === 'ruler.upsert');
    const saveIdx = callLog.findIndex((e) => e.op === 'store.save');
    expect(saveIdx).toBeGreaterThan(upsertIdx);
  });
});

describe('SloService.delete with deploy', () => {
  it('calls ruler.deleteRuleGroup BEFORE store.delete', async () => {
    // Ruler-first, SO-second: the SO is the only pointer back to the rule
    // group's name; if we drop it first and the ruler call fails, the group
    // lives on in Cortex forever, silently evaluating dead alerts. Ruler
    // confirmation must precede the SO removal so failures keep the SO.
    //
    // The create-via-deploy path provisions the rule group (without this,
    // needsRulerTeardown is false because ruleGroupName isn't populated).
    const { callLog, ruler, store, deploy } = makeDeps();
    const svc = new SloService(makeLogger(), store);
    svc.setDedupEnabled(false);
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);
    callLog.length = 0;
    ruler.upsertRuleGroup.mockClear();
    ruler.deleteRuleGroup.mockClear();

    await svc.delete(doc.id, deploy);

    const rulerIdx = callLog.findIndex((e) => e.op === 'ruler.delete');
    const storeIdx = callLog.findIndex((e) => e.op === 'store.delete');
    expect(rulerIdx).toBeGreaterThanOrEqual(0);
    expect(storeIdx).toBeGreaterThan(rulerIdx);
  });

  it('propagates ruler failure and leaves the SO intact so the user can retry', async () => {
    const { ruler, store, deploy } = makeDeps();
    const svc = new SloService(makeLogger(), store);
    svc.setDedupEnabled(false);
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);
    ruler.deleteRuleGroup.mockRejectedValueOnce(
      new SloRulerError('RULER_UNREACHABLE', 503, 'gateway timeout')
    );

    await expect(svc.delete(doc.id, deploy)).rejects.toBeInstanceOf(SloRulerError);

    // SO must still be there: the ruler group is still live, so the user
    // has a path to retry after Cortex recovers.
    expect(await store.get(doc.id)).not.toBeNull();
  });

  it('throws SloRulerTeardownRequiredError when called without deploy on an SLO that has a rule group', async () => {
    // Happens when a user's datasource was renamed/removed: the route can't
    // build a deploy context, and the service refuses to drop the SO
    // because that would orphan the rule group.
    const { store, deploy } = makeDeps();
    const svc = new SloService(makeLogger(), store);
    svc.setDedupEnabled(false);
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);

    await expect(svc.delete(doc.id /* no deploy */)).rejects.toBeInstanceOf(
      SloRulerTeardownRequiredError
    );
    expect(await store.get(doc.id)).not.toBeNull();
  });
});

describe('SloService.previewRules', () => {
  it('NEVER touches the ruler', async () => {
    // previewRules signature does not accept a deploy arg at all — the ruler
    // client is unreachable from preview. We still build the deps so we can
    // assert the mock was never called.
    const { ruler, store } = makeDeps();
    const svc = new SloService(makeLogger(), store);
    svc.setDedupEnabled(false);
    const group = svc.previewRules({ spec: validSpec() });

    expect(group.rules.length).toBeGreaterThan(0);
    expect(ruler.upsertRuleGroup).not.toHaveBeenCalled();
    expect(ruler.deleteRuleGroup).not.toHaveBeenCalled();
  });
});
