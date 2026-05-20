/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Status aggregator tests (W3.1).
 *
 * Pins:
 *   - Per-objective state ladder (ok / warning / breached) with pinned
 *     threshold values — a future change to the semantics shows up as a
 *     clear test diff.
 *   - Stale handling (sample timestamp older than 2× longest window).
 *   - Disabled SLO short-circuit.
 *   - Partial failure — 2 of 3 objectives return samples, one doesn't; the
 *     missing one degrades to per-objective no_data without poisoning the rest.
 *   - NoopStatusAggregator preserves the W1.2 stub contract.
 *   - Wire-level: recording-rule path is the query-execution endpoint; alerts
 *     path is the resource-proxy endpoint, GET verb.
 */

import {
  DirectQueryStatusAggregator,
  NoopStatusAggregator,
  buildLongWindowQuery,
  deriveTopLevelState,
  expectedRuleGroupsFor,
  objectiveState,
  parseInstantResponse,
  parseInstantResponseWithNonFinite,
} from '../status_aggregator';
import type { SloRuleHealthChecker, SloStatusAggregationContext } from '../status_aggregator';
import type { AlertingOSClient, Datasource, Logger } from '../../../../common/types/alerting/types';
import type { ObjectiveStatus, SloDocument, SloSpec } from '../../../../common/slo/slo_types';

// ============================================================================
// Fixtures
// ============================================================================

