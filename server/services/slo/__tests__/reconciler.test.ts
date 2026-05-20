/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SloReconciler tests (W2.1 + W2.3).
 *
 * Covers:
 *   - Happy path: all expected groups present → empty `missingBySlo`.
 *   - Missing detection with `healthChecker.invalidate` called for each diff
 *     (the W2.3 hook — ensuring the next UI probe won't serve stale TTL).
 *   - Orphan detection via the mocked `detectOrphanDiff` peer module.
 *   - Multi-datasource isolation (each ruler.listRuleGroups call uses the
 *     right namespace; no cross-talk).
 *   - Per-datasource ruler 5xx doesn't kill the sweep for others.
 *   - `reconcileOnce({ datasourceIds })` filters the sweep.
 *   - Empty state: still emits `incSweeps()`.
 *   - Interval lifecycle: `start()` schedules, doesn't run eagerly; a second
 *     tick while a sweep is in flight is skipped; `stop()` awaits in-flight.
 *   - Invariant: `invalidate` only fires on the sweep where the diff was observed.
 */

// Stub the peer W2.2 module at module load so the reconciler pulls our mock.
// Keeping the mock implementation here — not in the peer file — makes the
// test independent of W2.2's exact implementation progress.
jest.mock('../orphan_detector', () => ({
  detectOrphanDiff: jest.fn(),
}));

import { createSloReconciler } from '../reconciler';
import { detectOrphanDiff as mockDetectOrphanDiff } from '../orphan_detector';
import { SloRulerError } from '../../../../common/slo/slo_errors';
import type { AlertingOSClient, Datasource, Logger } from '../../../../common/types/alerting/types';
import type { GeneratedRuleGroup, ISloStore, SloDocument } from '../../../../common/slo/slo_types';
import type { RulerClient } from '../ruler_client';
import type { RuleHealthChecker } from '../rule_health_checker';
import type { InMemoryDatasourceService } from '../../alerting/datasource_service';
import type { ReconcilerMetrics } from '../reconciler';

const detectOrphanDiffMock = mockDetectOrphanDiff as jest.MockedFunction<
  typeof mockDetectOrphanDiff
>;

function noopLogger(): Logger {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

function mockClient(): AlertingOSClient {
  return ({
    transport: { request: jest.fn(async () => ({ statusCode: 200, body: {} })) },
  } as unknown) as AlertingOSClient;
}

function mockDatasource(overrides: Partial<Datasource> = {}): Datasource {
  return {
    id: 'ds-1',
    name: 'my-cortex',
    type: 'prometheus',
    url: '',
    enabled: true,
    directQueryName: 'my-cortex-connection',
    ...overrides,
  };
}

function mockDoc(overrides: {
  id: string;
  datasourceId?: string;
  alertGroupName?: string;
  rulerNamespace?: string;
}): SloDocument {
  return {
    id: overrides.id,
    spec: ({
      datasourceId: overrides.datasourceId ?? 'ds-1',
      name: `slo-${overrides.id}`,
      description: '',
      enabled: true,
      mode: 'active',
      service: 's',
      owner: { teams: ['t'] },
      sli: {
        type: 'single',
        definition: { backend: 'prometheus', type: 'availability', calcMethod: 'events' },
        dimensions: [],
      },
      objectives: [],
      budgetWarningThresholds: [],
      window: { type: 'rolling', duration: '28d' },
      alerting: { strategy: 'mwmbr', burnRates: [] },
      alarms: {
        sliHealth: { enabled: false },
        attainmentBreach: { enabled: false },
        budgetWarning: { enabled: false },
        noData: { enabled: false, forDuration: '5m' },
        resolved: { enabled: false },
      },
      exclusionWindows: [],
      labels: {},
      annotations: {},
    } as unknown) as SloDocument['spec'],
    status: {
      version: 1,
      createdAt: '2026-04-01T00:00:00.000Z',
      createdBy: 'u',
      updatedAt: '2026-04-01T00:00:00.000Z',
      updatedBy: 'u',
      provisioning: {
        backend: 'prometheus',
        alertGroupName: overrides.alertGroupName ?? `slo:${overrides.id}_suffix`,
        rulerNamespace:
          overrides.rulerNamespace ?? `slo-generated-${overrides.datasourceId ?? 'ds-1'}`,
      },
    },
  };
}

function mockGroup(groupName: string): GeneratedRuleGroup {
  return { groupName, interval: 60, rules: [], yaml: '' };
}

interface Mocks {
  store: jest.Mocked<ISloStore>;
  ruler: jest.Mocked<RulerClient>;
  healthChecker: jest.Mocked<RuleHealthChecker>;
  datasourceService: jest.Mocked<Pick<InMemoryDatasourceService, 'get'>>;
  metrics: jest.Mocked<ReconcilerMetrics>;
  buildClient: jest.Mock<AlertingOSClient, [Datasource]>;
  logger: Logger;
}

function buildMocks(): Mocks {
  return {
    store: ({
      list: jest.fn(async () => []),
      get: jest.fn(async () => null),
      save: jest.fn(async () => undefined),
      delete: jest.fn(async () => true),
    } as unknown) as jest.Mocked<ISloStore>,
    ruler: ({
      upsertRuleGroup: jest.fn(async () => undefined),
      deleteRuleGroup: jest.fn(async () => undefined),
      getRuleGroup: jest.fn(async () => null),
      listRuleGroups: jest.fn(async () => []),
    } as unknown) as jest.Mocked<RulerClient>,
    healthChecker: ({
      check: jest.fn(),
      invalidate: jest.fn(),
    } as unknown) as jest.Mocked<RuleHealthChecker>,
    datasourceService: ({
      get: jest.fn(async (id: string) => mockDatasource({ id })),
    } as unknown) as jest.Mocked<Pick<InMemoryDatasourceService, 'get'>>,
    metrics: {
      incSweeps: jest.fn(),
      incMissingRuleGroups: jest.fn(),
      incOrphans: jest.fn(),
      incErrors: jest.fn(),
      incDanglingRefs: jest.fn(),
      incGraceDeletions: jest.fn(),
      incAdoptableOrphans: jest.fn(),
      incUnknownOrphans: jest.fn(),
      snapshot: jest.fn(),
      reset: jest.fn(),
    },
    buildClient: jest.fn(() => mockClient()),
    logger: noopLogger(),
  };
}

/**
 * Default pass-through for detectOrphanDiff: every SLO's expected groups are
 * considered present (no missing); no orphans. Tests override per-case.
 *
 * The W2.2 `detectOrphanDiff` echoes the caller-supplied `datasourceId` and
 * `namespace` back on every result entry — we mirror that here so reconciler
 * assertions see the same shape the real detector emits.
 */
function defaultDetectImpl(): void {
  detectOrphanDiffMock.mockImplementation(
    ({ expectedGroupsBySlo, actualGroupNames, datasourceId, namespace }) => {
      const expected = new Set<string>();
      for (const groups of Object.values(expectedGroupsBySlo)) {
        for (const g of groups) expected.add(g);
      }
      const actual = new Set(actualGroupNames);
      const missingBySlo = [] as Array<{
        sloId: string;
        datasourceId: string;
        namespace: string;
        missingGroups: string[];
      }>;
      for (const [sloId, groups] of Object.entries(expectedGroupsBySlo)) {
        const missing = groups.filter((g) => !actual.has(g));
        if (missing.length > 0) {
          missingBySlo.push({ sloId, datasourceId, namespace, missingGroups: missing });
        }
      }
      const orphanNames = actualGroupNames.filter((g) => !expected.has(g));
      const orphans = orphanNames.map((groupName) => ({
        datasourceId,
        namespace,
        groupName,
      }));
      return {
        missingBySlo,
        orphans,
        adoptableOrphans: [],
        unknownOrphans: orphans,
      };
    }
  );
}

function makeReconciler(
  mocks: Mocks,
  opts: {
    now?: () => Date;
    intervalMs?: number;
    workspaceIdForDatasource?: (id: string) => string;
  } = {}
) {
  return createSloReconciler({
    store: mocks.store,
    ruler: mocks.ruler,
    healthChecker: mocks.healthChecker,
    datasourceService: (mocks.datasourceService as unknown) as InMemoryDatasourceService,
    logger: mocks.logger,
    metrics: mocks.metrics,
    buildClient: mocks.buildClient,
    workspaceIdForDatasource: opts.workspaceIdForDatasource,
    now: opts.now,
    intervalMs: opts.intervalMs,
  });
}

beforeEach(() => {
  defaultDetectImpl();
});

describe('SloReconciler — reconcileOnce', () => {
  it('happy path: 2 SLOs in one datasource, both groups present → empty missing/orphan arrays', async () => {
    const mocks = buildMocks();
    const docA = mockDoc({ id: 'slo-a', alertGroupName: 'slo:a_suffix' });
    const docB = mockDoc({ id: 'slo-b', alertGroupName: 'slo:b_suffix' });
    mocks.store.list.mockResolvedValue([docA, docB]);
    mocks.ruler.listRuleGroups.mockResolvedValue([
      mockGroup('slo:a_suffix'),
      mockGroup('slo:b_suffix'),
    ]);

    const reconciler = makeReconciler(mocks);
    const result = await reconciler.reconcileOnce();

    expect(result.missingBySlo).toEqual([]);
    expect(result.orphans).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.datasourceIds).toEqual(['ds-1']);
    expect(mocks.metrics.incSweeps).toHaveBeenCalledTimes(1);
    expect(mocks.metrics.incMissingRuleGroups).toHaveBeenCalledWith(0);
    expect(mocks.metrics.incOrphans).toHaveBeenCalledWith(0);
    expect(mocks.metrics.incErrors).toHaveBeenCalledWith(0);
    expect(mocks.healthChecker.invalidate).not.toHaveBeenCalled();
  });

  it('missing detection: ruler returns [] → entry in missingBySlo, metric emitted, invalidate called (W2.3)', async () => {
    const mocks = buildMocks();
    const doc = mockDoc({ id: 'slo-a', alertGroupName: 'slo:a_suffix' });
    mocks.store.list.mockResolvedValue([doc]);
    mocks.ruler.listRuleGroups.mockResolvedValue([]);

    const reconciler = makeReconciler(mocks);
    const result = await reconciler.reconcileOnce();

    expect(result.missingBySlo).toEqual([
      {
        sloId: 'slo-a',
        datasourceId: 'ds-1',
        namespace: 'slo-generated-ds-1',
        missingGroups: ['slo:a_suffix'],
      },
    ]);
    expect(mocks.metrics.incMissingRuleGroups).toHaveBeenCalledWith(1);

    // W2.3 — the invalidate hook fires with (workspaceId, datasourceId, sloId).
    // Default workspaceIdForDatasource returns the datasourceId, matching the
    // current route behavior in buildDeployContext.
    expect(mocks.healthChecker.invalidate).toHaveBeenCalledTimes(1);
    expect(mocks.healthChecker.invalidate).toHaveBeenCalledWith('ds-1', 'ds-1', 'slo-a');
  });

  it('orphan detection: ruler has a group no SLO claims → entry in orphans', async () => {
    const mocks = buildMocks();
    const doc = mockDoc({ id: 'slo-a', alertGroupName: 'slo:a_suffix' });
    mocks.store.list.mockResolvedValue([doc]);
    mocks.ruler.listRuleGroups.mockResolvedValue([
      mockGroup('slo:a_suffix'),
      mockGroup('slo:orphan_suffix'),
    ]);

    // Override the mocked detector to return the exact diff we want to assert
    // on — proves the reconciler forwards detector output verbatim without
    // coupling this test to the real detector's internals.
    const orphanEntry = {
      datasourceId: 'ds-1',
      namespace: 'slo-generated-ds-1',
      groupName: 'slo:orphan_suffix',
    };
    detectOrphanDiffMock.mockReturnValue({
      missingBySlo: [],
      orphans: [orphanEntry],
      adoptableOrphans: [],
      unknownOrphans: [orphanEntry],
    });

    const reconciler = makeReconciler(mocks);
    const result = await reconciler.reconcileOnce();

    expect(result.orphans).toEqual([
      { datasourceId: 'ds-1', namespace: 'slo-generated-ds-1', groupName: 'slo:orphan_suffix' },
    ]);
    expect(result.unknownOrphans).toEqual([
      { datasourceId: 'ds-1', namespace: 'slo-generated-ds-1', groupName: 'slo:orphan_suffix' },
    ]);
    expect(result.adoptableOrphans).toEqual([]);
    expect(mocks.metrics.incOrphans).toHaveBeenCalledWith(1);
  });

  it('multi-datasource: each datasource gets its own listRuleGroups call with the right namespace', async () => {
    const mocks = buildMocks();
    const docA = mockDoc({ id: 'slo-a', datasourceId: 'ds-a', alertGroupName: 'grpA' });
    const docB = mockDoc({ id: 'slo-b', datasourceId: 'ds-b', alertGroupName: 'grpB' });
    mocks.store.list.mockResolvedValue([docA, docB]);
    mocks.datasourceService.get.mockImplementation(async (id: string) => mockDatasource({ id }));
    mocks.ruler.listRuleGroups.mockImplementation(async (_c, ds, ns) => {
      // Each datasource's listing should receive the namespace derived from
      // its own workspaceId (here: datasourceId), never the other's.
      if (ds.id === 'ds-a' && ns === 'slo-generated-ds-a') return [mockGroup('grpA')];
      if (ds.id === 'ds-b' && ns === 'slo-generated-ds-b') return [mockGroup('grpB')];
      throw new Error(`unexpected list call ds=${ds.id} ns=${ns}`);
    });

    const reconciler = makeReconciler(mocks);
    const result = await reconciler.reconcileOnce();

    expect(result.errors).toEqual([]);
    expect(result.missingBySlo).toEqual([]);
    expect(new Set(result.datasourceIds)).toEqual(new Set(['ds-a', 'ds-b']));
    expect(mocks.ruler.listRuleGroups).toHaveBeenCalledTimes(2);
  });

  it("ruler 5xx for one datasource doesn't kill the sweep for others", async () => {
    const mocks = buildMocks();
    const docA = mockDoc({ id: 'slo-a', datasourceId: 'ds-a', alertGroupName: 'grpA' });
    const docB = mockDoc({ id: 'slo-b', datasourceId: 'ds-b', alertGroupName: 'grpB' });
    mocks.store.list.mockResolvedValue([docA, docB]);
    mocks.datasourceService.get.mockImplementation(async (id: string) => mockDatasource({ id }));
    mocks.ruler.listRuleGroups.mockImplementation(async (_c, ds) => {
      if (ds.id === 'ds-a') {
        throw new SloRulerError('RULER_UNREACHABLE', 503, 'upstream down');
      }
      return [mockGroup('grpB')];
    });

    const reconciler = makeReconciler(mocks);
    const result = await reconciler.reconcileOnce();

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].datasourceId).toBe('ds-a');
    expect(result.errors[0].namespace).toBe('slo-generated-ds-a');
    expect(result.errors[0].message).toContain('RULER_UNREACHABLE');
    // ds-b was still processed — proof the sweep didn't abort.
    expect(result.datasourceIds).toEqual(['ds-b']);
    expect(mocks.metrics.incErrors).toHaveBeenCalledWith(1);
  });

  it('records an error and skips when the datasource is not registered', async () => {
    const mocks = buildMocks();
    const doc = mockDoc({ id: 'slo-a', datasourceId: 'ds-ghost' });
    mocks.store.list.mockResolvedValue([doc]);
    mocks.datasourceService.get.mockResolvedValue(null);

    const reconciler = makeReconciler(mocks);
    const result = await reconciler.reconcileOnce();

    expect(mocks.ruler.listRuleGroups).not.toHaveBeenCalled();
    expect(result.errors).toEqual([
      {
        datasourceId: 'ds-ghost',
        namespace: 'slo-generated-ds-ghost',
        message: 'Datasource "ds-ghost" is not registered',
      },
    ]);
  });

  it('records an error and skips when the datasource has no directQueryName', async () => {
    const mocks = buildMocks();
    const doc = mockDoc({ id: 'slo-a', datasourceId: 'ds-raw' });
    mocks.store.list.mockResolvedValue([doc]);
    mocks.datasourceService.get.mockResolvedValue(
      mockDatasource({ id: 'ds-raw', name: 'raw-ds', directQueryName: undefined })
    );

    const reconciler = makeReconciler(mocks);
    const result = await reconciler.reconcileOnce();

    expect(mocks.ruler.listRuleGroups).not.toHaveBeenCalled();
    expect(result.errors[0].message).toContain('not a DirectQuery Prometheus connection');
  });

  it('reconcileOnce({ datasourceIds: ["ds-a"] }) only sweeps that datasource', async () => {
    const mocks = buildMocks();
    const docA = mockDoc({ id: 'slo-a', datasourceId: 'ds-a', alertGroupName: 'grpA' });
    const docB = mockDoc({ id: 'slo-b', datasourceId: 'ds-b', alertGroupName: 'grpB' });
    mocks.store.list.mockResolvedValue([docA, docB]);
    mocks.datasourceService.get.mockImplementation(async (id: string) => mockDatasource({ id }));
    mocks.ruler.listRuleGroups.mockResolvedValue([mockGroup('grpA')]);

    const reconciler = makeReconciler(mocks);
    const result = await reconciler.reconcileOnce({ datasourceIds: ['ds-a'] });

    expect(result.datasourceIds).toEqual(['ds-a']);
    expect(mocks.ruler.listRuleGroups).toHaveBeenCalledTimes(1);
    expect(mocks.ruler.listRuleGroups.mock.calls[0][1].id).toBe('ds-a');
  });

  it('reconcileOnce accepts the datasource NAME as filter input (id-or-name normalization)', async () => {
    // Regression for Bug D (S16.1): admin calls _reconcile with either the
    // internal ds-N id or the datasource name; `spec.datasourceId` is
    // persisted as the name in prod. Previously a name-form filter produced
    // an empty byDatasource map — docs were grouped under "ds-N" but the
    // filter set was {"prom-name"}, so nothing matched.
    const mocks = buildMocks();
    const docA = mockDoc({
      id: 'slo-a',
      datasourceId: 'my-cortex', // persisted name, not the ds-N id
      alertGroupName: 'grpA',
    });
    mocks.store.list.mockResolvedValue([docA]);
    mocks.datasourceService.get.mockImplementation(async (raw: string) => {
      // id-or-name fallback: resolve either form to the same record
      if (raw === 'ds-a' || raw === 'my-cortex') {
        return mockDatasource({ id: 'ds-a', name: 'my-cortex' });
      }
      return null;
    });
    mocks.ruler.listRuleGroups.mockResolvedValue([mockGroup('grpA')]);

    const reconciler = makeReconciler(mocks);
    const byName = await reconciler.reconcileOnce({ datasourceIds: ['my-cortex'] });
    const byId = await reconciler.reconcileOnce({ datasourceIds: ['ds-a'] });

    // Both forms produce the same sweep shape — one datasource visited, doc
    // picked up, errors empty.
    expect(byName.errors).toEqual([]);
    expect(byName.datasourceIds).toEqual(['my-cortex']);
    expect(byId.errors).toEqual([]);
    expect(byId.datasourceIds).toEqual(['my-cortex']);
  });

  it('reconcileOnce surfaces an error for an unresolvable filter input (does not silently drop)', async () => {
    const mocks = buildMocks();
    mocks.store.list.mockResolvedValue([]);
    mocks.datasourceService.get.mockResolvedValue(null); // every lookup misses

    const reconciler = makeReconciler(mocks);
    const result = await reconciler.reconcileOnce({ datasourceIds: ['bogus-ds'] });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].datasourceId).toBe('bogus-ds');
    expect(result.errors[0].message).toMatch(/not registered/);
  });

  it('empty state: no SLOs → zero-length arrays, still calls incSweeps', async () => {
    const mocks = buildMocks();
    mocks.store.list.mockResolvedValue([]);

    const reconciler = makeReconciler(mocks);
    const result = await reconciler.reconcileOnce();

    expect(result.missingBySlo).toEqual([]);
    expect(result.orphans).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.datasourceIds).toEqual([]);
    expect(mocks.metrics.incSweeps).toHaveBeenCalledTimes(1);
    expect(mocks.ruler.listRuleGroups).not.toHaveBeenCalled();
  });

  it('invariant: invalidate fires only on the sweep where a diff was observed', async () => {
    const mocks = buildMocks();
    const doc = mockDoc({ id: 'slo-a', alertGroupName: 'slo:a_suffix' });
    mocks.store.list.mockResolvedValue([doc]);
    // First sweep: rule missing. Second sweep: rule present (recovered).
    mocks.ruler.listRuleGroups
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([mockGroup('slo:a_suffix')]);

    const reconciler = makeReconciler(mocks);
    const first = await reconciler.reconcileOnce();
    const second = await reconciler.reconcileOnce();

    expect(first.missingBySlo).toHaveLength(1);
    expect(second.missingBySlo).toHaveLength(0);
    // invalidate() fired on the first sweep only — not the recovery sweep.
    expect(mocks.healthChecker.invalidate).toHaveBeenCalledTimes(1);
  });
});

