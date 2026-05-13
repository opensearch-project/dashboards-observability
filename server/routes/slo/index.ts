/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OSD route adapter for SLO CRUD. Routes are versioned under
 * `${OBSERVABILITY_BASE}/v1/slos` so a future schema change can coexist
 * with v1 behind a new prefix.
 *
 * PR 1 surface: list / create / get / update / delete / enable / disable /
 * preview / statuses. Repair, rule-health, reconcile, aggregate, adoption,
 * and probe-sli endpoints land in later PRs.
 */

import { schema } from '@osd/config-schema';
import type { IRouter, Logger, RequestHandlerContext } from '../../../../../src/core/server';
import { OBSERVABILITY_BASE } from '../../../common/constants/shared';
import type {
  SloDeployContext,
  SloStatusAggregationContext,
} from '../../../common/slo/slo_service';
import { SloService, SloValidationError } from '../../../common/slo/slo_service';
import type { AlertingOSClient, Datasource } from '../../../common/types/alerting';
import { SavedObjectDatasourceService } from '../../services/alerting/saved_object_datasource_service';
import type { RulerClient } from '../../services/slo/ruler_client';
import {
  handleCreateSLO,
  handleDeleteSLO,
  handleDisableSLO,
  handleEnableSLO,
  handleGetSLO,
  handleGetSLOStatuses,
  handleListSLOs,
  handlePreviewSLORules,
  handleUpdateSLO,
} from './handlers';

/**
 * OSD context type with the optional `dataSource` plugin extension.
 */
type SloHandlerContext = RequestHandlerContext & {
  dataSource?: {
    opensearch: {
      getClient: (id: string) => Promise<AlertingOSClient>;
    };
  };
};

const SLO_BASE = `${OBSERVABILITY_BASE}/v1/slos`;

// ============================================================================
// @osd/config-schema shapes for validation at the boundary.
// ============================================================================

const dimensionSchema = schema.object({
  name: schema.string({ minLength: 1, maxLength: 128 }),
  value: schema.string({ minLength: 1, maxLength: 256 }),
});

const burnRateSchema = schema.object({
  shortWindow: schema.string({ minLength: 1 }),
  longWindow: schema.string({ minLength: 1 }),
  burnRateMultiplier: schema.number({ min: 0.001, max: 1000 }),
  severity: schema.string({ minLength: 1 }),
  createAlarm: schema.boolean(),
  forDuration: schema.string({ minLength: 1 }),
});

const objectiveSchema = schema.object(
  {
    name: schema.string({ minLength: 1, maxLength: 64 }),
    displayName: schema.maybe(schema.string({ maxLength: 128 })),
    target: schema.number({ min: 0.5, max: 0.99999 }),
    latencyThreshold: schema.maybe(schema.number({ min: 0 })),
    timeSliceTarget: schema.maybe(schema.number({ min: 0, max: 1 })),
    compositeWeight: schema.maybe(schema.number({ min: 0 })),
    thresholdBound: schema.maybe(
      schema.object({
        operator: schema.oneOf([
          schema.literal('<'),
          schema.literal('<='),
          schema.literal('>'),
          schema.literal('>='),
        ]),
        value: schema.number(),
      })
    ),
  },
  { unknowns: 'allow' }
);

const prometheusSliSchema = schema.object(
  {
    backend: schema.literal('prometheus'),
    type: schema.oneOf([
      schema.literal('availability'),
      schema.literal('latency_threshold'),
      schema.literal('custom'),
    ]),
    calcMethod: schema.oneOf([
      schema.literal('events'),
      schema.literal('periods'),
      schema.literal('ratio_periods'),
    ]),
    metric: schema.maybe(schema.string()),
    goodEventsFilter: schema.maybe(schema.string()),
    periodLength: schema.maybe(schema.string()),
    latencyThresholdUnit: schema.maybe(
      schema.oneOf([schema.literal('seconds'), schema.literal('milliseconds')])
    ),
    customExpr: schema.maybe(
      schema.oneOf([
        schema.object({
          mode: schema.literal('events'),
          goodQuery: schema.string({ minLength: 1 }),
          totalQuery: schema.string({ minLength: 1 }),
        }),
        schema.object({
          mode: schema.literal('raw'),
          errorRatioQuery: schema.string({ minLength: 1 }),
        }),
      ])
    ),
  },
  { unknowns: 'allow' }
);

