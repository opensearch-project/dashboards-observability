/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OSD route adapter — wires framework-agnostic handlers to OSD's IRouter.
 *
 * Concurrency model: stateless backends (`HttpOpenSearchBackend`,
 * `DirectQueryPrometheusBackend`, `MonitorMutationService`) are constructed
 * once by `setupRoutes` and passed in. Stateful services that hold a
 * `SavedObjectDatasourceService` — namely `MultiBackendAlertService` and
 * `PrometheusMetadataService` — are constructed **per request** inside
 * `buildRequestServices(ctx)` so they carry only the scoped SavedObjects
 * client for that request. No singleton is ever mutated mid-request; no
 * per-tenant data can leak between concurrent callers.
 */
import { schema } from '@osd/config-schema';
import { IRouter, RequestHandlerContext, SavedObject } from '../../../../../src/core/server';
import type { AlertingOSClient, Datasource, Logger } from '../../../common/types/alerting';
import { validateDateMath, validateTimeRangeQuery } from '../../../common/services/alerting';
import {
  HttpOpenSearchBackend,
  MultiBackendAlertService,
  PrometheusMetadataService,
  SavedObjectDatasourceService,
  createNotFoundError,
} from '../../services/alerting';
import { DirectQueryPrometheusBackend } from '../../services/alerting/directquery_prometheus_backend';
import { MonitorMutationService } from '../../services/alerting/monitor_mutation_service';
import { registerAlertingMutationRoutes } from './mutations';
import { toErrorBody, toHandlerResult } from './route_utils';
import { isAlertManagerError } from '../../services/alerting';
import { alertingIdSchema, prometheusLabelNameSchema } from './schema_helpers';

/**
 * Shape of the OSD request-handler context we rely on. `dataSource` is
 * contributed by the optional `data_source` plugin so it's not on the core
 * `RequestHandlerContext`.
 */
type AlertingHandlerContext = RequestHandlerContext & {
  dataSource?: {
    opensearch: {
      getClient: (id: string) => Promise<AlertingOSClient>;
    };
  };
};

interface DataSourceSOAttributes {
  title?: string;
  endpoint?: string;
}

interface DataConnectionSOAttributes {
  connectionId?: string;
  type?: string;
}

import {
  handleGetOSMonitors,
  handleGetOSMonitor,
  handleGetOSAlerts,
  handleGetPromRuleGroups,
  handleGetPromAlerts,
  handleGetUnifiedAlerts,
  handleGetUnifiedRules,
  handleGetRuleDetail,
  handleGetAlertDetail,
} from './handlers';
import {
  handleGetMetricNames,
  handleGetLabelNames,
  handleGetLabelValues,
  handleGetMetricMetadata,
} from './metadata_handlers';
import { handleGetAlertmanagerConfig } from './alertmanager_handlers';

export interface AlertingRoutesDeps {
  osBackend: HttpOpenSearchBackend;
  promBackend: DirectQueryPrometheusBackend;
  mutationSvc: MonitorMutationService;
  logger: Logger;
  /**
   * Register the 4 Prometheus metadata routes in addition to the core set.
   * Defaults to true; tests can toggle to cover the reduced registration
   * surface.
   */
  enableMetadataRoutes?: boolean;
}

/**
 * Resolve an OpenSearch datasource from the `data-source` saved-object type.
 * Returns `null` for an unknown id. If `requestedDsId` is undefined, returns
 * a synthetic "Local Cluster" descriptor (matches the pre-refactor default
 * seed behaviour in `InMemoryDatasourceService`).
 *
 * Exported for unit tests; production callers reach this through
 * `getAlertingClient`.
 */