function noopLogger(): Logger {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

function promDatasource(overrides: Partial<Datasource> = {}): Datasource {
  return {
    id: 'prom-ds-001',
    name: 'my cortex',
    type: 'prometheus',
    url: '',
    enabled: true,
    directQueryName: 'my-cortex-connection',
    ...overrides,
  };
}

function makeDoc(overrides: Partial<SloSpec> = {}, id = 'slo-1'): SloDocument {
  const spec: SloSpec = {
    datasourceId: 'prom-ds-001',
    name: 'checkout availability',
    enabled: true,
    mode: 'active',
    service: 'checkout',
    owner: { teams: ['platform'] },
    sli: {
      type: 'single',
      definition: {
        backend: 'prometheus',
        type: 'availability',
        calcMethod: 'events',
        metric: 'http_requests_total',
      },
      dimensions: [{ name: 'service', value: 'checkout' }],
    },
    objectives: [{ name: 'availability-99-9', target: 0.999 }],
    budgetWarningThresholds: [{ threshold: 0.5, severity: 'warning' }],
    window: { type: 'rolling', duration: '28d' }, // > 3d → approximated to '3d'
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
  return {
    id,
    spec,
    status: {
      version: 1,
      createdAt: '2026-04-23T00:00:00Z',
      createdBy: 'tester',
      updatedAt: '2026-04-23T00:00:00Z',
      updatedBy: 'tester',
      provisioning: {
        backend: 'prometheus',
        alertGroupName: 'slo:group_aaaaaaaa',
        rulerNamespace: 'slo-generated-default',
      },
    },
  };
}

/** PromQL instant-query response shape with one sample per objective. */
function instantResponse(
  samples: Array<{ objective: string; sloId: string; ratio: number; tsSec?: number }>
): { resultType: 'vector'; result: unknown[] } {
  return {
    resultType: 'vector',
    result: samples.map((s) => ({
      metric: {
        __name__: 'slo:sli_error:ratio_rate_3d:checkout_availability_availability_99_9_xxxx',
        slo_id: s.sloId,
        slo_objective: s.objective,
        slo_name: 'checkout availability',
        slo_service: 'checkout',
      },
      value: [s.tsSec ?? Math.floor(Date.now() / 1000), String(s.ratio)],
    })),
  };
}

function alertsResponse(
  alerts: Array<{ sloId: string; state: 'firing' | 'pending' }>
): { data: { alerts: Array<Record<string, unknown>> } } {
  return {
    data: {
      alerts: alerts.map((a) => ({
        labels: { slo_id: a.sloId, severity: 'critical' },
        annotations: {},
        state: a.state,
        activeAt: '2026-04-23T00:00:00Z',
        value: '0.1',
      })),
    },
  };
}

/**
 * Build a mock client that dispatches based on the request path. POST to
 * `/_query/` routes to `queryHandler`; GET to `/alerts` routes to `alertsHandler`.
 */
function mockClient(handlers: {
  query?: (body: unknown) => unknown;
  alerts?: () => unknown;
}): { client: AlertingOSClient; requestMock: jest.Mock } {
  const requestMock = jest.fn(async (params: unknown) => {
    const p = params as { method: string; path: string; body?: unknown };
    if (p.path.includes('/_directquery/_query/')) {
      const body = handlers.query ? handlers.query(p.body) : { resultType: 'vector', result: [] };
      return { statusCode: 200, body };
    }
    if (p.path.endsWith('/api/v1/alerts')) {
      const body = handlers.alerts ? handlers.alerts() : { data: { alerts: [] } };
      return { statusCode: 200, body };
    }
    throw new Error(`Unexpected path: ${p.path}`);
  });
  return {
    client: ({ transport: { request: requestMock } } as unknown) as AlertingOSClient,
    requestMock,
  };
}

function ctxFor(ds: Datasource | undefined, client: AlertingOSClient): SloStatusAggregationContext {
  return {
    client,
    workspaceId: 'default',
    resolveDatasource: async () => ds,
  };
}

// ============================================================================
// Pure helpers — objectiveState + deriveTopLevelState
// ============================================================================

describe('objectiveState — pinned boundaries', () => {
  const thresholds = [{ threshold: 0.5, severity: 'warning' }];

  it('attainment >= target AND budget >= warn threshold → ok', () => {
    // target=0.999, errorRatio=0.0002 → attainment=0.9998, budget=+0.8 → ok
    expect(objectiveState(0.9998, 0.999, 0.8, thresholds)).toBe('ok');
  });

  it('attainment >= target AND budget below warn threshold → warning', () => {
    // errorRatio=0.0006 → attainment=0.9994, budget=+0.4 → warning (0.4 < 0.5)
    expect(objectiveState(0.9994, 0.999, 0.4, thresholds)).toBe('warning');
  });

  it('attainment < target → breached (overrides any warn threshold)', () => {
    // errorRatio=0.002 → attainment=0.998, budget=-1.0 → breached
    expect(objectiveState(0.998, 0.999, -1.0, thresholds)).toBe('breached');
  });

  it('no warning thresholds configured → ok while attainment >= target', () => {
    expect(objectiveState(0.9998, 0.999, 0.8, [])).toBe('ok');
  });

  it('picks the largest matching warn threshold (earliest tier)', () => {
    const tiers = [
      { threshold: 0.25, severity: 'critical' },
      { threshold: 0.5, severity: 'warning' },
    ];
    // budget=0.4 → only threshold=0.5 triggers (warn), not 0.25 (critical)
    expect(objectiveState(0.9994, 0.999, 0.4, tiers)).toBe('warning');
  });
});

describe('deriveTopLevelState — disabled / stale / worst-of', () => {
  const mkObj = (state: ObjectiveStatus['state']): ObjectiveStatus => ({
    objectiveName: 'o',
    currentValue: 0,
    currentValueUnit: 'ratio',
    attainment: 1,
    errorBudgetRemaining: 1,
    state,
  });

  it('disabled overrides all per-objective states', () => {
    expect(deriveTopLevelState(false, false, true, [mkObj('breached')])).toBe('disabled');
  });

  it('stale overrides per-objective states when anyStale', () => {
    expect(deriveTopLevelState(true, true, true, [mkObj('ok')])).toBe('stale');
  });

  it('no samples at all → no_data', () => {
    expect(deriveTopLevelState(true, false, false, [mkObj('no_data')])).toBe('no_data');
  });

  it('no samples but a non-finite sample existed → source_idle', () => {
    // Same per-objective state as "truly no data", but the aggregator saw a
    // NaN/Inf sample and surfaces source_idle so the listing can point users
    // at the upstream metric pipeline rather than the ruler / rule config.
    expect(
      deriveTopLevelState(
        true,
        false,
        false,
        [mkObj('source_idle')],
        /* anyObjectiveSourceIdle */ true
      )
    ).toBe('source_idle');
  });

  it('picks the worst per-objective state (breached > warning > no_data > ok)', () => {
    expect(deriveTopLevelState(true, false, true, [mkObj('ok'), mkObj('warning')])).toBe('warning');
    expect(
      deriveTopLevelState(true, false, true, [mkObj('ok'), mkObj('warning'), mkObj('breached')])
    ).toBe('breached');
    expect(deriveTopLevelState(true, false, true, [mkObj('ok'), mkObj('no_data')])).toBe('no_data');
  });
});

// ============================================================================
// Query builder + response parser
// ============================================================================

describe('buildLongWindowQuery', () => {
  it('embeds the window + sloId in a PromQL selector', () => {
    expect(buildLongWindowQuery('slo-1', '3d')).toBe(
      '{__name__=~"slo:sli_error:ratio_rate_3d:.*", slo_id="slo-1"}'
    );
  });

  it('escapes quotes and backslashes in the sloId', () => {
    expect(buildLongWindowQuery('a"b\\c', '1h')).toBe(
      '{__name__=~"slo:sli_error:ratio_rate_1h:.*", slo_id="a\\"b\\\\c"}'
    );
  });
});

describe('parseInstantResponse', () => {
  it('parses the bare {resultType, result} envelope', () => {
    const samples = parseInstantResponse({
      resultType: 'vector',
      result: [{ metric: { slo_objective: 'o' }, value: [1700000000, '0.001'] }],
    });
    expect(samples).toEqual([
      { labels: { slo_objective: 'o' }, timestamp: 1700000000, value: 0.001 },
    ]);
  });

  it('unwraps the DirectQuery results-by-datasource envelope', () => {
    const samples = parseInstantResponse({
      results: {
        'my cortex': {
          resultType: 'vector',
          result: [{ metric: { slo_objective: 'a' }, value: [1700000000, '0.5'] }],
        },
      },
    } as Record<string, unknown>);
    expect(samples).toHaveLength(1);
    expect(samples[0].value).toBe(0.5);
  });

  it('returns [] on malformed body', () => {
    expect(parseInstantResponse({} as Record<string, unknown>)).toEqual([]);
    expect(parseInstantResponse({ data: {} } as Record<string, unknown>)).toEqual([]);
  });

  it('drops non-finite samples (NaN / Inf) from the finite-only return', () => {
    const samples = parseInstantResponse({
      resultType: 'vector',
      result: [
        { metric: { slo_objective: 'a' }, value: [1700000000, 'NaN'] },
        { metric: { slo_objective: 'b' }, value: [1700000000, '0.001'] },
        { metric: { slo_objective: 'c' }, value: [1700000000, '+Inf'] },
      ],
    });
    expect(samples).toHaveLength(1);
    expect(samples[0].labels.slo_objective).toBe('b');
  });
});

describe('parseInstantResponseWithNonFinite', () => {
  it('separates finite samples from NaN / Inf samples', () => {
    const parsed = parseInstantResponseWithNonFinite({
      resultType: 'vector',
      result: [
        { metric: { slo_objective: 'a', __name__: 'rule_a' }, value: [1700000000, 'NaN'] },
        { metric: { slo_objective: 'b', __name__: 'rule_b' }, value: [1700000000, '0.001'] },
        { metric: { slo_objective: 'c', __name__: 'rule_c' }, value: [1700000000, '+Inf'] },
      ],
    });
    expect(parsed.samples).toHaveLength(1);
    expect(parsed.samples[0].labels.slo_objective).toBe('b');
    expect(parsed.nonFinite).toHaveLength(2);
    expect(parsed.nonFinite.map((s) => s.labels.slo_objective).sort()).toEqual(['a', 'c']);
    // value is null for non-finite — caller distinguishes "rule fired NaN"
    // from "rule never returned anything".
    expect(parsed.nonFinite.every((s) => s.value === null)).toBe(true);
  });

  it('returns empty arrays on a malformed envelope', () => {
    expect(parseInstantResponseWithNonFinite({} as Record<string, unknown>)).toEqual({
      samples: [],
      nonFinite: [],
    });
  });
});

// ============================================================================
// DirectQueryStatusAggregator — integration with a mocked transport
// ============================================================================

describe('DirectQueryStatusAggregator.aggregate — happy paths', () => {
  it('healthy SLO (errorRatio=0.0002) → ok, attainment=0.9998, full budget', async () => {
    const doc = makeDoc();
    const { client, requestMock } = mockClient({
      query: () =>
        instantResponse([{ objective: 'availability-99-9', sloId: 'slo-1', ratio: 0.0002 }]),
      alerts: () => alertsResponse([]),
    });
    const agg = new DirectQueryStatusAggregator(noopLogger());
    const [status] = await agg.aggregate([doc], ctxFor(promDatasource(), client));

    expect(status.state).toBe('ok');
    expect(status.firingCount).toBe(0);
    expect(status.objectives[0].state).toBe('ok');
    expect(status.objectives[0].attainment).toBeCloseTo(0.9998, 5);
    expect(status.objectives[0].errorBudgetRemaining).toBeCloseTo(0.8, 3);

    // Verify wire contract
    const calls = requestMock.mock.calls.map((c) => c[0] as { method: string; path: string });
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: 'POST',
        path: expect.stringContaining('/_plugins/_directquery/_query/'),
      })
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: 'GET',
        path: expect.stringContaining('/api/v1/alerts'),
      })
    );
  });

  it('warning SLO (errorRatio=0.0006, budget=40%) → warning', async () => {
    const doc = makeDoc();
    const { client } = mockClient({
      query: () =>
        instantResponse([{ objective: 'availability-99-9', sloId: 'slo-1', ratio: 0.0006 }]),
    });
    const agg = new DirectQueryStatusAggregator(noopLogger());
    const [status] = await agg.aggregate([doc], ctxFor(promDatasource(), client));

    expect(status.objectives[0].state).toBe('warning');
    expect(status.state).toBe('warning');
    expect(status.objectives[0].errorBudgetRemaining).toBeCloseTo(0.4, 3);
  });

  it('breached SLO (errorRatio=0.002) → breached, negative budget', async () => {
    const doc = makeDoc();
    const { client } = mockClient({
      query: () =>
        instantResponse([{ objective: 'availability-99-9', sloId: 'slo-1', ratio: 0.002 }]),
      alerts: () => alertsResponse([{ sloId: 'slo-1', state: 'firing' }]),
    });
    const agg = new DirectQueryStatusAggregator(noopLogger());
    const [status] = await agg.aggregate([doc], ctxFor(promDatasource(), client));

    expect(status.objectives[0].state).toBe('breached');
    expect(status.state).toBe('breached');
    expect(status.objectives[0].errorBudgetRemaining).toBeLessThan(0);
    expect(status.firingCount).toBe(1);
  });

  it('stale SLO (sample timestamp > 2× longest window old) → state=stale', async () => {
    const doc = makeDoc();
    const longWindowMs = 3 * 24 * 60 * 60 * 1000; // 3d
    const staleTsSec = Math.floor((Date.now() - 3 * longWindowMs) / 1000);
    const { client } = mockClient({
      query: () =>
        instantResponse([
          { objective: 'availability-99-9', sloId: 'slo-1', ratio: 0.0002, tsSec: staleTsSec },
        ]),
    });
    const agg = new DirectQueryStatusAggregator(noopLogger());
    const [status] = await agg.aggregate([doc], ctxFor(promDatasource(), client));

    expect(status.state).toBe('stale');
    expect(status.objectives[0].attainment).toBeCloseTo(0.9998, 5);
    expect(status.lastEvaluatedAt).toBeDefined();
  });
});