const sliNodeSchema = schema.object(
  {
    type: schema.oneOf([schema.literal('single'), schema.literal('composite')]),
    definition: schema.maybe(prometheusSliSchema),
    dimensions: schema.maybe(schema.arrayOf(dimensionSchema)),
    operator: schema.maybe(schema.oneOf([schema.literal('all'), schema.literal('any')])),
    members: schema.maybe(schema.arrayOf(schema.object({}, { unknowns: 'allow' }))),
  },
  { unknowns: 'allow' }
);

const windowSchema = schema.object(
  {
    type: schema.oneOf([schema.literal('rolling'), schema.literal('calendar')]),
    duration: schema.maybe(schema.string()),
    period: schema.maybe(
      schema.oneOf([schema.literal('week'), schema.literal('month'), schema.literal('quarter')])
    ),
    timezone: schema.maybe(schema.string()),
    startDay: schema.maybe(schema.number()),
  },
  { unknowns: 'allow' }
);

const alertingSchema = schema.object(
  {
    strategy: schema.literal('mwmbr'),
    burnRates: schema.arrayOf(burnRateSchema),
  },
  { unknowns: 'allow' }
);

const alarmsSchema = schema.object({
  sliHealth: schema.object({ enabled: schema.boolean() }),
  attainmentBreach: schema.object({ enabled: schema.boolean() }),
  budgetWarning: schema.object({ enabled: schema.boolean() }),
  noData: schema.object({ enabled: schema.boolean(), forDuration: schema.string() }),
  resolved: schema.object({ enabled: schema.boolean() }),
});

const exclusionWindowSchema = schema.object(
  {
    name: schema.string(),
    reason: schema.maybe(schema.string()),
    schedule: schema.oneOf([
      schema.object({
        type: schema.literal('cron'),
        expression: schema.string(),
        timezone: schema.string(),
        duration: schema.string(),
      }),
      schema.object({
        type: schema.literal('oneoff'),
        start: schema.string(),
        end: schema.string(),
      }),
    ]),
  },
  { unknowns: 'allow' }
);

const budgetWarningThresholdSchema = schema.object({
  threshold: schema.number({ min: 0.01, max: 0.99 }),
  severity: schema.string({ minLength: 1 }),
});

const sloSpecSchema = schema.object(
  {
    datasourceId: schema.string({ minLength: 1 }),
    // workspaceId is server-stamped; clients may send it but it's overwritten.
    workspaceId: schema.maybe(schema.string()),
    name: schema.string({ minLength: 1, maxLength: 128 }),
    description: schema.maybe(schema.string()),
    enabled: schema.boolean(),
    mode: schema.oneOf([schema.literal('active'), schema.literal('shadow')]),
    service: schema.string({ minLength: 1 }),
    owner: schema.object({
      teams: schema.arrayOf(schema.string(), { minSize: 1 }),
      primaryUser: schema.maybe(schema.string()),
    }),
    tier: schema.maybe(schema.string()),
    canonicalKind: schema.maybe(
      schema.oneOf([
        schema.literal('apm-availability'),
        schema.literal('apm-latency'),
        schema.literal('http-availability'),
        schema.literal('http-latency'),
        schema.literal('rpc-availability'),
        schema.literal('rpc-latency'),
        schema.literal('db-latency'),
        schema.literal('messaging-latency'),
        schema.literal('genai-availability'),
      ])
    ),
    sli: sliNodeSchema,
    objectives: schema.arrayOf(objectiveSchema, { minSize: 1 }),
    budgetWarningThresholds: schema.arrayOf(budgetWarningThresholdSchema),
    window: windowSchema,
    alerting: alertingSchema,
    alarms: alarmsSchema,
    exclusionWindows: schema.arrayOf(exclusionWindowSchema),
    labels: schema.recordOf(
      schema.string(),
      schema.oneOf([schema.string(), schema.arrayOf(schema.string())])
    ),
    annotations: schema.recordOf(schema.string(), schema.string()),
  },
  { unknowns: 'allow' }
);