export async function resolveOpenSearchDatasource(
  ctx: AlertingHandlerContext,
  requestedDsId?: string
): Promise<Datasource | null> {
  if (!requestedDsId) {
    return {
      id: 'local-cluster',
      name: 'Local Cluster',
      type: 'opensearch',
      url: 'local',
      enabled: true,
    };
  }
  const soClient = ctx.core.savedObjects.client;
  try {
    const so = await soClient.get<DataSourceSOAttributes>('data-source', requestedDsId);
    return {
      id: so.id,
      name: so.attributes.title || so.id,
      type: 'opensearch',
      url: so.attributes.endpoint || '',
      enabled: true,
      mdsId: so.id,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve a Prometheus datasource from the `data-connection` saved-object
 * type. If `requestedDsId` matches a saved-object id OR a `connectionId`
 * attribute, returns that one; otherwise returns the first registered Prom
 * connection, or `null` if none exist.
 *
 * Exported for unit tests; production callers reach this through
 * `getAlertingClient` or the Alertmanager admin route.
 */
export async function resolvePrometheusDatasource(
  ctx: AlertingHandlerContext,
  requestedDsId?: string
): Promise<Datasource | null> {
  const soClient = ctx.core.savedObjects.client;
  let dcResult;
  try {
    dcResult = await soClient.find<DataConnectionSOAttributes>({
      type: 'data-connection',
      perPage: 100,
    });
  } catch {
    return null;
  }

  const promConnections = (dcResult.saved_objects || []).filter(
    (so: SavedObject<DataConnectionSOAttributes>) => {
      const t = so.attributes?.type;
      return t === 'Prometheus' || t === 'Amazon Managed Prometheus';
    }
  );

  const toDs = (so: SavedObject<DataConnectionSOAttributes>): Datasource => ({
    id: so.id,
    name: so.attributes.connectionId || so.id,
    type: 'prometheus' as const,
    url: so.id,
    enabled: true,
    directQueryName: so.attributes.connectionId,
  });

  if (requestedDsId) {
    const match = promConnections.find(
      (so: SavedObject<DataConnectionSOAttributes>) =>
        so.id === requestedDsId || so.attributes?.connectionId === requestedDsId
    );
    return match ? toDs(match) : null;
  }
  return promConnections.length > 0 ? toDs(promConnections[0]) : null;
}

/**
 * Get the right OpenSearch client for a datasource.
 * - MDS data sources use context.dataSource.opensearch.getClient(id).
 * - The local cluster (no `dsId` supplied, OR an MDS-disabled deployment)
 *   uses context.core.opensearch.client.asCurrentUser.
 * - Prometheus `data-connection` datasources also use the local cluster
 *   client because the Prometheus directquery resource path lives on the
 *   local OS cluster — the `data-connection` SO id only names the
 *   directQueryName, it doesn't point to a separate OS cluster.
 *
 * In an MDS deployment a non-empty `dsId` that names an OpenSearch data
 * source MUST resolve to an existing `data-source` saved object; falling
 * back to the local cluster on a typoed/stale id would silently mix data
 * across tenants. Unknown `data-connection` ids fall through to a
 * `not_found` error too.
 *
 * Exported for unit tests; production callers wire through `registerAlertingRoutes`.
 */
export async function getAlertingClient(
  ctx: AlertingHandlerContext,
  dsId?: string,
  logger?: Logger
): Promise<AlertingOSClient> {
  if (dsId && dsId.includes('::')) {
    logger?.warn(`alerting: Rejecting workspace-scoped datasource ID: ${dsId}`);
    throw createNotFoundError(`Unsupported workspace-scoped datasource ID: ${dsId}`);
  }
  if (dsId && ctx.dataSource) {
    const ds = await resolveOpenSearchDatasource(ctx, dsId);
    if (ds?.mdsId) {
      return await ctx.dataSource.opensearch.getClient(ds.mdsId);
    }
    // Not an OpenSearch `data-source` — try the Prometheus
    // `data-connection` lookup. Prometheus directquery still runs on the
    // local OS cluster, so the local client is the right transport.
    const promDs = await resolvePrometheusDatasource(ctx, dsId);
    if (promDs) {
      return ctx.core.opensearch.client.asCurrentUser;
    }
    logger?.warn(`alerting: Datasource not found: ${dsId}`);
    throw createNotFoundError(`Datasource not found: ${dsId}`);
  }
  return ctx.core.opensearch.client.asCurrentUser;
}

export function registerAlertingRoutes(router: IRouter, deps: AlertingRoutesDeps) {
  const { osBackend, promBackend, mutationSvc, logger, enableMetadataRoutes = true } = deps;

  // Thin closure that binds `logger` so existing callsites can keep calling
  // `getAlertingClient(ctx, dsId)` without threading logger through every
  // route handler. The module-level `getAlertingClient` (export) is what unit
  // tests drive directly.
  const getAlertingClientCtx = (ctx: AlertingHandlerContext, dsId?: string) =>
    getAlertingClient(ctx, dsId, logger);

  /**
   * Construct the per-request stateful alerting services bound to this
   * request's scoped SavedObjects client. Replaces an earlier mutable
   * `setDatasourceService` singleton pattern, which leaked SavedObjects
   * clients across concurrent requests at every `await` boundary.
   *
   * Call at the top of every handler; the returned `alertService` /
   * `metadataService` instances are short-lived and die when the handler
   * returns.
   */
  function buildRequestServices(
    ctx: AlertingHandlerContext
  ): {
    alertService: MultiBackendAlertService;
    metadataService: PrometheusMetadataService;
    datasourceService: SavedObjectDatasourceService;
  } {
    const datasourceService = new SavedObjectDatasourceService(
      ctx.core.savedObjects.client,
      logger
    );
    const alertService = new MultiBackendAlertService(datasourceService, logger);
    alertService.registerOpenSearch(osBackend);
    alertService.registerPrometheus(promBackend);
    const metadataService = new PrometheusMetadataService(promBackend, datasourceService, logger);
    return { alertService, metadataService, datasourceService };
  }

  /**
   * Map a framework-agnostic `HandlerResult` to the right OSD response. The
   * happy path (or explicit `okStatus`, e.g. 201 for create) emits `res.ok`
   * with the raw body; anything else routes through `toErrorBody` so the
   * wire shape stays consistent, and the original status carries through via
   * `res.customError`. Replaces per-route ternaries that used to flatten
   * everything to `res.badRequest` / `res.notFound`, which defeated the
   * status-preserving work in `toHandlerResult`.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function sendResult(res: any, result: { status: number; body: any }, okStatus: number = 200) {
    if (result.status === okStatus) return res.ok({ body: result.body });
    return res.customError({ statusCode: result.status, body: toErrorBody(result.body) });
  }

  /**
   * Run a route producer under a single try/catch and emit the right OSD
   * response. Errors thrown synchronously in the body — including
   * `AlertManagerError` rejections from `getAlertingClientCtx` — are
   * funneled through `toHandlerResult` so callers see typed 404 / 400 / 409
   * payloads instead of OSD's default 500-with-stringified-error path
   * (which crashed with "text.replace is not a function" because the
   * thrown plain object had no `.toString()` returning a string).
   *
   * Use this for any route that calls `getAlertingClientCtx` outside the
   * handler's own try/catch — i.e. all of them.
   */
  async function runHandler(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res: any,
    produce: () => Promise<{ status: number; body: any }>,
    okStatus: number = 200
  ) {
    try {
      const result = await produce();
      return sendResult(res, result, okStatus);
    } catch (e: unknown) {
      const result = toHandlerResult(e, logger);
      return sendResult(res, result, okStatus);
    }
  }

  /**
   * Shared partial merged into the query schemas of all three alerts routes
   * (`/api/alerting/unified/alerts`, `/api/alerting/opensearch/{dsId}/alerts`,
   * `/api/alerting/prometheus/{dsId}/alerts`). Both fields are optional; when
   * omitted, the handler falls through to legacy "no range" behavior on the
   * downstream service. Values are validated by `validateDateMath` so
   * malformed input is rejected with a 400 before it reaches the handler.
   */
  const timeRangeQuery = {
    startTime: schema.maybe(
      schema.string({
        validate: (v: string) => (validateDateMath(v) ? undefined : `invalid date-math: ${v}`),
      })
    ),
    endTime: schema.maybe(
      schema.string({
        validate: (v: string) => (validateDateMath(v) ? undefined : `invalid date-math: ${v}`),
      })
    ),
  };

  /**
   * Cross-field validator options for any `schema.object(...)` that carries
   * the `timeRangeQuery` pair. Rejects one-sided ranges and inverted ranges
   * (`endTime < startTime`) with a 400 before the handler sees them. See
   * `validateTimeRangeQuery` for the exact rules and rationale.
   */
  const timeRangeObjectOptions = {
    validate: (value: { startTime?: string; endTime?: string }) => validateTimeRangeQuery(value),
  };

  // Mutation routes (create/update/delete monitor + acknowledge alert) live
  // in `./mutations/` — register them via the dedicated registrar so the split
  // stays clean.
  registerAlertingMutationRoutes(
    router,
    mutationSvc,
    (ctx, dsId) => getAlertingClientCtx(ctx as AlertingHandlerContext, dsId),
    logger
  );

  // Unified view routes
  router.get(
    {
      path: '/api/alerting/unified/alerts',
      validate: {
        query: schema.object(
          {
            dsIds: schema.maybe(schema.string()),
            timeout: schema.maybe(schema.string()),
            maxResults: schema.maybe(schema.string()),
            ...timeRangeQuery,
          },
          timeRangeObjectOptions
        ),
      },
    },
    async (ctx, req, res) => {
      const { alertService } = buildRequestServices(ctx as AlertingHandlerContext);
      const result = await handleGetUnifiedAlerts(
        alertService,
        async (dsId: string) => getAlertingClientCtx(ctx, dsId),
        {
          dsIds: req.query.dsIds,
          timeout: req.query.timeout,
          maxResults: req.query.maxResults,
          startTime: req.query.startTime,
          endTime: req.query.endTime,
        },
        ctx
      );
      return res.ok({ body: result.body });
    }
  );

  router.get(
    {
      path: '/api/alerting/unified/rules',
      validate: {
        query: schema.object({
          dsIds: schema.maybe(schema.string()),
          timeout: schema.maybe(schema.string()),
          maxResults: schema.maybe(schema.string()),
        }),
      },
    },
    async (ctx, req, res) => {
      const { alertService } = buildRequestServices(ctx as AlertingHandlerContext);
      const result = await handleGetUnifiedRules(
        alertService,
        async (dsId: string) => getAlertingClientCtx(ctx, dsId),
        {
          dsIds: req.query.dsIds,
          timeout: req.query.timeout,
          maxResults: req.query.maxResults,
        }
      );
      return res.ok({ body: result.body });
    }
  );

  // OpenSearch monitor/alert routes
  router.get(
    {
      path: '/api/alerting/opensearch/{dsId}/monitors',
      validate: { params: schema.object({ dsId: alertingIdSchema }) },
    },
    async (ctx, req, res) =>
      runHandler(res, async () => {
        const { alertService } = buildRequestServices(ctx as AlertingHandlerContext);
        return handleGetOSMonitors(
          alertService,
          await getAlertingClientCtx(ctx, req.params.dsId),
          req.params.dsId
        );
      })
  );

  router.get(
    {
      path: '/api/alerting/opensearch/{dsId}/monitors/{monitorId}',
      validate: {
        params: schema.object({ dsId: alertingIdSchema, monitorId: alertingIdSchema }),
      },
    },
    async (ctx, req, res) =>
      runHandler(res, async () => {
        const { alertService } = buildRequestServices(ctx as AlertingHandlerContext);
        return handleGetOSMonitor(
          alertService,
          await getAlertingClientCtx(ctx, req.params.dsId),
          req.params.dsId,
          req.params.monitorId
        );
      })
  );
  // OS monitor mutations (POST create, PUT update, DELETE delete) moved to
  // `./mutations/` — registered via `registerAlertingMutationRoutes` at the
  // top of this function.

  router.get(
    {
      path: '/api/alerting/opensearch/{dsId}/alerts',
      validate: {
        params: schema.object({ dsId: alertingIdSchema }),
        query: schema.object(timeRangeQuery, timeRangeObjectOptions),
      },
    },
    async (ctx, req, res) =>
      runHandler(res, async () => {
        const { alertService } = buildRequestServices(ctx as AlertingHandlerContext);
        return handleGetOSAlerts(
          alertService,
          await getAlertingClientCtx(ctx, req.params.dsId),
          req.params.dsId,
          { startTime: req.query.startTime, endTime: req.query.endTime }
        );
      })
  );

  // Read-only destinations list. Destination CRUD lives in the OpenSearch
  // Alerting plugin — this endpoint only feeds the Create/Edit flyout's picker.
  router.get(
    {
      path: '/api/alerting/opensearch/{dsId}/destinations',
      validate: { params: schema.object({ dsId: alertingIdSchema }) },
    },
    async (ctx, req, res) => {
      try {
        const client = await getAlertingClientCtx(ctx as AlertingHandlerContext, req.params.dsId);
        const result = await osBackend.getDestinations(client);
        return res.ok({
          body: {
            destinations: result.destinations.map((d) => ({
              id: d.id,
              name: d.name,
              type: d.type,
            })),
            totalDestinations: result.totalDestinations,
            truncated: result.truncated,
          },
        });
      } catch (err) {
        if (isAlertManagerError(err)) {
          const result = toHandlerResult(err, logger);
          return res.customError({ statusCode: result.status, body: toErrorBody(result.body) });
        }
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(`getDestinations failed for ds ${req.params.dsId}: ${message}`);
        return res.customError({
          statusCode: 502,
          body: toErrorBody({ message: 'Failed to list destinations' }),
        });
      }
    }
  );

  // Index discovery — proxies `_cat/indices`, `_cat/aliases`, and `_mapping`
  // for the Create/Edit flyout's "Define index" picker and timestamp-field
  // selector. Read-only and per-request scoped via `getAlertingClient`. The
  // `search` query string accepts wildcards (e.g. `logs-*`); empty defaults
  // to `*`.
  router.get(
    {
      path: '/api/alerting/opensearch/{dsId}/indices',
      validate: {
        params: schema.object({ dsId: alertingIdSchema }),
        query: schema.object({
          search: schema.maybe(schema.string({ maxLength: 256 })),
        }),
      },
    },
    async (ctx, req, res) => {
      try {
        const client = await getAlertingClientCtx(ctx as AlertingHandlerContext, req.params.dsId);
        const indices = await osBackend.getIndices(client, req.query.search ?? '');
        return res.ok({ body: { indices } });
      } catch (err) {
        if (isAlertManagerError(err)) {
          const result = toHandlerResult(err, logger);
          return res.customError({ statusCode: result.status, body: toErrorBody(result.body) });
        }
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(`getIndices failed for ds ${req.params.dsId}: ${message}`);
        return res.customError({
          statusCode: 502,
          body: toErrorBody({ message: 'Failed to list indices' }),
        });
      }
    }
  );

  router.get(
    {
      path: '/api/alerting/opensearch/{dsId}/aliases',
      validate: {
        params: schema.object({ dsId: alertingIdSchema }),
        query: schema.object({
          search: schema.maybe(schema.string({ maxLength: 256 })),
        }),
      },
    },
    async (ctx, req, res) => {
      try {
        const client = await getAlertingClientCtx(ctx as AlertingHandlerContext, req.params.dsId);
        const aliases = await osBackend.getAliases(client, req.query.search ?? '');
        return res.ok({ body: { aliases } });
      } catch (err) {
        if (isAlertManagerError(err)) {
          const result = toHandlerResult(err, logger);
          return res.customError({ statusCode: result.status, body: toErrorBody(result.body) });
        }
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(`getAliases failed for ds ${req.params.dsId}: ${message}`);
        return res.customError({
          statusCode: 502,
          body: toErrorBody({ message: 'Failed to list aliases' }),
        });
      }
    }
  );

  // POST so we can pass an arbitrarily-long index list in the body without
  // bumping into URL-length limits. Returns `{ fieldsByType: { date: [...],
  // keyword: [...], ... } }`.
  router.post(
    {
      path: '/api/alerting/opensearch/{dsId}/mappings',
      validate: {
        params: schema.object({ dsId: alertingIdSchema }),
        body: schema.object({
          indices: schema.arrayOf(schema.string({ minLength: 1, maxLength: 256 }), {
            minSize: 1,
            maxSize: 50,
          }),
        }),
      },
    },
    async (ctx, req, res) => {
      try {
        const client = await getAlertingClientCtx(ctx as AlertingHandlerContext, req.params.dsId);
        const fieldsByType = await osBackend.getFieldsByType(client, req.body.indices);
        return res.ok({ body: { fieldsByType } });
      } catch (err) {
        if (isAlertManagerError(err)) {
          const result = toHandlerResult(err, logger);
          return res.customError({ statusCode: result.status, body: toErrorBody(result.body) });
        }
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(`getFieldsByType failed for ds ${req.params.dsId}: ${message}`);
        return res.customError({
          statusCode: 502,
          body: toErrorBody({ message: 'Failed to fetch mappings' }),
        });
      }
    }
  );

  // POST /monitors/{monitorId}/acknowledge moved to `./mutations/`.

  // Prometheus routes
  router.get(
    {
      path: '/api/alerting/prometheus/{dsId}/rules',
      validate: { params: schema.object({ dsId: alertingIdSchema }) },
    },
    async (ctx, req, res) =>
      runHandler(res, async () => {
        const { alertService } = buildRequestServices(ctx as AlertingHandlerContext);
        return handleGetPromRuleGroups(
          alertService,
          await getAlertingClientCtx(ctx, req.params.dsId),
          req.params.dsId
        );
      })
  );

  router.get(
    {
      path: '/api/alerting/prometheus/{dsId}/alerts',
      validate: {
        params: schema.object({ dsId: alertingIdSchema }),
        // NOTE: `timeRangeQuery` is validated here for forward-compatibility
        // and schema-shape uniformity with the other two alerts routes, but
        // it is a **no-op** on this endpoint. This route returns the raw
        // `PromAlert[]` shape (current-active alerts only); historical
        // episode reconstruction emits `UnifiedAlertSummary[]` (a different
        // shape) and is surfaced exclusively through
        // `/api/alerting/unified/alerts` via `MultiBackendAlertService.fetchAlertsRaw`.
        // A future revision that reshapes this endpoint to return unified
        // summaries can start honoring the range without a schema change.
        query: schema.object(timeRangeQuery, timeRangeObjectOptions),
      },
    },
    async (ctx, req, res) =>
      runHandler(res, async () => {
        const { alertService } = buildRequestServices(ctx as AlertingHandlerContext);
        return handleGetPromAlerts(
          alertService,
          await getAlertingClientCtx(ctx, req.params.dsId),
          req.params.dsId,
          { startTime: req.query.startTime, endTime: req.query.endTime }
        );
      })
  );

  // Detail view routes (on-demand, for flyout panels)
  router.get(
    {
      path: '/api/alerting/rules/{dsId}/{ruleId}',
      validate: {
        params: schema.object({ dsId: alertingIdSchema, ruleId: alertingIdSchema }),
      },
    },
    async (ctx, req, res) =>
      runHandler(res, async () => {
        const { alertService } = buildRequestServices(ctx as AlertingHandlerContext);
        return handleGetRuleDetail(
          alertService,
          await getAlertingClientCtx(ctx, req.params.dsId),
          req.params.dsId,
          req.params.ruleId,
          ctx
        );
      })
  );

  router.get(
    {
      path: '/api/alerting/alerts/{dsId}/{alertId}',
      validate: {
        params: schema.object({ dsId: alertingIdSchema, alertId: alertingIdSchema }),
      },
    },
    async (ctx, req, res) =>
      runHandler(res, async () => {
        const { alertService } = buildRequestServices(ctx as AlertingHandlerContext);
        return handleGetAlertDetail(
          alertService,
          await getAlertingClientCtx(ctx, req.params.dsId),
          req.params.dsId,
          req.params.alertId
        );
      })
  );

  // ===========================================================================
  // Alertmanager Config Route (read-only, fetched via DirectQuery Prometheus)
  // ===========================================================================

  router.get(
    {
      path: '/api/alerting/alertmanager/config',
      validate: { query: schema.object({ dsId: schema.maybe(alertingIdSchema) }) },
    },
    async (ctx, req, res) => {
      // Alertmanager is reached through a Prometheus datasource. Use the
      // saved-object-backed resolver — saved-object IDs are stable across
      // server restarts (addresses Comments 8 + 11). This route doesn't need
      // a MultiBackendAlertService because it talks directly to promBackend,
      // so we skip the buildRequestServices allocation.
      const promDs = await resolvePrometheusDatasource(
        ctx as AlertingHandlerContext,
        req.query.dsId
      );
      if (!promDs) {
        return res.ok({
          body: {
            available: false,
            error: req.query.dsId
              ? `Prometheus datasource "${req.query.dsId}" not found.`
              : 'No Prometheus datasource configured. Add a Prometheus direct-query connection.',
          },
        });
      }
      const result = await handleGetAlertmanagerConfig(
        promBackend,
        await getAlertingClientCtx(ctx as AlertingHandlerContext),
        promDs,
        logger
      );
      // This route intentionally returns a domain envelope
      // `{ available, code, ... }` on BOTH success and error paths — the UI
      // treats `code` as the discriminator and `available` as the boolean.
      // Do NOT funnel error bodies through `toErrorBody` here; that would
      // collapse the envelope into OSD's `{ message, attributes }` shape and
      // break the UI's consumer. Do preserve the upstream HTTP status code
      // so auth failures show as 401/403 rather than masked as 200.
      if (result.status === 200) return res.ok({ body: result.body });
      if (result.status === 401) {
        return res.unauthorized({ body: result.body });
      }
      if (result.status === 403) {
        return res.forbidden({ body: result.body });
      }
      return res.customError({ statusCode: result.status, body: result.body });
    }
  );

  // ===========================================================================
  // Prometheus Metadata Routes
  // ===========================================================================

  if (enableMetadataRoutes) {
    router.get(
      {
        path: '/api/alerting/prometheus/{dsId}/metadata/metrics',
        validate: {
          params: schema.object({ dsId: alertingIdSchema }),
          query: schema.object({ search: schema.maybe(schema.string()) }),
        },
      },
      async (ctx, req, res) =>
        runHandler(res, async () => {
          const { metadataService } = buildRequestServices(ctx as AlertingHandlerContext);
          return handleGetMetricNames(
            metadataService,
            await getAlertingClientCtx(ctx, req.params.dsId),
            req.params.dsId,
            req.query.search || undefined,
            logger
          );
        })
    );

    router.get(
      {
        path: '/api/alerting/prometheus/{dsId}/metadata/labels',
        validate: {
          params: schema.object({ dsId: alertingIdSchema }),
          query: schema.object({ metric: schema.maybe(schema.string()) }),
        },
      },
      async (ctx, req, res) =>
        runHandler(res, async () => {
          const { metadataService } = buildRequestServices(ctx as AlertingHandlerContext);
          return handleGetLabelNames(
            metadataService,
            await getAlertingClientCtx(ctx, req.params.dsId),
            req.params.dsId,
            req.query.metric || undefined,
            logger
          );
        })
    );

    router.get(
      {
        path: '/api/alerting/prometheus/{dsId}/metadata/label-values/{label}',
        validate: {
          params: schema.object({ dsId: alertingIdSchema, label: prometheusLabelNameSchema }),
          query: schema.object({ selector: schema.maybe(schema.string()) }),
        },
      },
      async (ctx, req, res) =>
        runHandler(res, async () => {
          const { metadataService } = buildRequestServices(ctx as AlertingHandlerContext);
          return handleGetLabelValues(
            metadataService,
            await getAlertingClientCtx(ctx, req.params.dsId),
            req.params.dsId,
            req.params.label,
            req.query.selector || undefined,
            logger
          );
        })
    );

    router.get(
      {
        path: '/api/alerting/prometheus/{dsId}/metadata/metric-metadata',
        validate: {
          params: schema.object({ dsId: alertingIdSchema }),
        },
      },
      async (ctx, req, res) =>
        runHandler(res, async () => {
          const { metadataService } = buildRequestServices(ctx as AlertingHandlerContext);
          return handleGetMetricMetadata(
            metadataService,
            await getAlertingClientCtx(ctx, req.params.dsId),
            req.params.dsId,
            logger
          );
        })
    );
  }
}