describe('DirectQueryStatusAggregator.aggregate — disabled / missing data', () => {
  it('disabled SLO short-circuits — no ruler queries issued', async () => {
    const doc = makeDoc({ enabled: false });
    const { client, requestMock } = mockClient({});
    const agg = new DirectQueryStatusAggregator(noopLogger());
    const [status] = await agg.aggregate([doc], ctxFor(promDatasource(), client));

    expect(status.state).toBe('disabled');
    expect(status.objectives.every((o) => o.state === 'disabled')).toBe(true);
    // Alerts call still happens (shared per datasource); recording-rule instant
    // query must NOT happen for a disabled SLO.
    const queryCalls = requestMock.mock.calls.filter((c) =>
      ((c[0] as { path: string }).path as string).includes('/_directquery/_query/')
    );
    expect(queryCalls).toHaveLength(0);
  });

  it('datasource not resolvable → no_data (does not throw)', async () => {
    const doc = makeDoc();
    const { client } = mockClient({});
    const agg = new DirectQueryStatusAggregator(noopLogger());
    const [status] = await agg.aggregate([doc], ctxFor(undefined, client));
    expect(status.state).toBe('no_data');
    expect(status.firingCount).toBe(0);
  });

  it('no sample returned for the SLO → state=no_data', async () => {
    const doc = makeDoc();
    const { client } = mockClient({
      query: () => ({ resultType: 'vector', result: [] }),
    });
    const agg = new DirectQueryStatusAggregator(noopLogger());
    const [status] = await agg.aggregate([doc], ctxFor(promDatasource(), client));
    expect(status.state).toBe('no_data');
    expect(status.objectives[0].state).toBe('no_data');
  });

  it('recording rule fires NaN (source metric idle) → state=source_idle', async () => {
    // Cortex returned a sample at the requested timestamp, but the recorded
    // expression evaluated to NaN — typically `1 - (0/0)` because the source
    // metric has no traffic in the window. The aggregator surfaces
    // source_idle so the listing badge points at the upstream metric
    // pipeline instead of the ruler / rule config.
    const doc = makeDoc();
    const { client } = mockClient({
      query: () => ({
        resultType: 'vector',
        result: [
          {
            metric: {
              __name__: 'slo:sli_error:ratio_rate_3d:checkout_availability_xxxx',
              slo_id: 'slo-1',
              slo_objective: 'availability-99-9',
            },
            value: [Math.floor(Date.now() / 1000), 'NaN'],
          },
        ],
      }),
    });
    const agg = new DirectQueryStatusAggregator(noopLogger());
    const [status] = await agg.aggregate([doc], ctxFor(promDatasource(), client));
    expect(status.state).toBe('source_idle');
    expect(status.objectives[0].state).toBe('source_idle');
  });
});