const createBody = schema.object({
  id: schema.maybe(schema.string()),
  spec: sloSpecSchema,
});

const updateBody = schema.object({
  version: schema.number({ min: 1 }),
  spec: schema.object({}, { unknowns: 'allow' }),
});

const previewBody = schema.object({
  id: schema.maybe(schema.string()),
  spec: schema.object({}, { unknowns: 'allow' }),
});

// ============================================================================
// Acting user
// ============================================================================

/**
 * FIXME(pr-2): extract the acting user from the request (OpenSearch
 * security plugin exposes it via `req.auth`, or the `securitytenant` /
 * `Authorization` headers when the plugin is disabled). PR 1 stamps a
 * sentinel so audit rows can be re-attributed once the resolver lands —
 * every mutation's createdBy / updatedBy comes through here.
 */
const SLO_ACTING_USER_PLACEHOLDER = 'osd-user';
function resolveActingUser(_req: {
  headers?: Record<string, string | string[] | undefined>;
}): string {
  return SLO_ACTING_USER_PLACEHOLDER;
}

// ============================================================================
// Deploy context + status context builders
// ============================================================================

/**
 * Build the per-request SloDeployContext the service needs to dual-write to
 * the ruler on create/update/delete.
 *
 * When the caller genuinely didn't ask for a ruler write (no ruler client, no
 * datasource service, no datasourceId), returns undefined and the SO-only
 * path runs. When the caller *did* supply a datasourceId but we can't
 * resolve it to a DirectQuery-Prometheus datasource, throws
 * SloValidationError so the route responds 400 with a field-keyed message.
 *
 * `workspaceId` resolution: for now we use `'default'` since OSD workspace
 * context isn't plumbed onto the deploy context. A follow-up PR will pull
 * the real workspace id from the request scope; the AMP invariant (every
 * rule group for workspace W writes to `slo-generated-<W>`) already resolves
 * through `sloRulerNamespaceFor(workspaceId)` so the change is isolated to
 * this one call site.
 */
async function buildDeployContext(
  ctx: SloHandlerContext,
  datasourceId: string | undefined,
  rulerClient: RulerClient | undefined,
  logger: Logger
): Promise<SloDeployContext | undefined> {
  if (!rulerClient || !datasourceId) return undefined;

  const datasourceService = new SavedObjectDatasourceService(ctx.core.savedObjects.client, logger);
  const ds = await datasourceService.get(datasourceId);
  if (!ds) {
    logger.warn(
      `SLO ruler dual-write aborted: datasource "${datasourceId}" is not a known alerting datasource`
    );
    throw new SloValidationError({
      'spec.datasourceId': `Datasource "${datasourceId}" is not registered. Pick one from /api/alerting/datasources.`,
    });
  }
  if (!ds.directQueryName) {
    logger.warn(
      `SLO ruler dual-write aborted: datasource "${datasourceId}" (${ds.name}) has no directQueryName — not a DirectQuery Prometheus connection`
    );
    throw new SloValidationError({
      'spec.datasourceId': `Datasource "${ds.name}" is not a DirectQuery Prometheus connection; SLO rules can only be deployed to Prometheus-backed datasources.`,
    });
  }

  const client: AlertingOSClient =
    ds.mdsId && ctx.dataSource
      ? await ctx.dataSource.opensearch.getClient(ds.mdsId)
      : ctx.core.opensearch.client.asCurrentUser;

  return {
    ruler: rulerClient,
    client,
    datasource: ds as Datasource,
    // FIXME(pr-2): this is the single site where PR 1 hard-codes the
    // deploy-context workspace id. PR 2 will resolve the real workspace
    // from OSD's request scope (`core.workspace.resolveRequest(req)`) and
    // may refuse the write when the workspace isn't resolvable. The
    // service layer already threads the value through `sloRulerNamespaceFor`
    // so the AMP invariant ("every rule group for workspace W writes to
    // `slo-generated-<W>`") holds regardless of how this value was
    // obtained; PR 1 ships the plumbing, PR 2 ships the resolver. See the
    // cross-workspace integration test for the invariant's service-layer
    // contract (`common/slo/__tests__/slo_workspace_isolation.integration.test.ts`).
    workspaceId: 'default',
  };
}