/**
 * Drain enqueued microtasks without advancing real/fake timers. Jest's fake
 * timers freeze Date/setInterval but microtasks still run on the host event
 * loop — a handful of yields is enough to let `Promise.resolve()` chains
 * settle between our test assertions.
 */
async function flushMicrotasks(n = 10): Promise<void> {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
  }
}

describe('SloReconciler — interval lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('start() schedules at intervalMs and does NOT sweep on start', () => {
    const mocks = buildMocks();
    const reconciler = makeReconciler(mocks, { intervalMs: 1000 });

    reconciler.start();

    // No sweep yet — the first scheduled tick hasn't fired.
    expect(mocks.store.list).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1000);
    // Timer callback ran; reconcileOnce inside it is async, but store.list is
    // the first `await` so it was at least invoked synchronously before the
    // first microtask checkpoint.
    expect(mocks.store.list).toHaveBeenCalledTimes(1);
  });

  it('second tick while a sweep is in flight is skipped', async () => {
    const mocks = buildMocks();
    // Block the ruler call so the sweep stays "in flight" across ticks.
    let resolveList: ((v: GeneratedRuleGroup[]) => void) | undefined;
    const pending = new Promise<GeneratedRuleGroup[]>((r) => {
      resolveList = r;
    });
    mocks.store.list.mockResolvedValue([mockDoc({ id: 'slo-a', alertGroupName: 'grpA' })]);
    mocks.ruler.listRuleGroups.mockReturnValue(pending);

    const reconciler = makeReconciler(mocks, { intervalMs: 1000 });
    reconciler.start();

    // First tick starts the sweep.
    jest.advanceTimersByTime(1000);
    await flushMicrotasks();
    expect(mocks.store.list).toHaveBeenCalledTimes(1);

    // Second tick while the first sweep is still blocked — should be skipped.
    jest.advanceTimersByTime(1000);
    await flushMicrotasks();
    expect(mocks.store.list).toHaveBeenCalledTimes(1);

    // Release the ruler call so the first sweep can finish.
    resolveList!([mockGroup('grpA')]);
    await flushMicrotasks();

    // Next tick now runs a fresh sweep.
    jest.advanceTimersByTime(1000);
    await flushMicrotasks();
    expect(mocks.store.list).toHaveBeenCalledTimes(2);
  });

  it('stop() clears the interval and awaits an in-flight sweep', async () => {
    const mocks = buildMocks();
    let resolveList: ((v: GeneratedRuleGroup[]) => void) | undefined;
    const pending = new Promise<GeneratedRuleGroup[]>((r) => {
      resolveList = r;
    });
    mocks.store.list.mockResolvedValue([mockDoc({ id: 'slo-a', alertGroupName: 'grpA' })]);
    mocks.ruler.listRuleGroups.mockReturnValue(pending);

    const reconciler = makeReconciler(mocks, { intervalMs: 1000 });
    reconciler.start();
    jest.advanceTimersByTime(1000);
    // Let the sweep reach `inFlight` registration.
    await flushMicrotasks();

    const stopPromise = reconciler.stop();
    let stopResolved = false;
    stopPromise.then(() => {
      stopResolved = true;
    });
    await flushMicrotasks();
    expect(stopResolved).toBe(false);

    // Finish the sweep.
    resolveList!([mockGroup('grpA')]);
    await stopPromise;
    expect(stopResolved).toBe(true);

    // After stop, a virtual tick shouldn't trigger a new sweep.
    mocks.store.list.mockClear();
    jest.advanceTimersByTime(5000);
    await flushMicrotasks();
    expect(mocks.store.list).not.toHaveBeenCalled();
  });

  it('start() is idempotent — calling twice does not stack timers', async () => {
    const mocks = buildMocks();
    mocks.store.list.mockResolvedValue([]);

    const reconciler = makeReconciler(mocks, { intervalMs: 1000 });
    reconciler.start();
    reconciler.start();

    jest.advanceTimersByTime(1000);
    await flushMicrotasks();
    expect(mocks.store.list).toHaveBeenCalledTimes(1);
  });

  it('scheduled sweep errors are swallowed (WARN) without killing the interval', async () => {
    const mocks = buildMocks();
    mocks.store.list
      .mockRejectedValueOnce(new Error('catastrophic boom'))
      .mockResolvedValueOnce([]);

    const reconciler = makeReconciler(mocks, { intervalMs: 1000 });
    reconciler.start();

    jest.advanceTimersByTime(1000);
    await flushMicrotasks();
    expect(mocks.logger.warn).toHaveBeenCalled();

    // Second tick still fires — interval survived.
    jest.advanceTimersByTime(1000);
    await flushMicrotasks();
    expect(mocks.store.list).toHaveBeenCalledTimes(2);
  });
});

