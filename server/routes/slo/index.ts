/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OSD route adapter for SLO CRUD. Routes are versioned under
 * `${OBSERVABILITY_BASE}/v1/slos` so a future schema change can coexist
 * with v1 behind a new prefix.
 */

import { schema } from '@osd/config-schema';
import type {
  IRouter,
  Logger,
  OpenSearchDashboardsRequest,
  RequestHandlerContext,
} from '../../../../../src/core/server';
import { getWorkspaceState } from '../../../../../src/core/server/utils';
import { OBSERVABILITY_BASE } from '../../../common/constants/shared';
import type {
  SloDeployContext,
  SloStatusAggregationContext,
} from '../../../common/slo/slo_service';
import { SloService, SloValidationError, WORKSPACE_ID_RE } from '../../../common/slo/slo_service';
import type { AlertingOSClient, Datasource } from '../../../common/types/alerting';
import type { InMemoryDatasourceService } from '../../services/alerting/datasource_service';
import type { DatasourceDiscoveryService } from '../../services/alerting/datasource_discovery';
import type { DirectQueryPrometheusBackend } from '../../services/alerting/directquery_prometheus_backend';
import type { RulerClient } from '../../services/slo/ruler_client';
import type { RuleHealthChecker } from '../../services/slo/rule_health_checker';
import {
  handleCreateSLO,
  handleDeleteSLO,
  handleDisableSLO,
  handleEnableSLO,
  handleGetRuleHealth,
  handleGetSLO,
  handleGetSLOStatuses,
  handleListSLOs,
  handlePreviewSLORules,
  handleRepairSLO,
  handleUpdateSLO,
} from './handlers';
import { registerProbeSliRoute } from './probe_sli';
import { registerSloAggregateRoute } from './aggregate_route';

/**
 * OSD context type with the optional `dataSource` plugin extension. Same
 * shape used by the alerting routes — declared here so SLO routes don't
 * reach into the alerting tree for it.
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
// Nested objects forbid unknown keys so a client cannot smuggle arbitrary
// fields through to the persisted saved-object spec (the SO writer
// shallow-spreads validated input). Add fields to the schema explicitly
// when extending the shape.
// ============================================================================

const dimensionSchema = schema.object({
  name: schema.string({ minLength: 1, maxLength: 128 }),
  // Empty-string values are legitimate Prometheus matchers (`label=""`
  // matches series where the label is absent or empty) — Data Prepper
  // relies on `remoteService=""` to scope to server-side spans. The
  // service-layer validator catches truly invalid inputs (control chars,
  // unsafe chars) — let the route layer accept the empty case.
  value: schema.string({ maxLength: 256 }),
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
  { unknowns: 'forbid' }
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
  { unknowns: 'forbid' }
);

const sliNodeSchema = schema.object(
  {
    type: schema.oneOf([schema.literal('single'), schema.literal('composite')]),
    // Single arm — keys below. Composite reserved for P2; let the service layer reject.
    definition: schema.maybe(prometheusSliSchema),
    dimensions: schema.maybe(schema.arrayOf(dimensionSchema)),
    // Composite arm keys (reserved)
    operator: schema.maybe(schema.oneOf([schema.literal('all'), schema.literal('any')])),
    members: schema.maybe(schema.arrayOf(schema.object({}, { unknowns: 'allow' }))),
  },
  { unknowns: 'forbid' }
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
  { unknowns: 'forbid' }
);

const alertingSchema = schema.object(
  {
    strategy: schema.literal('mwmbr'),
    burnRates: schema.arrayOf(burnRateSchema),
  },
  { unknowns: 'forbid' }
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
  { unknowns: 'forbid' }
);

const budgetWarningThresholdSchema = schema.object({
  threshold: schema.number({ min: 0.01, max: 0.99 }),
  severity: schema.string({ minLength: 1 }),
});

const canonicalKindSchema = schema.oneOf([
  schema.literal('apm-availability'),
  schema.literal('apm-latency'),
  schema.literal('http-availability'),
  schema.literal('http-latency'),
  schema.literal('rpc-availability'),
  schema.literal('rpc-latency'),
  schema.literal('db-latency'),
  schema.literal('messaging-latency'),
  schema.literal('genai-availability'),
]);

const sloSpecSchema = schema.object(
  {
    datasourceId: schema.string({ minLength: 1 }),
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
    canonicalKind: schema.maybe(canonicalKindSchema),
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
  { unknowns: 'forbid' }
);

/**
 * Partial spec schema for PUT (update) and preview. Mirrors `sloSpecSchema`
 * but every top-level field is optional so partial patches still validate.
 * Inner shapes stay strict — a field that *is* sent must match the strict
 * shape, so a malformed `objectives[i]` or `sli` can't land at the service
 * via a typo.
 */