async function tryBuildDeployContext(
  ctx: SloHandlerContext,
  datasourceId: string | undefined,
  rulerClient: RulerClient | undefined,
  logger: Logger
): Promise<
  | { deploy: SloDeployContext | undefined; errorResponse?: undefined }
  | { deploy?: undefined; errorResponse: { status: number; body: Record<string, unknown> } }
> {
  try {
    const deploy = await buildDeployContext(ctx, datasourceId, rulerClient, logger);
    return { deploy };
  } catch (e) {
    if (e instanceof SloValidationError) {
      return {
        errorResponse: {
          status: 400,
          body: { error: 'Validation failed', errors: e.errors },
        },
      };
    }
    throw e;
  }
}

function buildStatusContext(
  ctx: SloHandlerContext,
  logger: Logger,
  ruleDedupEnabled?: boolean
): SloStatusAggregationContext | undefined {
  const client = ctx.core.opensearch.client.asCurrentUser;
  const datasourceService = new SavedObjectDatasourceService(ctx.core.savedObjects.client, logger);
  return {
    client,
    // FIXME(pr-2): same as `buildDeployContext` — workspace id is hard-
    // coded to 'default' in PR 1 and will be resolved from request scope
    // in PR 2. Listing/status paths are read-only today; safe placeholder.
    workspaceId: 'default',
    resolveDatasource: async (datasourceId: string) => {
      const ds = await datasourceService.get(datasourceId);
      if (!ds) return undefined;
      return ds as Datasource;
    },
    ruleDedupEnabled,
  };
}

// ============================================================================
// Registration
// ============================================================================

export interface RegisterSloRoutesOptions {
  router: IRouter;
  sloService: SloService;
  logger: Logger;
  rulerClient?: RulerClient;
  /** Gates fingerprint-keyed selectors on the aggregator (PR-3+). */
  ruleDedupEnabled?: boolean;
}