describe('DirectQueryStatusAggregator.aggregate — partial failure', () => {
  it('2 of 3 objectives return samples, one does not → only the missing one is no_data', async () => {
    const doc = makeDoc({
      objectives: [
        { name: 'avail-99-9', target: 0.999 },
        { name: 'avail-99-5', target: 0.995 },
        { name: 'avail-99', target: 0.99 },
      ],
    });
    const { client } = mockClient({
      query: () =>
        instantResponse([
          { objective: 'avail-99-9', sloId: 'slo-1', ratio: 0.0002 }, // ok
          { objective: 'avail-99-5', sloId: 'slo-1', ratio: 0.008 }, // attainment=0.992 < 0.995 → breached
          // avail-99 omitted → no sample → per-objective no_data
        ]),
    });
    const agg = new DirectQueryStatusAggregator(noopLogger());
    const [status] = await agg.aggregate([doc], ctxFor(promDatasource(), client));

    const byName = Object.fromEntries(status.objectives.map((o) => [o.objectiveName, o.state]));
    expect(byName['avail-99-9']).toBe('ok');
    expect(byName['avail-99-5']).toBe('breached');
    expect(byName['avail-99']).toBe('no_data');
    // Worst-of: breached > no_data > ok → breached.
    expect(status.state).toBe('breached');
  });

  it('alerts endpoint fails but query succeeds → firingCount=0, attainment still computed', async () => {
    const doc = makeDoc();
    const client: AlertingOSClient = ({
      transport: {
        request: jest.fn(async (params: unknown) => {
          const p = params as { path: string; method: string };
          if (p.path.includes('/_directquery/_query/')) {
            return {
              statusCode: 200,
              body: instantResponse([
                { objective: 'availability-99-9', sloId: 'slo-1', ratio: 0.0002 },
              ]),
            };
          }
          // alerts endpoint blows up
          throw new Error('alerts endpoint 500');
        }),
      },
    } as unknown) as AlertingOSClient;
    const agg = new DirectQueryStatusAggregator(noopLogger());
    const [status] = await agg.aggregate([doc], ctxFor(promDatasource(), client));

    expect(status.state).toBe('ok');
    expect(status.firingCount).toBe(0);
    expect(status.objectives[0].attainment).toBeCloseTo(0.9998, 5);
  });

  it('query endpoint fails for one SLO — that SLO degrades to no_data, sibling keeps working', async () => {
    const doc1 = makeDoc({}, 'slo-1');
    const doc2 = makeDoc({}, 'slo-2');
    let call = 0;
    const client: AlertingOSClient = ({
      transport: {
        request: jest.fn(async (params: unknown) => {
          const p = params as { path: string; method: string; body: unknown };
          if (p.path.includes('/_directquery/_query/')) {
            call++;
            // Fail the query that targets slo-2 specifically
            const body = p.body as { query: string };
            if (body.query.includes('slo_id="slo-2"')) {
              throw new Error('query failed');
            }
            return {
              statusCode: 200,
              body: instantResponse([
                { objective: 'availability-99-9', sloId: 'slo-1', ratio: 0.0002 },
              ]),
            };
          }
          return { statusCode: 200, body: alertsResponse([]) };
        }),
      },
    } as unknown) as AlertingOSClient;
    const agg = new DirectQueryStatusAggregator(noopLogger());
    const [s1, s2] = await agg.aggregate([doc1, doc2], ctxFor(promDatasource(), client));

    expect(s1.state).toBe('ok');
    expect(s2.state).toBe('no_data');
    expect(call).toBeGreaterThan(1);
  });
});

