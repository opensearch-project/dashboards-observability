/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OSD route adapter — wires framework-agnostic handlers to OSD's IRouter.
 */
import { schema } from '@osd/config-schema';
import { IRouter, RequestHandlerContext, SavedObject } from '../../../../../src/core/server';
import type {
  AlertingOSClient,
  Datasource,
  DatasourceService,
  Logger,
} from '../../../common/types/alerting';
import { MultiBackendAlertService } from '../../services/alerting';

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
  handleListDatasources,
  handleGetDatasource,
  handleCreateDatasource,
  handleUpdateDatasource,
  handleDeleteDatasource,
  handleTestDatasource,
  handleGetOSMonitors,
  handleGetOSMonitor,
  handleCreateOSMonitor,
  handleUpdateOSMonitor,
  handleDeleteOSMonitor,
  handleGetOSAlerts,
  handleAcknowledgeOSAlerts,
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
import type { PrometheusMetadataService } from '../../services/alerting/prometheus_metadata_service';
import { handleGetAlertmanagerConfig } from './alertmanager_handlers';

export function registerAlertingRoutes(
  router: IRouter,
  datasourceService: DatasourceService,
  alertService: MultiBackendAlertService,
  logger?: Logger,
  metadataService?: PrometheusMetadataService
) {
  /**
   * Discover OSD-registered data sources and rebuild the datasource list.
   * Gated by a 30-second TTL to avoid wiping/re-seeding on every request.
   * Concurrent calls within TTL share the same in-flight promise.
   */
  let lastDiscoveryTs = 0;
  const DISCOVERY_TTL_MS = 30_000;
  let inflight: Promise<void> | null = null;

  async function discoverOsdDatasources(ctx: AlertingHandlerContext) {
    const existing = await datasourceService.list();
    if (Date.now() - lastDiscoveryTs < DISCOVERY_TTL_MS && existing.length > 0) return;
    if (inflight) {
      await inflight;
      return;
    }

    inflight = (async () => {
      try {
        // Clear existing and re-seed local cluster
        for (const ds of existing) {
          await datasourceService.delete(ds.id);
        }

        datasourceService.seed([
          { name: 'Local Cluster', type: 'opensearch' as const, url: 'local', enabled: true },
        ]);

        // Discover OSD-registered data sources + direct-query data connections.
        // - `data-source` = MDS OpenSearch clusters (attribute.endpoint is a URL).
        // - `data-connection` = direct-query connections (Prometheus, CloudWatch, etc);
        //   attribute.connectionId is the SQL-plugin connection name used for
        //   /_plugins/_directquery/_resources/{connectionId}/... routing.
        const soClient = ctx.core.savedObjects.client;
        const [osResult, dcResult] = await Promise.all([
          soClient.find<DataSourceSOAttributes>({ type: 'data-source', perPage: 100 }),
          soClient.find<DataConnectionSOAttributes>({ type: 'data-connection', perPage: 100 }),
        ]);

        const localPatterns = /localhost|127\.0\.0\.1|0\.0\.0\.0|::1|opensearch:9200|opensearch-cluster-master|opensearch-master/i;
        const osDiscovered = (osResult.saved_objects || [])
          .filter((so: SavedObject<DataSourceSOAttributes>) => {
            const endpoint = so.attributes?.endpoint || '';
            // Skip data sources pointing to the local cluster
            return !localPatterns.test(endpoint);
          })
          .map((so: SavedObject<DataSourceSOAttributes>) => ({
            name: so.attributes.title || so.id,
            type: 'opensearch' as const,
            url: so.id,
            enabled: true,
            mdsId: so.id,
          }));

        const promDiscovered = (dcResult.saved_objects || [])
          .filter((so: SavedObject<DataConnectionSOAttributes>) => {
            const t = so.attributes?.type;
            return t === 'Prometheus' || t === 'Amazon Managed Prometheus';
          })
          .map((so: SavedObject<DataConnectionSOAttributes>) => ({
            name: so.attributes.connectionId || so.id,
            type: 'prometheus' as const,
            url: so.id,
            enabled: true,
            // SQL-plugin connection name used by DirectQueryPrometheusBackend
            // to route requests through /_plugins/_directquery/_resources/<name>/...
            directQueryName: so.attributes.connectionId,
          }));

        const discovered = [...osDiscovered, ...promDiscovered];
        if (discovered.length > 0) {
          datasourceService.seed(discovered);
          logger?.info(
            `alerting: Discovered ${osDiscovered.length} OpenSearch data source(s), ${promDiscovered.length} Prometheus connection(s)`
          );
        }
        lastDiscoveryTs = Date.now();
      } catch (e) {
        logger?.debug(`alerting: Could not discover OSD data sources: ${e}`);
      } finally {
        inflight = null;
      }
    })();
    await inflight;
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
      const ds = await datasourceService.get(dsId);
      if (ds?.mdsId) {
        return await ctx.dataSource.opensearch.getClient(ds.mdsId);
      }
    }
    return ctx.core.opensearch.client.asCurrentUser;
  }

  // Datasource routes
  router.get({ path: '/api/alerting/datasources', validate: {} }, async (ctx, _req, res) => {
    await discoverOsdDatasources(ctx);
    const result = await handleListDatasources(datasourceService);
    return res.ok({ body: result.body });
  });

  router.get(
    {
      path: '/api/alerting/datasources/{id}',
      validate: { params: schema.object({ id: schema.string() }) },
    },
    async (ctx, req, res) => {
      const result = await handleGetDatasource(datasourceService, req.params.id);
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.notFound({ body: result.body });
    }
  );

  router.post(
    {
      path: '/api/alerting/datasources',
      validate: {
        body: schema.object({
          name: schema.string({ minLength: 1, maxLength: 255 }),
          type: schema.oneOf([schema.literal('opensearch'), schema.literal('prometheus')]),
          url: schema.uri({ scheme: ['http', 'https'] }),
          enabled: schema.maybe(schema.boolean()),
        }),
      },
    },
    async (ctx, req, res) => {
      const result = await handleCreateDatasource(
        datasourceService,
        req.body as Omit<Datasource, 'id'>
      );
      return res.ok({ body: result.body });
    }
  );

  router.put(
    {
      path: '/api/alerting/datasources/{id}',
      validate: {
        params: schema.object({ id: schema.string() }),
        body: schema.object({
          name: schema.maybe(schema.string()),
          url: schema.maybe(schema.uri({ scheme: ['http', 'https'] })),
          enabled: schema.maybe(schema.boolean()),
        }),
      },
    },
    async (ctx, req, res) => {
      const result = await handleUpdateDatasource(
        datasourceService,
        req.params.id,
        req.body as Partial<Datasource>
      );
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.notFound({ body: result.body });
    }
  );

  router.delete(
    {
      path: '/api/alerting/datasources/{id}',
      validate: { params: schema.object({ id: schema.string() }) },
    },
    async (ctx, req, res) => {
      const result = await handleDeleteDatasource(datasourceService, req.params.id);
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.notFound({ body: result.body });
    }
  );

  router.post(
    {
      path: '/api/alerting/datasources/{id}/test',
      validate: { params: schema.object({ id: schema.string() }) },
    },
    async (ctx, req, res) => {
      const result = await handleTestDatasource(
        datasourceService,
        await getAlertingClient(ctx, req.params.id),
        req.params.id
      );
      return res.ok({ body: result.body });
    }
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
      const result = await handleGetOSMonitors(
        alertService,
        await getAlertingClient(ctx, req.params.dsId),
        req.params.dsId
      );
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.badRequest({ body: result.body });
    }
  );

  router.get(
    {
      path: '/api/alerting/opensearch/{dsId}/monitors/{monitorId}',
      validate: { params: schema.object({ dsId: schema.string(), monitorId: schema.string() }) },
    },
    async (ctx, req, res) => {
      const result = await handleGetOSMonitor(
        alertService,
        await getAlertingClient(ctx, req.params.dsId),
        req.params.dsId,
        req.params.monitorId
      );
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.notFound({ body: result.body });
    }
  );

  // ---------------------------------------------------------------------------
  // Monitor body schema — structured to accept all monitor types while
  // rejecting unknown top-level keys and enforcing string types on critical
  // fields (script sources, index names).
  // ---------------------------------------------------------------------------

  const scriptSchema = schema.object(
    { source: schema.string(), lang: schema.maybe(schema.string()) },
    { unknowns: 'ignore' }
  );

  const triggerSchema = schema.object(
    {
      id: schema.maybe(schema.string()),
      name: schema.maybe(schema.string()),
      severity: schema.maybe(schema.oneOf([schema.string(), schema.number()])),
      condition: schema.maybe(schema.object({ script: scriptSchema }, { unknowns: 'ignore' })),
      actions: schema.maybe(schema.arrayOf(schema.object({}, { unknowns: 'ignore' }))),
      // Type-specific trigger wrappers (OS returns different keys per monitor_type)
      query_level_trigger: schema.maybe(schema.object({}, { unknowns: 'ignore' })),
      bucket_level_trigger: schema.maybe(schema.object({}, { unknowns: 'ignore' })),
      doc_level_trigger: schema.maybe(schema.object({}, { unknowns: 'ignore' })),
    },
    { unknowns: 'ignore' }
  );

  const inputSchema = schema.object(
    {
      search: schema.maybe(
        schema.object(
          {
            indices: schema.maybe(schema.arrayOf(schema.string())),
            query: schema.maybe(schema.any()),
          },
          { unknowns: 'ignore' }
        )
      ),
      uri: schema.maybe(schema.object({}, { unknowns: 'ignore' })),
      doc_level_input: schema.maybe(
        schema.object(
          {
            description: schema.maybe(schema.string()),
            indices: schema.maybe(schema.arrayOf(schema.string())),
            queries: schema.maybe(schema.arrayOf(schema.object({}, { unknowns: 'ignore' }))),
          },
          { unknowns: 'ignore' }
        )
      ),
    },
    { unknowns: 'ignore' }
  );

  const scheduleSchema = schema.object(
    {
      period: schema.maybe(
        schema.object({ interval: schema.number(), unit: schema.string() }, { unknowns: 'ignore' })
      ),
      cron: schema.maybe(schema.object({}, { unknowns: 'ignore' })),
    },
    { unknowns: 'ignore' }
  );

  const monitorBodySchema = schema.object({
    name: schema.string(),
    type: schema.maybe(schema.string()),
    monitor_type: schema.maybe(schema.string()),
    enabled: schema.maybe(schema.boolean()),
    schedule: schema.maybe(scheduleSchema),
    inputs: schema.maybe(schema.arrayOf(inputSchema)),
    triggers: schema.maybe(schema.arrayOf(triggerSchema)),
    schema_version: schema.maybe(schema.number()),
  });

  router.post(
    {
      path: '/api/alerting/opensearch/{dsId}/monitors',
      validate: { params: schema.object({ dsId: schema.string() }), body: monitorBodySchema },
    },
    async (ctx, req, res) => {
      const result = await handleCreateOSMonitor(
        alertService,
        await getAlertingClient(ctx, req.params.dsId),
        req.params.dsId,
        req.body
      );
      return res.ok({ body: result.body });
    }
  );

  router.put(
    {
      path: '/api/alerting/opensearch/{dsId}/monitors/{monitorId}',
      validate: {
        params: schema.object({ dsId: schema.string(), monitorId: schema.string() }),
        body: monitorBodySchema,
      },
    },
    async (ctx, req, res) => {
      const result = await handleUpdateOSMonitor(
        alertService,
        await getAlertingClient(ctx, req.params.dsId),
        req.params.dsId,
        req.params.monitorId,
        req.body
      );
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.notFound({ body: result.body });
    }
  );

  router.delete(
    {
      path: '/api/alerting/opensearch/{dsId}/monitors/{monitorId}',
      validate: { params: schema.object({ dsId: schema.string(), monitorId: schema.string() }) },
    },
    async (ctx, req, res) => {
      try {
        const client = await getAlertingClient(ctx, req.params.dsId);
        const result = await handleDeleteOSMonitor(
          alertService,
          client,
          req.params.dsId,
          req.params.monitorId
        );
        return result.status === 200
          ? res.ok({ body: result.body })
          : res.notFound({ body: result.body });
      } catch (_e) {
        return res.badRequest({ body: { error: `Invalid datasource: ${req.params.dsId}` } });
      }
    }
  );

  router.get(
    {
      path: '/api/alerting/opensearch/{dsId}/alerts',
      validate: { params: schema.object({ dsId: schema.string() }) },
    },
    async (ctx, req, res) => {
      const result = await handleGetOSAlerts(
        alertService,
        await getAlertingClient(ctx, req.params.dsId),
        req.params.dsId
      );
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.badRequest({ body: result.body });
    }
  );

  router.post(
    {
      path: '/api/alerting/opensearch/{dsId}/monitors/{monitorId}/acknowledge',
      validate: {
        params: schema.object({ dsId: schema.string(), monitorId: schema.string() }),
        body: schema.object({ alerts: schema.arrayOf(schema.string(), { maxSize: 1000 }) }),
      },
    },
    async (ctx, req, res) => {
      const result = await handleAcknowledgeOSAlerts(
        alertService,
        await getAlertingClient(ctx, req.params.dsId),
        req.params.dsId,
        req.params.monitorId,
        req.body
      );
      return res.ok({ body: result.body });
    }
  );

  // Prometheus routes
  router.get(
    {
      path: '/api/alerting/prometheus/{dsId}/rules',
      validate: { params: schema.object({ dsId: schema.string() }) },
    },
    async (ctx, req, res) => {
      const result = await handleGetPromRuleGroups(
        alertService,
        await getAlertingClient(ctx, req.params.dsId),
        req.params.dsId
      );
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.badRequest({ body: result.body });
    }
  );

  router.get(
    {
      path: '/api/alerting/prometheus/{dsId}/alerts',
      validate: { params: schema.object({ dsId: schema.string() }) },
    },
    async (ctx, req, res) => {
      const result = await handleGetPromAlerts(
        alertService,
        await getAlertingClient(ctx, req.params.dsId),
        req.params.dsId
      );
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.badRequest({ body: result.body });
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
      const result = await handleGetRuleDetail(
        alertService,
        await getAlertingClient(ctx, req.params.dsId),
        req.params.dsId,
        req.params.ruleId
      );
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.notFound({ body: result.body });
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
      const result = await handleGetAlertDetail(
        alertService,
        await getAlertingClient(ctx, req.params.dsId),
        req.params.dsId,
        req.params.alertId
      );
      return result.status === 200
        ? res.ok({ body: result.body })
        : res.notFound({ body: result.body });
    }
  );

  // ===========================================================================
  // Alertmanager Config Route (read-only, fetched via DirectQuery Prometheus)
  // ===========================================================================

  router.get(
    { path: '/api/alerting/alertmanager/config', validate: {} },
    async (ctx, _req, res) => {
      const promBackend = alertService.getPrometheusBackend?.();
      if (!promBackend) {
        return res.ok({ body: { available: false, error: 'Alertmanager not configured' } });
      }
      // Alertmanager is a global endpoint reached through any configured Prometheus
      // datasource. Pick the first discovered Prom datasource and set it as the
      // backend's default — the backend uses it to build
      // /_plugins/_directquery/_resources/{name}/alertmanager/api/v2/status.
      await discoverOsdDatasources(ctx);
      const all = await datasourceService.list();
      const promDs = all.find((d) => d.type === 'prometheus' && d.directQueryName);
      if (!promDs) {
        return res.ok({
          body: {
            available: false,
            error: 'No Prometheus datasource configured. Add a Prometheus direct-query connection.',
          },
        });
      }
      promBackend.setDefaultDatasource?.(promDs);
      const result = await handleGetAlertmanagerConfig(promBackend, await getAlertingClient(ctx));
      return res.ok({ body: result.body });
    }
  );

  // ===========================================================================
  // Prometheus Metadata Routes
  // ===========================================================================

  if (metadataService) {
    router.get(
      {
        path: '/api/alerting/prometheus/{dsId}/metadata/metrics',
        validate: {
          params: schema.object({ dsId: schema.string() }),
          query: schema.object({ search: schema.maybe(schema.string()) }),
        },
      },
      async (ctx, req, res) => {
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