export function registerSloRoutes(options: RegisterSloRoutesOptions) {
  const { router, sloService, logger, rulerClient, ruleDedupEnabled = false } = options;

  router.get(
    {
      path: SLO_BASE,
      validate: {
        query: schema.object({
          page: schema.maybe(schema.string()),
          pageSize: schema.maybe(schema.string()),
          datasourceId: schema.maybe(schema.string()),
          state: schema.maybe(schema.string()),
          sliBackend: schema.maybe(schema.string()),
          sliLeafType: schema.maybe(schema.string()),
          service: schema.maybe(schema.string()),
          team: schema.maybe(schema.string()),
          tier: schema.maybe(schema.string()),
          canonicalKind: schema.maybe(schema.string()),
          enabled: schema.maybe(schema.string()),
          mode: schema.maybe(schema.string()),
          search: schema.maybe(schema.string()),
        }),
      },
    },
    async (ctx, req, res) => {
      const q = req.query;
      const filters = {
        page: q.page ? parseInt(q.page, 10) : undefined,
        pageSize: q.pageSize ? parseInt(q.pageSize, 10) : undefined,
        datasourceId: q.datasourceId ? q.datasourceId.split(',').filter(Boolean) : undefined,
        state: q.state
          ? (q.state.split(',') as Array<
              'breached' | 'warning' | 'ok' | 'no_data' | 'stale' | 'disabled'
            >)
          : undefined,
        sliBackend: q.sliBackend
          ? (q.sliBackend.split(',') as Array<'prometheus' | 'opensearch'>)
          : undefined,
        sliLeafType: q.sliLeafType ? q.sliLeafType.split(',') : undefined,
        service: q.service ? q.service.split(',') : undefined,
        team: q.team ? q.team.split(',') : undefined,
        tier: q.tier ? q.tier.split(',') : undefined,
        canonicalKind: q.canonicalKind
          ? (q.canonicalKind.split(',') as Array<
              | 'apm-availability'
              | 'apm-latency'
              | 'http-availability'
              | 'http-latency'
              | 'rpc-availability'
              | 'rpc-latency'
              | 'db-latency'
              | 'messaging-latency'
              | 'genai-availability'
            >)
          : undefined,
        enabled: q.enabled === undefined ? undefined : q.enabled === 'true',
        mode: q.mode ? (q.mode.split(',') as Array<'active' | 'shadow'>) : undefined,
        search: q.search,
      };
      const statusCtx = buildStatusContext(ctx as SloHandlerContext, logger, ruleDedupEnabled);
      const result = await handleListSLOs(sloService, filters, logger, statusCtx);
      if (result.status >= 400) {
        return res.customError({
          statusCode: result.status,
          body: { message: String((result.body as { error?: string }).error ?? 'Failed') },
        });
      }
      return res.ok({ body: result.body });
    }
  );

  router.post({ path: SLO_BASE, validate: { body: createBody } }, async (ctx, req, res) => {
    const built = await tryBuildDeployContext(
      ctx as SloHandlerContext,
      req.body?.spec?.datasourceId,
      rulerClient,
      logger
    );
    if (built.errorResponse) {
      return res.customError({
        statusCode: built.errorResponse.status,
        body: {
          message: String(
            (built.errorResponse.body as { error?: string }).error ?? 'Create failed'
          ),
          attributes: built.errorResponse.body,
        },
      });
    }
    const result = await handleCreateSLO(
      sloService,
      req.body,
      resolveActingUser(req),
      logger,
      built.deploy
    );
    if (result.status === 201) return res.ok({ body: result.body });
    return res.customError({
      statusCode: result.status,
      body: {
        message: String((result.body as { error?: string }).error ?? 'Create failed'),
        attributes: result.body,
      },
    });
  });

  router.post(
    { path: `${SLO_BASE}/preview`, validate: { body: previewBody } },
    async (_ctx, req, res) => {
      const result = await handlePreviewSLORules(sloService, req.body, logger);
      if (result.status === 200) return res.ok({ body: result.body });
      return res.customError({
        statusCode: result.status,
        body: {
          message: String((result.body as { error?: string }).error ?? 'Preview failed'),
          attributes: result.body,
        },
      });
    }
  );

  router.post(
    {
      path: `${SLO_BASE}/statuses`,
      validate: { body: schema.object({ ids: schema.arrayOf(schema.string()) }) },
    },
    async (ctx, req, res) => {
      const statusCtx = buildStatusContext(ctx as SloHandlerContext, logger, ruleDedupEnabled);
      const result = await handleGetSLOStatuses(sloService, req.body.ids, logger, statusCtx);
      if (result.status === 200) return res.ok({ body: result.body });
      return res.customError({
        statusCode: result.status,
        body: { message: String((result.body as { error?: string }).error ?? 'Failed') },
      });
    }
  );

  router.get(
    {
      path: `${SLO_BASE}/{id}`,
      validate: { params: schema.object({ id: schema.string() }) },
    },
    async (ctx, req, res) => {
      const statusCtx = buildStatusContext(ctx as SloHandlerContext, logger, ruleDedupEnabled);
      const result = await handleGetSLO(sloService, req.params.id, logger, statusCtx);
      if (result.status === 200) return res.ok({ body: result.body });
      return res.customError({
        statusCode: result.status,
        body: { message: String((result.body as { error?: string }).error ?? 'Not found') },
      });
    }
  );

  router.put(
    {
      path: `${SLO_BASE}/{id}`,
      validate: {
        params: schema.object({ id: schema.string() }),
        body: updateBody,
      },
    },
    async (ctx, req, res) => {
      const existing = await sloService.get(req.params.id);
      const built = await tryBuildDeployContext(
        ctx as SloHandlerContext,
        existing?.spec.datasourceId,
        rulerClient,
        logger
      );
      if (built.errorResponse) {
        return res.customError({
          statusCode: built.errorResponse.status,
          body: {
            message: String(
              (built.errorResponse.body as { error?: string }).error ?? 'Update failed'
            ),
            attributes: built.errorResponse.body,
          },
        });
      }
      const result = await handleUpdateSLO(
        sloService,
        req.params.id,
        req.body,
        resolveActingUser(req),
        logger,
        built.deploy
      );
      if (result.status === 200) return res.ok({ body: result.body });
      return res.customError({
        statusCode: result.status,
        body: {
          message: String((result.body as { error?: string }).error ?? 'Update failed'),
          attributes: result.body,
        },
      });
    }
  );

  router.delete(
    {
      path: `${SLO_BASE}/{id}`,
      validate: { params: schema.object({ id: schema.string() }) },
    },
    async (ctx, req, res) => {
      const existing = await sloService.get(req.params.id);
      const built = await tryBuildDeployContext(
        ctx as SloHandlerContext,
        existing?.spec.datasourceId,
        rulerClient,
        logger
      );
      if (built.errorResponse) {
        return res.customError({
          statusCode: built.errorResponse.status,
          body: {
            message: String(
              (built.errorResponse.body as { error?: string }).error ?? 'Delete failed'
            ),
            attributes: built.errorResponse.body,
          },
        });
      }
      const result = await handleDeleteSLO(sloService, req.params.id, logger, built.deploy);
      if (result.status === 200) return res.ok({ body: result.body });
      return res.customError({
        statusCode: result.status,
        body: {
          message: String((result.body as { error?: string }).error ?? 'Delete failed'),
          attributes: result.body as Record<string, unknown>,
        },
      });
    }
  );

  router.post(
    {
      path: `${SLO_BASE}/{id}/enable`,
      validate: { params: schema.object({ id: schema.string() }) },
    },
    async (ctx, req, res) => {
      const existing = await sloService.get(req.params.id);
      const built = await tryBuildDeployContext(
        ctx as SloHandlerContext,
        existing?.spec.datasourceId,
        rulerClient,
        logger
      );
      if (built.errorResponse) {
        return res.customError({
          statusCode: built.errorResponse.status,
          body: {
            message: String(
              (built.errorResponse.body as { error?: string }).error ?? 'Enable failed'
            ),
            attributes: built.errorResponse.body,
          },
        });
      }
      const result = await handleEnableSLO(
        sloService,
        req.params.id,
        resolveActingUser(req),
        logger,
        built.deploy
      );
      if (result.status === 200) return res.ok({ body: result.body });
      return res.customError({
        statusCode: result.status,
        body: { message: String((result.body as { error?: string }).error ?? 'Enable failed') },
      });
    }
  );

  router.post(
    {
      path: `${SLO_BASE}/{id}/disable`,
      validate: { params: schema.object({ id: schema.string() }) },
    },
    async (ctx, req, res) => {
      const existing = await sloService.get(req.params.id);
      const built = await tryBuildDeployContext(
        ctx as SloHandlerContext,
        existing?.spec.datasourceId,
        rulerClient,
        logger
      );
      if (built.errorResponse) {
        return res.customError({
          statusCode: built.errorResponse.status,
          body: {
            message: String(
              (built.errorResponse.body as { error?: string }).error ?? 'Disable failed'
            ),
            attributes: built.errorResponse.body,
          },
        });
      }
      const result = await handleDisableSLO(
        sloService,
        req.params.id,
        resolveActingUser(req),
        logger,
        built.deploy
      );
      if (result.status === 200) return res.ok({ body: result.body });
      return res.customError({
        statusCode: result.status,
        body: { message: String((result.body as { error?: string }).error ?? 'Disable failed') },
      });
    }
  );
}