// ============================================================================
// NoopStatusAggregator — offline fallback
// ============================================================================

describe('NoopStatusAggregator', () => {
  it('disabled SLO → state=disabled', async () => {
    const doc = makeDoc({ enabled: false });
    const agg = new NoopStatusAggregator();
    const [status] = await agg.aggregate([doc]);
    expect(status.state).toBe('disabled');
    expect(status.objectives[0].state).toBe('disabled');
  });

  it('enabled SLO → state=no_data with full budget', async () => {
    const doc = makeDoc({ enabled: true });
    const agg = new NoopStatusAggregator();
    const [status] = await agg.aggregate([doc]);
    expect(status.state).toBe('no_data');
    expect(status.objectives[0].errorBudgetRemaining).toBe(1);
    // ruleCount is surfaced from provisioning so listing can still show it.
    expect(status.ruleCount).toBe(1);
  });
});

// ============================================================================
// W1.6 rule-health priority merge
// ============================================================================

describe('expectedRuleGroupsFor', () => {
  it('returns [alertGroupName] for prometheus-backed docs with a name', () => {
    const doc = makeDoc();
    expect(expectedRuleGroupsFor(doc)).toEqual(['slo:group_aaaaaaaa']);
  });

  it('returns [] when the alert group name is empty', () => {
    const doc = makeDoc();
    if (doc.status.provisioning.backend === 'prometheus') {
      doc.status.provisioning.alertGroupName = '';
    }
    expect(expectedRuleGroupsFor(doc)).toEqual([]);
  });
});