const sloSpecPartialSchema = schema.object(
  {
    datasourceId: schema.maybe(schema.string({ minLength: 1 })),
    name: schema.maybe(schema.string({ minLength: 1, maxLength: 128 })),
    description: schema.maybe(schema.string()),
    enabled: schema.maybe(schema.boolean()),
    mode: schema.maybe(schema.oneOf([schema.literal('active'), schema.literal('shadow')])),
    service: schema.maybe(schema.string({ minLength: 1 })),
    owner: schema.maybe(
      schema.object({
        teams: schema.arrayOf(schema.string(), { minSize: 1 }),
        primaryUser: schema.maybe(schema.string()),
      })
    ),
    tier: schema.maybe(schema.string()),
    canonicalKind: schema.maybe(canonicalKindSchema),
    sli: schema.maybe(sliNodeSchema),
    objectives: schema.maybe(schema.arrayOf(objectiveSchema, { minSize: 1 })),
    budgetWarningThresholds: schema.maybe(schema.arrayOf(budgetWarningThresholdSchema)),
    window: schema.maybe(windowSchema),
    alerting: schema.maybe(alertingSchema),
    alarms: schema.maybe(alarmsSchema),
    exclusionWindows: schema.maybe(schema.arrayOf(exclusionWindowSchema)),
    labels: schema.maybe(
      schema.recordOf(
        schema.string(),
        schema.oneOf([schema.string(), schema.arrayOf(schema.string())])
      )
    ),
    annotations: schema.maybe(schema.recordOf(schema.string(), schema.string())),
  },
  { unknowns: 'forbid' }
);

const createBody = schema.object({
  id: schema.maybe(schema.string()),
  spec: sloSpecSchema,
});

// Update accepts a partial spec — consumer supplies only the fields they're
// changing plus the version for optimistic concurrency. Inner shapes stay
// strict via `sloSpecPartialSchema` so a malformed `sli` / `objectives[i]`
// can't bypass route-level validation by exploiting a wide-open `spec`.
const updateBody = schema.object({
  version: schema.number({ min: 1 }),
  spec: sloSpecPartialSchema,
});

// Preview accepts an incomplete spec so the wizard can render the rule YAML
// as the user fills the form. Uses the same partial schema as PUT — the
// service's `validateSloSpec` still rejects truly-broken specs and the
// handler returns a 400 with field-keyed errors.
const previewBody = schema.object({
  id: schema.maybe(schema.string()),
  spec: sloSpecPartialSchema,
});

// ============================================================================
// Registration
// ============================================================================

/**
 * Build the per-request SloDeployContext the service needs to dual-write to
 * the ruler on create/update/delete.
 *
 * Returns `undefined` (no ruler call, but the SO still writes) ONLY when the
 * caller genuinely didn't ask for a ruler write — i.e. the plugin is running
 * without a ruler client or datasource service (tests, offline dev), or the
 * request carried no `datasourceId` at all.
 *
 * If the caller did supply a `datasourceId` but we can't resolve it — the
 * datasource isn't discovered, or it isn't a DirectQuery Prometheus — throws
 * `SloValidationError`. This prevents the prior failure mode where a
 * typo'd datasource ID produced a silent no-op: the SO saved, the UI
 * reported "N rules provisioned", but Cortex never received the rule group.
 *
 * TODO: derive `workspaceId` from OSD's workspace scope once the SLO spec
 * carries a workspace reference. For now the datasource ID doubles as a
 * tenant discriminator — safe because `slo-generated-<ds>` is deterministic
 * and unique per Prometheus connection.
 */
