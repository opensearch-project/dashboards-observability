/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Regression tests for #S13-datasource-not-registered.
 *
 * The bug: `DELETE /api/observability/v1/slos/<id>` used to return 400
 * "Datasource ds-N is not registered" whenever the SLO route was hit before
 * `/api/alerting/datasources` on a fresh process — the `InMemoryDatasourceService`
 * was populated lazily by the alerting route's `discoverOsdDatasources`, and
 * SLO routes never invoked that hydration. Once a DatasourceDiscoveryService
 * is passed into the SLO routes, the registry gets hydrated from OSD saved
 * objects before every lookup, so a present datasource resolves and a genuine
 * miss still surfaces the typed error (SO preserved, no ruler side effect).
 */

import { registerSloRoutes } from '../index';
import { SloService } from '../../../../common/slo/slo_service';
import { InMemoryDatasourceService, DatasourceDiscoveryService } from '../../../services/alerting';
import type { MockRulerClient } from '../../../services/slo/ruler_client';
import { MockRulerClient as MockRulerClientImpl } from '../../../services/slo/ruler_client';
import type { SloDocument } from '../../../../common/slo/slo_types';

// ---- Fixtures ----

interface RouteConfig {
  path: string;
}
type RouteHandler = (...args: unknown[]) => Promise<unknown>;

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

function makeRouter() {
  return {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };
}

function makeCtx(soClient: { find: jest.Mock }) {
  return {
    core: {
      savedObjects: { client: soClient },
      opensearch: { client: { asCurrentUser: {} } },
    },
  };
}

function makeRes() {
  const ok = jest.fn((body: unknown) => ({ status: 200, body }));
  const customError = jest.fn((body: { statusCode: number; body: unknown }) => ({
    status: body.statusCode,
    body: body.body,
  }));
  return { ok, customError };
}

function getDeleteHandler(router: ReturnType<typeof makeRouter>): RouteHandler {
  const call = router.delete.mock.calls.find(([cfg]: [RouteConfig]) =>
    /\/api\/observability\/v1\/slos\/\{id\}/.test(cfg.path)
  );
  if (!call) throw new Error('DELETE route not registered');
  return call[1] as RouteHandler;
}

function seedSloDocument(): SloDocument {
  return {
    id: 'slo-42',
    spec: {
      datasourceId: 'ds-7',
      name: 'scenario-s13-regression',
      enabled: true,
      mode: 'active',
      service: 'envoy',
      owner: { teams: ['sre'] },
      sli: {
        type: 'single',
        definition: {
          backend: 'prometheus',
          type: 'availability',
          calcMethod: 'events',
          metric: 'envoy_cluster_upstream_rq_total',
        },
        dimensions: [{ name: 'envoy_cluster_name', value: 'otel-collector' }],
      },
      objectives: [{ name: 'availability-99', target: 0.99 }],
      budgetWarningThresholds: [],
      window: { type: 'rolling', duration: '30d' },
      alerting: {
        strategy: 'mwmbr',
        burnRates: [
          {
            shortWindow: '5m',
            longWindow: '1h',
            burnRateMultiplier: 14.4,
            severity: 'critical',
            createAlarm: true,
            forDuration: '5m',
          },
        ],
      },
      alarms: {
        sliHealth: { enabled: true },
        attainmentBreach: { enabled: true },
        budgetWarning: { enabled: true },
        noData: { enabled: true, forDuration: '15m' },
        resolved: { enabled: true },
      },
      exclusionWindows: [],
      labels: {},
      annotations: {},
    },
    status: {
      version: 1,
      createdAt: '2026-04-25T00:00:00Z',
      createdBy: 'tester',
      updatedAt: '2026-04-25T00:00:00Z',
      updatedBy: 'tester',
      provisioning: {
        backend: 'prometheus',
        alertGroupName: 'slo:scenario_s13_regression_group_abcdef12',
        rulerNamespace: 'slo-generated-ds-7',
      },
    },
  };
}

// In-memory ISloStore — same surface SavedObjectSloStore implements.
function makeStore(doc: SloDocument | null) {
  const holder: { doc: SloDocument | null } = { doc };
  return {
    store: {
      get: jest.fn(async (id: string) => (holder.doc && holder.doc.id === id ? holder.doc : null)),
      list: jest.fn(async () => (holder.doc ? [holder.doc] : [])),
      save: jest.fn(async (d: SloDocument) => {
        holder.doc = d;
      }),
      delete: jest.fn(async (id: string) => {
        if (holder.doc && holder.doc.id === id) {
          holder.doc = null;
          return true;
        }
        return false;
      }),
    },
    holder,
  };
}