describe('W1.6 rule-health priority merge', () => {
  /** Build a checker mock that returns the given fixed result. */
  function checkerReturning(
    result:
      | {
          state: 'ok' | 'rules_partial' | 'rules_missing' | 'ruler_unreachable';
          rulerErrorCode?: string;
        }
      | ((
          input: Parameters<SloRuleHealthChecker['check']>[0]
        ) => {
          state: 'ok' | 'rules_partial' | 'rules_missing' | 'ruler_unreachable';
          rulerErrorCode?: string;
        })
  ): { checker: SloRuleHealthChecker; checkMock: jest.Mock } {
    const checkMock = jest.fn(async (input: Parameters<SloRuleHealthChecker['check']>[0]) => {
      const r = typeof result === 'function' ? result(input) : result;
      return {
        state: r.state,
        rulerErrorCode: r.rulerErrorCode,
        expectedGroups: input.expectedGroups,
        presentGroups: r.state === 'rules_missing' ? [] : input.expectedGroups,
        missingGroups: r.state === 'rules_missing' ? input.expectedGroups : [],
        computedAt: '2026-04-28T00:00:00Z',
      };
    });
    return { checker: { check: checkMock }, checkMock };
  }

  /** Extend ctxFor with a healthChecker. */
  function ctxWith(
    ds: Datasource | undefined,
    client: AlertingOSClient,
    checker: SloRuleHealthChecker | undefined
  ): SloStatusAggregationContext {
    return {
      client,
      workspaceId: 'default',
      resolveDatasource: async () => ds,
      healthChecker: checker,
    };
  }

  it('no healthChecker in ctx → state is the sample-derived one (back-compat)', async () => {
    const doc = makeDoc();
    const { client } = mockClient({
      query: () =>
        instantResponse([{ objective: 'availability-99-9', sloId: 'slo-1', ratio: 0.0002 }]),
    });
    const agg = new DirectQueryStatusAggregator(noopLogger());
    const [status] = await agg.aggregate([doc], ctxFor(promDatasource(), client));
    // ctxFor does NOT set healthChecker — this pins back-compat.
    expect(status.state).toBe('ok');
  });

  it('enabled=false → state=disabled, healthChecker.check is NOT called', async () => {
    const doc = makeDoc({ enabled: false });
    const { client } = mockClient({});
    const { checker, checkMock } = checkerReturning({ state: 'rules_missing' });
    const agg = new DirectQueryStatusAggregator(noopLogger());
    const [status] = await agg.aggregate([doc], ctxWith(promDatasource(), client, checker));
    expect(status.state).toBe('disabled');
    expect(checkMock).not.toHaveBeenCalled();
  });

  it('health=rules_missing → top-level state becomes rules_missing (overrides ok)', async () => {
    const doc = makeDoc();
    const { client } = mockClient({
      query: () =>
        instantResponse([{ objective: 'availability-99-9', sloId: 'slo-1', ratio: 0.0002 }]),
    });
    const { checker } = checkerReturning({ state: 'rules_missing' });
    const agg = new DirectQueryStatusAggregator(noopLogger());
    const [status] = await agg.aggregate([doc], ctxWith(promDatasource(), client, checker));
    expect(status.state).toBe('rules_missing');
    // Per-objective states are left as the sample derivation produced them.
    expect(status.objectives[0].state).toBe('ok');
  });

  it('health=rules_partial → top-level state becomes rules_missing', async () => {
    const doc = makeDoc();
    const { client } = mockClient({
      query: () =>
        instantResponse([{ objective: 'availability-99-9', sloId: 'slo-1', ratio: 0.002 }]),
      alerts: () => alertsResponse([{ sloId: 'slo-1', state: 'firing' }]),
    });
    const { checker } = checkerReturning({ state: 'rules_partial' });
    const agg = new DirectQueryStatusAggregator(noopLogger());
    const [status] = await agg.aggregate([doc], ctxWith(promDatasource(), client, checker));
    expect(status.state).toBe('rules_missing');
    // Per-objective still reflects the breached sample (rules_missing is
    // only the top-level overlay).
    expect(status.objectives[0].state).toBe('breached');
  });

  it('health=ruler_unreachable → top-level state becomes no_data', async () => {
    const doc = makeDoc();
    const { client } = mockClient({
      query: () =>
        instantResponse([{ objective: 'availability-99-9', sloId: 'slo-1', ratio: 0.0002 }]),
    });
    const { checker } = checkerReturning({
      state: 'ruler_unreachable',
      rulerErrorCode: 'TIMEOUT',
    });
    const logger = noopLogger();
    const agg = new DirectQueryStatusAggregator(logger);
    const [status] = await agg.aggregate([doc], ctxWith(promDatasource(), client, checker));
    expect(status.state).toBe('no_data');
    // Debug log is emitted with the error code so operators can follow up.
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('ruler unreachable for slo=slo-1 code=TIMEOUT')
    );
  });

  it('health=ok → state is the sample-derived one', async () => {
    const doc = makeDoc();
    const { client } = mockClient({
      query: () =>
        instantResponse([{ objective: 'availability-99-9', sloId: 'slo-1', ratio: 0.002 }]),
      alerts: () => alertsResponse([{ sloId: 'slo-1', state: 'firing' }]),
    });
    const { checker } = checkerReturning({ state: 'ok' });
    const agg = new DirectQueryStatusAggregator(noopLogger());
    const [status] = await agg.aggregate([doc], ctxWith(promDatasource(), client, checker));
    // Sample derivation says breached; health is ok → no overlay.
    expect(status.state).toBe('breached');
  });

  it('healthChecker.check rejects → state untouched, no throw, warn logged', async () => {
    const doc = makeDoc();
    const { client } = mockClient({
      query: () =>
        instantResponse([{ objective: 'availability-99-9', sloId: 'slo-1', ratio: 0.0002 }]),
    });
    const checkMock = jest.fn().mockRejectedValue(new Error('checker boom'));
    const checker: SloRuleHealthChecker = { check: checkMock };
    const logger = noopLogger();
    const agg = new DirectQueryStatusAggregator(logger);
    const [status] = await agg.aggregate([doc], ctxWith(promDatasource(), client, checker));
    expect(status.state).toBe('ok');
    expect(checkMock).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('healthChecker.check rejected (slo=slo-1)')
    );
    // Dedup: a second aggregate with the same failure message should not
    // emit a second warn.
    (logger.warn as jest.Mock).mockClear();
    await agg.aggregate([doc], ctxWith(promDatasource(), client, checker));
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('healthChecker.check rejected (slo=slo-1)')
    );
  });

  it('expectedGroups passed to the checker comes from provisioning.alertGroupName', async () => {
    const doc = makeDoc();
    if (doc.status.provisioning.backend === 'prometheus') {
      doc.status.provisioning.alertGroupName = 'slo:foo_123';
    }
    const { client } = mockClient({
      query: () =>
        instantResponse([{ objective: 'availability-99-9', sloId: 'slo-1', ratio: 0.0002 }]),
    });
    const { checker, checkMock } = checkerReturning({ state: 'ok' });
    const agg = new DirectQueryStatusAggregator(noopLogger());
    await agg.aggregate([doc], ctxWith(promDatasource(), client, checker));
    expect(checkMock).toHaveBeenCalledTimes(1);
    const call = checkMock.mock.calls[0][0] as {
      sloId: string;
      namespace: string;
      expectedGroups: string[];
      workspaceId: string;
    };
    expect(call.sloId).toBe('slo-1');
    expect(call.workspaceId).toBe('default');
    expect(call.namespace).toBe('slo-generated-default');
    expect(call.expectedGroups).toEqual(['slo:foo_123']);
  });
});