/**
 * W2.6 coverage audit — maps each plan bullet to the test that covers it.
 *
 * The audit exists as a live test (not just a comment block) so that when a
 * future refactor removes one of the referenced cases, this placeholder is
 * still adjacent to the mapping and grep-able. Each bullet is covered
 * *directly* (the referenced test names its bullet explicitly); indirect
 * coverage is called out where present.
 *
 * Bullet → covering test (same file):
 *   1. Happy path (clean diff, counters) →
 *      'SloReconciler — reconcileOnce › happy path: 2 SLOs in one
 *      datasource, both groups present → empty missing/orphan arrays'.
 *      Asserts incSweeps(1), incMissingRuleGroups(0), incOrphans(0),
 *      incErrors(0), and that invalidate is never called.
 *
 *   2. Missing detection (shape: sloId, datasourceId, namespace,
 *      missingGroups) → 'SloReconciler — reconcileOnce › missing
 *      detection: ruler returns [] → entry in missingBySlo, metric
 *      emitted, invalidate called (W2.3)'. Asserts the exact 4-field
 *      shape and the W2.3 invalidate hook.
 *
 *   3. Orphan detection into adoptableOrphans=[] / unknownOrphans →
 *      'SloReconciler — reconcileOnce › orphan detection: ruler has a
 *      group no SLO claims → entry in orphans'. Asserts both arrays
 *      explicitly.
 *
 *   4. Multi-workspace (== multi-datasource in Phase 1) isolation →
 *      TWO tests combined: (a) 'multi-datasource: each datasource gets
 *      its own listRuleGroups call with the right namespace' proves
 *      per-datasource namespace routing; (b) the cross-contamination
 *      test below ('cross-datasource isolation: …') proves a missing
 *      SLO in ds-A does NOT surface as an orphan in ds-B.
 *
 *   5. 5xx handling (one ds fails, others still swept, incErrors) →
 *      "SloReconciler — reconcileOnce › ruler 5xx for one datasource
 *      doesn't kill the sweep for others". Asserts the SloRulerError
 *      path, result.errors shape, and incErrors(1).
 *
 *   6. Empty state (zero SLOs, no ruler call, sweep counted) →
 *      'SloReconciler — reconcileOnce › empty state: no SLOs →
 *      zero-length arrays, still calls incSweeps'.
 */