// SO saved-object client double: the discovery service calls
// `find({ type: 'data-source' | 'data-connection' })`. We return a single
// Prometheus data-connection so the registry hydrates with ds-N → ds-1.
function makeSoClientWithPrometheusConnection(connectionId: string) {
  return {
    find: jest.fn(async (opts: { type: string }) => {
      if (opts.type === 'data-connection') {
        return {
          saved_objects: [
            {
              id: 'dc-prom-1',
              type: 'data-connection',
              attributes: { connectionId, type: 'Prometheus' },
            },
          ],
        };
      }
      return { saved_objects: [] };
    }),
  };
}

// SO saved-object client double: returns NO datasources so discovery produces
// only the local-cluster fallback. The SLO's datasourceId (ds-7) will not
// resolve — this exercises the genuine-miss path.
function makeEmptySoClient() {
  return {
    find: jest.fn(async () => ({ saved_objects: [] })),
  };
}

// ---- Tests ----

describe('SLO DELETE datasource registry lookup (#S13 regression)', () => {
  let datasourceService: InMemoryDatasourceService;
  let discoveryService: DatasourceDiscoveryService;
  let sloService: SloService;
  let router: ReturnType<typeof makeRouter>;
  let rulerClient: MockRulerClient;
  let storeDouble: ReturnType<typeof makeStore>;

  beforeEach(() => {
    datasourceService = new InMemoryDatasourceService(mockLogger as never);
    discoveryService = new DatasourceDiscoveryService(datasourceService, mockLogger as never, 0);
    sloService = new SloService(mockLogger as never);
    // Inject a pre-provisioned SLO whose datasourceId is "ds-7".
    storeDouble = makeStore(seedSloDocument());
    sloService.setStore(storeDouble.store as never);
    router = makeRouter();
    rulerClient = new MockRulerClientImpl(mockLogger as never);
    jest.spyOn(rulerClient, 'deleteRuleGroup');
    registerSloRoutes({
      router: router as never,
      sloService,
      logger: mockLogger as never,
      rulerClient,
      datasourceService,
      discoveryService,
    });
  });

  it('resolves a present datasource on the first SLO DELETE after process start', async () => {
    // The service seeds the "Local Cluster" sentinel first (ds-1) and then
    // reconciles the Prometheus data-connection, which lands as ds-2. Point
    // the SLO at ds-2 so the lookup goes through the Prometheus branch.
    const doc = seedSloDocument();
    doc.spec.datasourceId = 'ds-2';
    storeDouble.holder.doc = doc;
    const soClient = makeSoClientWithPrometheusConnection('ObservabilityStack_Prometheus');
    const ctx = makeCtx(soClient);
    const res = makeRes();

    // Critically, the registry is cold — we have NOT called
    // /api/alerting/datasources. The DELETE must still resolve ds-2.
    await getDeleteHandler(router)(ctx, { params: { id: 'slo-42' } }, res);

    // Discovery ran exactly once (from ensure() during tryBuildDeployContext).
    expect(soClient.find).toHaveBeenCalled();
    // Ruler teardown happened before SO delete.
    expect(rulerClient.deleteRuleGroup).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'ds-2', directQueryName: 'ObservabilityStack_Prometheus' }),
      'slo-generated-ds-7',
      'slo:scenario_s13_regression_group_abcdef12'
    );
    expect(storeDouble.holder.doc).toBeNull();
    expect(res.ok).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ deleted: true }),
      })
    );
    expect(res.customError).not.toHaveBeenCalled();
  });

  it('preserves the SLO and rule group when the datasource is genuinely missing', async () => {
    // No data-connection saved objects. Discovery hydrates only the local
    // cluster sentinel, so ds-7 cannot resolve.
    const soClient = makeEmptySoClient();
    const ctx = makeCtx(soClient);
    const res = makeRes();

    await getDeleteHandler(router)(ctx, { params: { id: 'slo-42' } }, res);

    // Discovery attempted. Ruler was NOT touched — the delete-safety contract
    // from commit 9d3e8a0a requires a resolvable deploy context before ruler
    // teardown or SO deletion.
    expect(soClient.find).toHaveBeenCalled();
    expect(rulerClient.deleteRuleGroup).not.toHaveBeenCalled();
    // SO survives so the user can retry once the datasource comes back.
    expect(storeDouble.holder.doc).not.toBeNull();
    // Route surfaces the typed validation error as HTTP 400.
    expect(res.customError).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        body: expect.objectContaining({
          attributes: expect.objectContaining({
            error: 'Validation failed',
            errors: expect.objectContaining({
              'spec.datasourceId': expect.stringContaining('not registered'),
            }),
          }),
        }),
      })
    );
    expect(res.ok).not.toHaveBeenCalled();
  });
});
