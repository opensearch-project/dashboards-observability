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
import {
  HttpOpenSearchBackend,
  MultiBackendAlertService,
  PrometheusMetadataService,
  SavedObjectDatasourceService,
} from '../../services/alerting';
import { DirectQueryPrometheusBackend } from '../../services/alerting/directquery_prometheus_backend';
import { MonitorMutationService } from '../../services/alerting/monitor_mutation_service';
import { registerAlertingMutationRoutes } from './mutations';
import { toErrorBody } from './route_utils';

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
  logger?: Logger;
  /**
   * Register the 4 Prometheus metadata routes in addition to the core set.
   * Defaults to true; tests can toggle to cover the reduced registration
   * surface.
   */
  enableMetadataRoutes?: boolean;
}

export function registerAlertingRoutes(router: IRouter, deps: AlertingRoutesDeps) {
  const { osBackend, promBackend, mutationSvc, enableMetadataRoutes = true } = deps;
  const logger: Logger = deps.logger ?? {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  };
  /**
   * Resolve an OpenSearch datasource from the `data-source` saved-object type.
   * Returns `null` for an unknown id. If `requestedDsId` is undefined, returns
   * a synthetic "Local Cluster" descriptor (matches the pre-refactor default
   * seed behaviour in `InMemoryDatasourceService`).
   */
  async function resolveOpenSearchDatasource(
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
   */
  async function resolvePrometheusDatasource(
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
   * MDS data sources use context.dataSource.opensearch.getClient(id).
   * Local cluster uses context.core.opensearch.client.asCurrentUser.
   */
  async function getAlertingClient(
    ctx: AlertingHandlerContext,
    dsId?: string
  ): Promise<AlertingOSClient> {
    if (dsId && dsId.includes('::')) {
      logger?.warn(`alerting: Rejecting workspace-scoped datasource ID: ${dsId}`);
      throw new Error(`Unsupported workspace-scoped datasource ID: ${dsId}`);
    }
    if (dsId && ctx.dataSource) {
      const ds = await resolveOpenSearchDatasource(ctx, dsId);
      if (ds?.mdsId) {
        return await ctx.dataSource.opensearch.getClient(ds.mdsId);
      }
    }
    return ctx.core.opensearch.client.asCurrentUser;
  }

  /**
   * Construct the per-request stateful alerting services bound to this
   * request's scoped SavedObjects client. Replaces the pre-Phase-5 mutable
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

  // Mutation routes (create/update/delete monitor + acknowledge alert) live
  // in `./mutations/` — register them via the dedicated registrar so the split
  // stays clean.
  registerAlertingMutationRoutes(router, mutationSvc, (ctx, dsId) =>
    getAlertingClient(ctx as AlertingHandlerContext, dsId)
  );

  // Unified view routes
  router.get(
    {
      path: '/api/alerting/unified/alerts',
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
      const result = await handleGetUnifiedAlerts(
        alertService,
        async (dsId: string) => getAlertingClient(ctx, dsId),
        {
          dsIds: req.query.dsIds,
          timeout: req.query.timeout,
          maxResults: req.query.maxResults,
        }
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
        async (dsId: string) => getAlertingClient(ctx, dsId),
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
      validate: { params: schema.object({ dsId: schema.string() }) },
    },
    async (ctx, req, res) => {
      const { alertService } = buildRequestServices(ctx as AlertingHandlerContext);
      const result = await handleGetOSMonitors(
        alertService,
        await getAlertingClient(ctx, req.params.dsId),
        req.params.dsId
      );
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.badRequest({ body: toErrorBody(result.body) });
    }
  );

  router.get(
    {
      path: '/api/alerting/opensearch/{dsId}/monitors/{monitorId}',
      validate: { params: schema.object({ dsId: schema.string(), monitorId: schema.string() }) },
    },
    async (ctx, req, res) => {
      const { alertService } = buildRequestServices(ctx as AlertingHandlerContext);
      const result = await handleGetOSMonitor(
        alertService,
        await getAlertingClient(ctx, req.params.dsId),
        req.params.dsId,
        req.params.monitorId
      );
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.notFound({ body: toErrorBody(result.body) });
    }
  );
  // OS monitor mutations (POST create, PUT update, DELETE delete) moved to
  // `./mutations/` — registered via `registerAlertingMutationRoutes` at the
  // top of this function.

  router.get(
    {
      path: '/api/alerting/opensearch/{dsId}/alerts',
      validate: { params: schema.object({ dsId: schema.string() }) },
    },
    async (ctx, req, res) => {
      const { alertService } = buildRequestServices(ctx as AlertingHandlerContext);
      const result = await handleGetOSAlerts(
        alertService,
        await getAlertingClient(ctx, req.params.dsId),
        req.params.dsId
      );
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.badRequest({ body: toErrorBody(result.body) });
    }
  );

  // POST /monitors/{monitorId}/acknowledge moved to `./mutations/`.

  // Prometheus routes
  router.get(
    {
      path: '/api/alerting/prometheus/{dsId}/rules',
      validate: { params: schema.object({ dsId: schema.string() }) },
    },
    async (ctx, req, res) => {
      const { alertService } = buildRequestServices(ctx as AlertingHandlerContext);
      const result = await handleGetPromRuleGroups(
        alertService,
        await getAlertingClient(ctx, req.params.dsId),
        req.params.dsId
      );
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.badRequest({ body: toErrorBody(result.body) });
    }
  );

  router.get(
    {
      path: '/api/alerting/prometheus/{dsId}/alerts',
      validate: { params: schema.object({ dsId: schema.string() }) },
    },
    async (ctx, req, res) => {
      const { alertService } = buildRequestServices(ctx as AlertingHandlerContext);
      const result = await handleGetPromAlerts(
        alertService,
        await getAlertingClient(ctx, req.params.dsId),
        req.params.dsId
      );
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.badRequest({ body: toErrorBody(result.body) });
    }
  );

  // Detail view routes (on-demand, for flyout panels)
  router.get(
    {
      path: '/api/alerting/rules/{dsId}/{ruleId}',
      validate: {
        params: schema.object({ dsId: schema.string(), ruleId: schema.string() }),
      },
    },
    async (ctx, req, res) => {
      const { alertService } = buildRequestServices(ctx as AlertingHandlerContext);
      const result = await handleGetRuleDetail(
        alertService,
        await getAlertingClient(ctx, req.params.dsId),
        req.params.dsId,
        req.params.ruleId
      );
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.notFound({ body: toErrorBody(result.body) });
    }
  );

  router.get(
    {
      path: '/api/alerting/alerts/{dsId}/{alertId}',
      validate: {
        params: schema.object({ dsId: schema.string(), alertId: schema.string() }),
      },
    },
    async (ctx, req, res) => {
      const { alertService } = buildRequestServices(ctx as AlertingHandlerContext);
      const result = await handleGetAlertDetail(
        alertService,
        await getAlertingClient(ctx, req.params.dsId),
        req.params.dsId,
        req.params.alertId
      );
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.notFound({ body: toErrorBody(result.body) });
    }
  );

  // ===========================================================================
  // Alertmanager Config Route (read-only, fetched via DirectQuery Prometheus)
  // ===========================================================================

  router.get(
    {
      path: '/api/alerting/alertmanager/config',
      validate: { query: schema.object({ dsId: schema.maybe(schema.string()) }) },
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
            code: 'not_configured',
            error: req.query.dsId
              ? `Prometheus datasource "${req.query.dsId}" not found.`
              : 'No Prometheus datasource configured. Add a Prometheus direct-query connection.',
          },
        });
      }
      const result = await handleGetAlertmanagerConfig(
        promBackend,
        await getAlertingClient(ctx as AlertingHandlerContext),
        promDs,
        logger
      );
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
          params: schema.object({ dsId: schema.string() }),
          query: schema.object({ search: schema.maybe(schema.string()) }),
        },
      },
      async (ctx, req, res) => {
        const { metadataService } = buildRequestServices(ctx as AlertingHandlerContext);
        const result = await handleGetMetricNames(
          metadataService,
          await getAlertingClient(ctx, req.params.dsId),
          req.params.dsId,
          req.query.search || undefined,
          logger
        );
        return res.ok({ body: result.body });
      }
    );

    router.get(
      {
        path: '/api/alerting/prometheus/{dsId}/metadata/labels',
        validate: {
          params: schema.object({ dsId: schema.string() }),
          query: schema.object({ metric: schema.maybe(schema.string()) }),
        },
      },
      async (ctx, req, res) => {
        const { metadataService } = buildRequestServices(ctx as AlertingHandlerContext);
        const result = await handleGetLabelNames(
          metadataService,
          await getAlertingClient(ctx, req.params.dsId),
          req.params.dsId,
          req.query.metric || undefined,
          logger
        );
        return res.ok({ body: result.body });
      }
    );

    router.get(
      {
        path: '/api/alerting/prometheus/{dsId}/metadata/label-values/{label}',
        validate: {
          params: schema.object({ dsId: schema.string(), label: schema.string() }),
          query: schema.object({ selector: schema.maybe(schema.string()) }),
        },
      },
      async (ctx, req, res) => {
        const { metadataService } = buildRequestServices(ctx as AlertingHandlerContext);
        const result = await handleGetLabelValues(
          metadataService,
          await getAlertingClient(ctx, req.params.dsId),
          req.params.dsId,
          req.params.label,
          req.query.selector || undefined,
          logger
        );
        return res.ok({ body: result.body });
      }
    );

    router.get(
      {
        path: '/api/alerting/prometheus/{dsId}/metadata/metric-metadata',
        validate: {
          params: schema.object({ dsId: schema.string() }),
        },
      },
      async (ctx, req, res) => {
        const { metadataService } = buildRequestServices(ctx as AlertingHandlerContext);
        const result = await handleGetMetricMetadata(
          metadataService,
          await getAlertingClient(ctx, req.params.dsId),
          req.params.dsId,
          logger
        );
        return res.ok({ body: result.body });
      }
    );
  }
}