describe('W2.6 coverage audit', () => {
  it('cross-datasource isolation: missing in ds-A does not leak as an orphan in ds-B', async () => {
    // Direct coverage for the isolation invariant in bullet 4. The multi-
    // datasource test above proves each sweep calls listRuleGroups with its
    // own namespace; this test proves the diff buckets themselves are
    // keyed per-datasource — ds-A's missing group name is not in ds-B's
    // actualGroupNames, but the reconciler must not treat it as an orphan
    // of ds-B because the two namespaces are separate.
    const mocks = buildMocks();
    const docA = mockDoc({ id: 'slo-a', datasourceId: 'ds-a', alertGroupName: 'slo:a_suffix' });
    const docB = mockDoc({ id: 'slo-b', datasourceId: 'ds-b', alertGroupName: 'slo:b_suffix' });
    mocks.store.list.mockResolvedValue([docA, docB]);
    mocks.datasourceService.get.mockImplementation(async (id: string) => mockDatasource({ id }));
    mocks.ruler.listRuleGroups.mockImplementation(async (_c, ds, ns) => {
      // ds-A's rule is gone (the one that would be "missing").
      if (ds.id === 'ds-a' && ns === 'slo-generated-ds-a') return [];
      // ds-B has its rule AND one extra group that is only an orphan in ds-B.
      if (ds.id === 'ds-b' && ns === 'slo-generated-ds-b') {
        return [mockGroup('slo:b_suffix'), mockGroup('slo:ds-b-only-orphan')];
      }
      throw new Error(`unexpected list call ds=${ds.id} ns=${ns}`);
    });

    const reconciler = makeReconciler(mocks);
    const result = await reconciler.reconcileOnce();

    // ds-A's missing entry stays pinned to ds-A / slo-generated-ds-a.
    expect(result.missingBySlo).toEqual([
      {
        sloId: 'slo-a',
        datasourceId: 'ds-a',
        namespace: 'slo-generated-ds-a',
        missingGroups: ['slo:a_suffix'],
      },
    ]);
    // ds-B's orphan stays pinned to ds-B / slo-generated-ds-b — the
    // 'slo:a_suffix' group that's "missing" from ds-A must not show up as
    // an orphan anywhere.
    expect(result.orphans).toEqual([
      {
        datasourceId: 'ds-b',
        namespace: 'slo-generated-ds-b',
        groupName: 'slo:ds-b-only-orphan',
      },
    ]);
    // Invalidate targets ds-A's (workspaceId, datasourceId, sloId) tuple —
    // ds-B's slo-b was healthy and must not be invalidated.
    expect(mocks.healthChecker.invalidate).toHaveBeenCalledTimes(1);
    expect(mocks.healthChecker.invalidate).toHaveBeenCalledWith('ds-a', 'ds-a', 'slo-a');
  });
});