async function buildDeployContext(
  ctx: SloHandlerContext,
  request: OpenSearchDashboardsRequest,
  datasourceId: string | undefined,
  rulerClient: RulerClient | undefined,
  datasourceService: InMemoryDatasourceService | undefined,
  discoveryService: DatasourceDiscoveryService | undefined,
  logger: Logger
): Promise<SloDeployContext | undefined> {
  if (!rulerClient || !datasourceService || !datasourceId) return undefined;

  // Hydrate the datasource registry from OSD saved objects before the lookup.
  // The alerting routes populate the registry lazily on their first call; SLO
  // routes can arrive first on cold start (e.g., the user lands on the SLO
  // detail page directly after a restart). Without this the lookup would
  // spuriously report "not registered" even though the datasource exists in
  // the OSD saved-object store.
  if (discoveryService) {
    await discoveryService.ensure(ctx);
  }

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

  // Local-cluster fallback (no MDS) — the alerting routes use the same pattern.
  const client: AlertingOSClient =
    ds.mdsId && ctx.dataSource
      ? await ctx.dataSource.opensearch.getClient(ds.mdsId)
      : ctx.core.opensearch.client.asCurrentUser;

  // Use the resolved canonical id (`ds-N`) — not the raw request input. The
  // datasource service accepts `directQueryName` / display `name` as a
  // fallback, so the input may be a free-text name with spaces or other chars
  // that fail the WORKSPACE_ID_RE shape check inside `sloRulerNamespaceFor`.
  // Routing that lower-level throw up as a 500 is unactionable for the user;
  // by the time we're here, `ds.id` is registry-issued and shape-safe.
  const workspaceId = ds.id;
  if (!WORKSPACE_ID_RE.test(workspaceId)) {
    throw new SloValidationError({
      'spec.datasourceId': `Datasource id "${workspaceId}" is not a valid workspace id; expected ${WORKSPACE_ID_RE}.`,
    });
  }

  // Real OSD workspace id, distinct from the namespace key (`workspaceId`
  // = datasource id). Drives slo-rule-ref refcount partitioning + per-SLO
  // alert-group naming under A.4. Falls back to 'default' on
  // non-workspace-enabled clusters (`getWorkspaceState` returns an empty
  // record) and on synthetic test requests that don't carry a Hapi `.app`
  // bag — `getWorkspaceState` then throws, which we trap here so the
  // route stays valid in test wiring.
  let OSDWorkspaceId = 'default';
  try {
    OSDWorkspaceId = getWorkspaceState(request).requestWorkspaceId ?? 'default';
  } catch {
    // Synthetic test request without `.app`. Keep the default fallback.
  }

  return {
    ruler: rulerClient,
    client,
    datasource: ds as Datasource,
    workspaceId,
    OSDWorkspaceId,
  };
}

/**
 * Wrap `buildDeployContext` so the route adapter can distinguish "no deploy
 * intended" (undefined → continue, SO-only write) from "deploy requested but
 * the datasource was unresolvable" (validation error → 400 with field-keyed
 * message the wizard can render inline at `spec.datasourceId`).
 */
async function tryBuildDeployContext(
  ctx: SloHandlerContext,
  request: OpenSearchDashboardsRequest,
  datasourceId: string | undefined,
  rulerClient: RulerClient | undefined,
  datasourceService: InMemoryDatasourceService | undefined,
  discoveryService: DatasourceDiscoveryService | undefined,
  logger: Logger
): Promise<
  | { deploy: SloDeployContext | undefined; errorResponse?: undefined }
  | { deploy?: undefined; errorResponse: { status: number; body: Record<string, unknown> } }
> {
  try {
    const deploy = await buildDeployContext(
      ctx,
      request,
      datasourceId,
      rulerClient,
      datasourceService,
      discoveryService,
      logger
    );
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

/**
 * Build a per-request context for the live-status aggregator. Uses the same
 * OSD scoped client as the deploy context + the alerting datasource service
 * to resolve `directQueryName` per SLO.
 *
 * Returns undefined when the alerting datasource service isn't available
 * (e.g. offline dev) — SloService falls through to the stub.
 *
 * TODO: pull real workspaceId from OSD request scope once plumbed. Today
 * we use the alerting default workspace ('default').
 */
function buildStatusContext(
  ctx: SloHandlerContext,
  datasourceService: InMemoryDatasourceService | undefined,
  discoveryService: DatasourceDiscoveryService | undefined,
  ruleHealthChecker: RuleHealthChecker | undefined,
  ruleDedupEnabled?: boolean,
  request?: OpenSearchDashboardsRequest
): SloStatusAggregationContext | undefined {
  if (!datasourceService) return undefined;
  const client = ctx.core.opensearch.client.asCurrentUser;
  // Derive the OSD workspace from the request URL prefix so refcount /
  // status reads target the same partition as the caller's writes. The
  // wrappers tag SOs by this id; mismatched lookups silently return the
  // wrong tenant's data (the `default` workspace's row when the caller is
  // actually in `Z6xlzn`, etc.). Falls back to 'default' when workspace is
  // disabled or the request has no `.app` bag (synthetic test wiring).
  let workspaceId = 'default';
  if (request) {
    try {
      workspaceId = getWorkspaceState(request).requestWorkspaceId ?? 'default';
    } catch {
      // No-op: keep the 'default' fallback for non-workspace clusters.
    }
  }
  return {
    client,
    // The aggregator routes PromQL queries through the data plugin's
    // search service (`strategy: 'PROMQL'`), which needs an OSD
    // RequestHandlerContext to resolve scoped clients (including MDS).
    // `ctx` here is exactly that context — pass it through.
    requestContext: ctx,
    workspaceId,
    resolveDatasource: async (datasourceId: string) => {
      if (discoveryService) {
        await discoveryService.ensure(ctx);
      }
      const ds = await datasourceService.get(datasourceId);
      if (!ds) return undefined;
      // If this datasource is MDS-scoped, prefer that client — but we only
      // have one client per request here, so for P0 we just return the
      // datasource with whatever scoped client the handler started with.
      // This is equivalent to how read-path /api/alerting/unified/rules
      // works today (single scoped client per request).
      return ds as Datasource;
    },
    // Health-check overlay: if the health checker is available, the
    // aggregator overlays `rules_missing` / `ruler_unreachable` on top of
    // the sample-derived state. When absent (offline dev / tests), the
    // aggregator falls through to the existing derivation.
    healthChecker: ruleHealthChecker,
    // Propagate the dedup flag so the aggregator can pick fingerprint-keyed
    // selectors when true.
    ruleDedupEnabled,
  };
}

/**
 * Options bag for `registerSloRoutes`. Every field except `router`,
 * `sloService`, and `logger` is optional so offline-dev and test wiring can
 * omit downstream deps.
 */
export interface RegisterSloRoutesOptions {
  router: IRouter;
  sloService: SloService;
  logger: Logger;
  rulerClient?: RulerClient;
  datasourceService?: InMemoryDatasourceService;
  discoveryService?: DatasourceDiscoveryService;
  prometheusBackend?: DirectQueryPrometheusBackend;
  ruleHealthChecker?: RuleHealthChecker;
  /** Gates fingerprint-keyed selectors on the aggregator. */
  ruleDedupEnabled?: boolean;
}

export function registerSloRoutes(options: RegisterSloRoutesOptions) {
  const {
    router,
    sloService,
    logger,
    rulerClient,
    datasourceService,
    discoveryService,
    prometheusBackend,
    ruleHealthChecker,
    ruleDedupEnabled = false,
  } = options;
  if (prometheusBackend) {
    registerProbeSliRoute(router, logger, prometheusBackend, datasourceService, discoveryService);
  }

  // F1 — per-service aggregate rollup. Registered ahead of the list route so
  // the `/_aggregate` path isn't shadowed by the `/{id}` catch-all.
  registerSloAggregateRoute(
    router,
    sloService,
    logger,
    (ctx, req) =>
      buildStatusContext(
        ctx,
        datasourceService,
        discoveryService,
        ruleHealthChecker,
        ruleDedupEnabled,
        req
      ),
    datasourceService,
    discoveryService
  );

  router.get(
    {
      path: SLO_BASE,
      validate: {
        query: schema.object({
          /**
           * @deprecated retained for clients mid-upgrade. New callers send
           * `cursor` instead. When both are present, `cursor` wins and
           * `page` is ignored.
           */
          page: schema.maybe(schema.string()),
          pageSize: schema.maybe(schema.string()),
          /** Opaque base64url cursor; produced by a prior listing call. */
          cursor: schema.maybe(schema.string()),
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
      const statusCtx = buildStatusContext(
        ctx as SloHandlerContext,
        datasourceService,
        discoveryService,
        ruleHealthChecker,
        ruleDedupEnabled,
        req
      );
      const result = await handleListSLOs(sloService, filters, logger, statusCtx, req, q.cursor);
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
    // TODO: once request auth context is wired, pull from req.auth.
    const built = await tryBuildDeployContext(
      ctx as SloHandlerContext,
      req,
      req.body?.spec?.datasourceId,
      rulerClient,
      datasourceService,
      discoveryService,
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
      'osd-user',
      logger,
      built.deploy,
      req
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
      const statusCtx = buildStatusContext(
        ctx as SloHandlerContext,
        datasourceService,
        discoveryService,
        ruleHealthChecker,
        ruleDedupEnabled,
        req
      );
      const result = await handleGetSLOStatuses(sloService, req.body.ids, logger, statusCtx, req);
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
      const statusCtx = buildStatusContext(
        ctx as SloHandlerContext,
        datasourceService,
        discoveryService,
        ruleHealthChecker,
        ruleDedupEnabled,
        req
      );
      const result = await handleGetSLO(sloService, req.params.id, logger, statusCtx, req);
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
      // The update body may not carry datasourceId (partial spec); fetch the
      // existing doc to resolve the datasource for the deploy context.
      const existing = await sloService.get(req.params.id, req);
      const built = await tryBuildDeployContext(
        ctx as SloHandlerContext,
        req,
        existing?.spec.datasourceId,
        rulerClient,
        datasourceService,
        discoveryService,
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
        'osd-user',
        logger,
        built.deploy,
        req
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
      const existing = await sloService.get(req.params.id, req);
      // Delete is ruler-first, SO-second — if there's a rule group to remove,
      // we need a working deploy context (i.e. a resolvable datasource). An
      // unresolvable datasource here surfaces to the user as a 409: dropping
      // the SO while the rule group stays live in Cortex would leave dead
      // alerts evaluating against the cluster.
      const built = await tryBuildDeployContext(
        ctx as SloHandlerContext,
        req,
        existing?.spec.datasourceId,
        rulerClient,
        datasourceService,
        discoveryService,
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
      const result = await handleDeleteSLO(sloService, req.params.id, logger, built.deploy, req);
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
      const existing = await sloService.get(req.params.id, req);
      const built = await tryBuildDeployContext(
        ctx as SloHandlerContext,
        req,
        existing?.spec.datasourceId,
        rulerClient,
        datasourceService,
        discoveryService,
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
        'osd-user',
        logger,
        built.deploy,
        req
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
      const existing = await sloService.get(req.params.id, req);
      const built = await tryBuildDeployContext(
        ctx as SloHandlerContext,
        req,
        existing?.spec.datasourceId,
        rulerClient,
        datasourceService,
        discoveryService,
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
        'osd-user',
        logger,
        built.deploy,
        req
      );
      if (result.status === 200) return res.ok({ body: result.body });
      return res.customError({
        statusCode: result.status,
        body: { message: String((result.body as { error?: string }).error ?? 'Disable failed') },
      });
    }
  );

  // --------------------------------------------------------------------------
  // Repair + rule_health
  //
  // Both routes require a resolved deploy context (a DirectQuery-Prometheus
  // datasource that exists in the registry) AND a `ruleHealthChecker`. When
  // the caller didn't supply a checker we still register the routes so tests
  // can rely on the path being present; the handlers return 501 themselves.
  // --------------------------------------------------------------------------
  router.post(
    {
      path: `${SLO_BASE}/{id}/repair`,
      validate: { params: schema.object({ id: schema.string() }) },
    },
    async (ctx, req, res) => {
      const existing = await sloService.get(req.params.id, req);
      if (!existing) {
        return res.customError({
          statusCode: 404,
          body: { message: 'SLO not found' },
        });
      }
      const built = await tryBuildDeployContext(
        ctx as SloHandlerContext,
        req,
        existing.spec.datasourceId,
        rulerClient,
        datasourceService,
        discoveryService,
        logger
      );
      if (built.errorResponse) {
        return res.customError({
          statusCode: built.errorResponse.status,
          body: {
            message: String(
              (built.errorResponse.body as { error?: string }).error ?? 'Repair failed'
            ),
            attributes: built.errorResponse.body,
          },
        });
      }
      const result = await handleRepairSLO(
        sloService,
        req.params.id,
        logger,
        {
          health: ruleHealthChecker,
          deploy: built.deploy,
        },
        req
      );
      if (result.status === 200) return res.ok({ body: result.body });
      return res.customError({
        statusCode: result.status,
        body: {
          message: String((result.body as { error?: string }).error ?? 'Repair failed'),
          attributes: result.body as Record<string, unknown>,
        },
      });
    }
  );

  router.get(
    {
      path: `${SLO_BASE}/{id}/rule_health`,
      validate: { params: schema.object({ id: schema.string() }) },
    },
    async (ctx, req, res) => {
      const existing = await sloService.get(req.params.id, req);
      if (!existing) {
        return res.customError({
          statusCode: 404,
          body: { message: 'SLO not found' },
        });
      }
      const built = await tryBuildDeployContext(
        ctx as SloHandlerContext,
        req,
        existing.spec.datasourceId,
        rulerClient,
        datasourceService,
        discoveryService,
        logger
      );
      if (built.errorResponse) {
        return res.customError({
          statusCode: built.errorResponse.status,
          body: {
            message: String(
              (built.errorResponse.body as { error?: string }).error ?? 'Rule health probe failed'
            ),
            attributes: built.errorResponse.body,
          },
        });
      }
      const result = await handleGetRuleHealth(
        sloService,
        req.params.id,
        logger,
        {
          health: ruleHealthChecker,
          deploy: built.deploy,
        },
        req
      );
      if (result.status === 200) return res.ok({ body: result.body });
      return res.customError({
        statusCode: result.status,
        body: {
          message: String((result.body as { error?: string }).error ?? 'Rule health probe failed'),
          attributes: result.body as Record<string, unknown>,
        },
      });
    }
  );
}
