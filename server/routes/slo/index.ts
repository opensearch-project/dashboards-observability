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
import {
  SloService,
  SloValidationError,
  sloRulerNamespaceFor,
} from '../../../common/slo/slo_service';
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
  { unknowns: 'allow' }
);

/**
 * Partial spec schema for PUT (update) and preview. Mirrors `sloSpecSchema`
 * but every top-level field is optional so partial patches still validate.
 * Inner shapes stay strict — a field that *is* sent must match the strict
 * shape, so a malformed `objectives[i]` or `sli` can't land at the service
 * via a typo. Field-level `unknowns: 'allow'` is preserved on inner shapes
 * to stay forgiving of older clients that send extra keys.
 */
const sloSpecPartialSchema = schema.object(
  {
    datasourceId: schema.maybe(schema.string({ minLength: 1 })),
    workspaceId: schema.maybe(schema.string()),
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
  { unknowns: 'allow' }
);

const createBody = schema.object({
  id: schema.maybe(schema.string()),
  spec: sloSpecSchema,
});

const updateBody = schema.object({
  version: schema.number({ min: 1 }),
  spec: sloSpecPartialSchema,
});

const previewBody = schema.object({
  id: schema.maybe(schema.string()),
  // Preview is dry-run but the user expects the same field-level rejections
  // they'd hit on create — share the strict spec schema so the wizard can't
  // compose a preview with a malformed `objectives[i]` or unknown `mode`.
  spec: sloSpecSchema,
});

// ============================================================================
// Acting user
// ============================================================================

/**
 * Pull a single string from a header value that may be a string, an array
 * (multi-valued header), or undefined. Trims and rejects empty strings so
 * a `''` header doesn't get stamped as the acting user.
 */
function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    for (const v of value) {
      const trimmed = typeof v === 'string' ? v.trim() : '';
      if (trimmed) return trimmed;
    }
    return undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  return undefined;
}

/**
 * Resolve the acting user for audit fields (`createdBy` / `updatedBy`).
 *
 * Lookup order:
 *   1. `req.auth.credentials.username` — populated by the OpenSearch
 *      security plugin's auth handler when installed.
 *   2. `x-proxy-user` request header — set by SAML / proxy auth setups.
 *   3. `x-forwarded-user` request header — set by reverse proxies that
 *      front the cluster.
 *   4. `'unknown'` — when no signal is available (security plugin
 *      disabled, no proxy, anonymous request).
 *
 * The header names mirror the `auth.unsupported_trusted_header` config the
 * security plugin documents, so deployments that already use one of those
 * proxy auth modes get the right `createdBy` for free.
 */
/**
 * Cap on persisted `createdBy` / `updatedBy` length. The OpenSearch index
 * mapping for these fields has its own bounds; this gate also closes off
 * a payload-bloat vector where a malicious proxy injects a megabyte-scale
 * header value into every audit row.
 */
const ACTING_USER_MAX_LENGTH = 255;

/**
 * Reason a candidate username was rejected. Surfaced to the caller so it
 * can emit a structured debug log per rejection — preserves forensic
 * signal when a malicious proxy injects values that get sanitized away
 * (otherwise the chain falls through to `'unknown'` with no trail).
 *
 * `'empty'` is semantically distinct from the security rejections — it's
 * "this slot wasn't populated", which is the common case for an unset
 * header. The caller (`tryResolveActingUser`) suppresses logging for
 * `'empty'` to keep debug noise bounded; the other reasons always log
 * since they signal either a misconfigured proxy or an injection attempt.
 */
type SanitizeRejectReason = 'empty' | 'too-long' | 'control-chars';

/**
 * Sanitize a candidate username before it lands in the audit fields.
 *
 * Returns the trimmed value when accepted, or a rejection reason. The
 * caller maps reasons to debug-level logs.
 *
 * - `too-long`: length exceeds `ACTING_USER_MAX_LENGTH`. We reject rather
 *   than truncate, since truncation could collapse two distinct
 *   identities to the same prefix.
 * - `control-chars`: contains C0 (0x00–0x1f), DEL (0x7f), or C1
 *   (0x80–0x9f) control characters. These are the realistic injection
 *   vectors (log injection, CRLF response splitting, NEL line breaks).
 *   We reject rather than strip so the caller's fallback chain keeps
 *   working when a misconfigured proxy injects junk.
 *
 * Realistic usernames span email (`alice@example.com`), LDAP DN
 * (`CN=Alice,OU=Users,DC=example,DC=com`), and Unicode forms; we
 * deliberately don't impose a character allow-list beyond the
 * control-char ban so deployments that use any of those don't silently
 * fall through to `'unknown'`.
 */
function sanitizeActingUser(
  raw: string
): { ok: true; value: string } | { ok: false; reason: SanitizeRejectReason } {
  const trimmed = raw.trim();
  // Empty / whitespace-only is "no signal" rather than a security
  // rejection — every fallback in the chain calls this with a possibly-
  // empty header value. The dedicated `'empty'` reason keeps debug logs
  // accurate (vs. earlier code that misreported these as `'control-chars'`)
  // and the caller suppresses the log line for `'empty'` so we don't
  // flood logs on every unset header.
  if (trimmed.length === 0) return { ok: false, reason: 'empty' };
  if (trimmed.length > ACTING_USER_MAX_LENGTH) return { ok: false, reason: 'too-long' };
  // C0 (0x00-0x1f) + DEL + C1 (0x7f-0x9f) cover ASCII-style injection
  // vectors. Unicode line/paragraph separators (U+2028, U+2029) are also
  // line-terminators in JavaScript and a few logging pipelines, so we
  // ban them as the same class of vector — they're outside the C0/C1
  // ranges so the regex needs them spelled out.
  if (/[\x00-\x1f\x7f-\x9f\u2028\u2029]/.test(trimmed)) {
    return { ok: false, reason: 'control-chars' };
  }
  return { ok: true, value: trimmed };
}

/**
 * Try one step of the resolveActingUser fallback chain. Logs at debug
 * level when sanitization rejects a non-empty candidate so operators can
 * correlate "everything's `unknown`" with the proxy header that
 * caused it.
 */
function tryResolveActingUser(
  raw: string | undefined,
  source: string,
  logger?: Pick<Logger, 'debug'>
): string | null {
  if (raw === undefined) return null;
  const result = sanitizeActingUser(raw);
  if (result.ok) return result.value;
  // `'empty'` is the unset-header case — common, expected, not worth a
  // log line per request. Other reasons (`'too-long'`, `'control-chars'`)
  // signal a misconfigured or hostile proxy and always log.
  if (result.reason !== 'empty') {
    logger?.debug(`resolveActingUser: ${source} rejected (${result.reason}); falling through`);
  }
  return null;
}

export function resolveActingUser(
  req: {
    auth?: { isAuthenticated?: boolean; credentials?: { username?: unknown } };
    headers?: Record<string, string | string[] | undefined>;
  },
  logger?: Pick<Logger, 'debug'>
): string {
  // We deliberately do NOT gate on `auth.isAuthenticated`: proxy-auth
  // deployments populate `credentials.username` without establishing a
  // security session, and we'd rather audit-attribute those writes to the
  // proxied user than fall through to a header read or to 'unknown'.
  //
  // Each candidate runs through `sanitizeActingUser` (length cap + C0/C1
  // control-char ban). A rejected candidate falls through to the next
  // step rather than aborting — a misconfigured proxy that injects a
  // junk header shouldn't poison legitimate auth credentials. Rejections
  // are logged at debug level so a forensics pass can find them.
  const credentials = req.auth?.credentials;
  const username = credentials && (credentials as { username?: unknown }).username;
  if (typeof username === 'string') {
    const cleaned = tryResolveActingUser(username, 'auth.credentials.username', logger);
    if (cleaned) return cleaned;
  }
  const headers = req.headers ?? {};
  const proxyUser = firstHeaderValue(headers['x-proxy-user']);
  const cleanedProxy = tryResolveActingUser(proxyUser, 'x-proxy-user', logger);
  if (cleanedProxy) return cleanedProxy;
  const forwardedUser = firstHeaderValue(headers['x-forwarded-user']);
  const cleanedForwarded = tryResolveActingUser(forwardedUser, 'x-forwarded-user', logger);
  if (cleanedForwarded) return cleanedForwarded;
  // Debug-level (not warn): legitimately anonymous-write deployments
  // exist (security plugin disabled, no proxy auth) and would otherwise
  // pollute warn-level logs on every create/update. The signal is here
  // so operators investigating "why is everything 'unknown'?" can flip
  // log level and confirm the chain is being walked.
  logger?.debug(
    'resolveActingUser: no signal in auth credentials or proxy headers; using "unknown"'
  );
  return 'unknown';
}

// ============================================================================
// Workspace id
// ============================================================================

/**
 * Resolve the workspace id for the request.
 *
 * - When OSD workspaces are enabled, `getWorkspaceState(req).requestWorkspaceId`
 *   carries the id off the request scope (set by the workspace plugin's
 *   `onPreRouting` handler).
 * - When workspaces are disabled (a supported deployment mode) the value is
 *   absent and we fall through to `'default'` — matching the service-layer
 *   contract that `effectiveWorkspaceId = spec.workspaceId ?? 'default'`.
 *
 * The result is then validated against `sloRulerNamespaceFor`'s shape check
 * so a malformed id (path traversal, URL-special chars, overlong, empty)
 * surfaces as a 400 rather than a 500 deep inside ruler dispatch. The
 * AMP invariant — every rule group for workspace W lives in
 * `slo-generated-<W>` — depends on this gate being the only path the
 * value can take to reach the ruler.
 */
export function resolveWorkspaceId(req: OpenSearchDashboardsRequest): string {
  const fromState = getWorkspaceState(req).requestWorkspaceId;
  const candidate = typeof fromState === 'string' && fromState.length > 0 ? fromState : 'default';
  // Throws Error on shape failure; we re-cast to SloValidationError so
  // routes can fall through the existing 400 envelope. Don't echo the
  // candidate value back in the user-visible message — `requestWorkspaceId`
  // is set from the URL path (`/w/<x>`) so it's user-controllable, and
  // reflecting an arbitrary string into the response body invites
  // log-injection / response-splitting style mischief.
  try {
    sloRulerNamespaceFor(candidate);
  } catch (_e) {
    throw new SloValidationError({
      workspaceId:
        'Workspace id is not valid for SLO routing. Workspace ids must match /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.',
    });
  }
  return candidate;
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
 * `workspaceId` is resolved from request scope (`getWorkspaceState`) before
 * this function is called and validated through `sloRulerNamespaceFor`'s
 * regex. The AMP invariant — every rule group for workspace W writes to
 * `slo-generated-<W>` — depends on this validation having already happened
 * before any value reaches the ruler.
 */
async function buildDeployContext(
  ctx: SloHandlerContext,
  workspaceId: string,
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
    workspaceId,
  };
}

async function tryBuildDeployContext(
  ctx: SloHandlerContext,
  req: OpenSearchDashboardsRequest,
  datasourceId: string | undefined,
  rulerClient: RulerClient | undefined,
  logger: Logger
): Promise<
  | { deploy: SloDeployContext | undefined; errorResponse?: undefined }
  | { deploy?: undefined; errorResponse: { status: number; body: Record<string, unknown> } }
> {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const deploy = await buildDeployContext(ctx, workspaceId, datasourceId, rulerClient, logger);
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
  workspaceId: string,
  logger: Logger,
  ruleDedupEnabled?: boolean
): SloStatusAggregationContext | undefined {
  const client = ctx.core.opensearch.client.asCurrentUser;
  const datasourceService = new SavedObjectDatasourceService(ctx.core.savedObjects.client, logger);
  return {
    client,
    workspaceId,
    resolveDatasource: async (datasourceId: string) => {
      const ds = await datasourceService.get(datasourceId);
      if (!ds) return undefined;
      return ds as Datasource;
    },
    ruleDedupEnabled,
  };
}

/**
 * Resolve the workspace id for read-only routes (list / get / statuses).
 * On a malformed workspace id we return the same 400 envelope as a write
 * route so the wizard / listing UI gets a consistent error shape.
 */
function tryResolveWorkspaceId(
  req: OpenSearchDashboardsRequest
):
  | { workspaceId: string; errorResponse?: undefined }
  | { workspaceId?: undefined; errorResponse: { status: number; body: Record<string, unknown> } } {
  try {
    return { workspaceId: resolveWorkspaceId(req) };
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
      // Clamp at the route boundary so a malformed `?pageSize=99999999` fails
      // fast before reaching the service-layer cap (100). NaN / non-positive
      // values fall back to the service default.
      const rawPage = q.page ? parseInt(q.page, 10) : NaN;
      const rawPageSize = q.pageSize ? parseInt(q.pageSize, 10) : NaN;
      const filters = {
        page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : undefined,
        pageSize:
          Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(rawPageSize, 100) : undefined,
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
      const wsResolved = tryResolveWorkspaceId(req);
      if (wsResolved.errorResponse) {
        return res.customError({
          statusCode: wsResolved.errorResponse.status,
          body: {
            message: String(
              (wsResolved.errorResponse.body as { error?: string }).error ?? 'Failed'
            ),
            attributes: wsResolved.errorResponse.body,
          },
        });
      }
      const statusCtx = buildStatusContext(
        ctx as SloHandlerContext,
        wsResolved.workspaceId,
        logger,
        ruleDedupEnabled
      );
      const result = await handleListSLOs(sloService, filters, logger, statusCtx);
      if (result.status >= 400) {
        return res.customError({
          statusCode: result.status,
          body: {
            message: String((result.body as { error?: string }).error ?? 'Failed'),
            attributes: result.body,
          },
        });
      }
      return res.ok({ body: result.body });
    }
  );

  router.post({ path: SLO_BASE, validate: { body: createBody } }, async (ctx, req, res) => {
    const built = await tryBuildDeployContext(
      ctx as SloHandlerContext,
      req,
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
      resolveActingUser(req, logger),
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
      const wsResolved = tryResolveWorkspaceId(req);
      if (wsResolved.errorResponse) {
        return res.customError({
          statusCode: wsResolved.errorResponse.status,
          body: {
            message: String(
              (wsResolved.errorResponse.body as { error?: string }).error ?? 'Failed'
            ),
            attributes: wsResolved.errorResponse.body,
          },
        });
      }
      const statusCtx = buildStatusContext(
        ctx as SloHandlerContext,
        wsResolved.workspaceId,
        logger,
        ruleDedupEnabled
      );
      const result = await handleGetSLOStatuses(sloService, req.body.ids, logger, statusCtx);
      if (result.status === 200) return res.ok({ body: result.body });
      return res.customError({
        statusCode: result.status,
        body: {
          message: String((result.body as { error?: string }).error ?? 'Failed'),
          attributes: result.body,
        },
      });
    }
  );

  router.get(
    {
      path: `${SLO_BASE}/{id}`,
      validate: { params: schema.object({ id: schema.string() }) },
    },
    async (ctx, req, res) => {
      const wsResolved = tryResolveWorkspaceId(req);
      if (wsResolved.errorResponse) {
        return res.customError({
          statusCode: wsResolved.errorResponse.status,
          body: {
            message: String(
              (wsResolved.errorResponse.body as { error?: string }).error ?? 'Not found'
            ),
            attributes: wsResolved.errorResponse.body,
          },
        });
      }
      const statusCtx = buildStatusContext(
        ctx as SloHandlerContext,
        wsResolved.workspaceId,
        logger,
        ruleDedupEnabled
      );
      const result = await handleGetSLO(sloService, req.params.id, logger, statusCtx);
      if (result.status === 200) return res.ok({ body: result.body });
      return res.customError({
        statusCode: result.status,
        body: {
          message: String((result.body as { error?: string }).error ?? 'Not found'),
          attributes: result.body,
        },
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
        req,
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
        resolveActingUser(req, logger),
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
        req,
        existing?.spec.datasourceId,
        rulerClient,
        logger
      );
      // Tolerant DELETE: when the datasource has been removed out-of-band
      // the deploy-context build returns a 400. Without this branch the
      // user is wedged — they can't drop the orphan SO via the API and
      // have to use saved-object management UI to clean up. Log a warn so
      // ops can spot the dangling ruler state, then proceed without a
      // deploy context. The service still throws
      // `SloRulerTeardownRequiredError` if the SO carries a rule group,
      // which is the safe default for an SLO that needs ruler teardown
      // before its SO record can be dropped.
      let deploy = built.deploy;
      if (built.errorResponse) {
        logger.warn(
          `SLO DELETE ${req.params.id}: datasource resolution failed (${
            (built.errorResponse.body as { error?: string }).error ?? 'unknown'
          }) — proceeding without a deploy context. The reconciler will sweep any orphan rule groups.`
        );
        deploy = undefined;
      }
      const result = await handleDeleteSLO(sloService, req.params.id, logger, deploy);
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
        req,
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
        resolveActingUser(req, logger),
        logger,
        built.deploy
      );
      if (result.status === 200) return res.ok({ body: result.body });
      return res.customError({
        statusCode: result.status,
        body: {
          message: String((result.body as { error?: string }).error ?? 'Enable failed'),
          attributes: result.body,
        },
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
        req,
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
        resolveActingUser(req, logger),
        logger,
        built.deploy
      );
      if (result.status === 200) return res.ok({ body: result.body });
      return res.customError({
        statusCode: result.status,
        body: {
          message: String((result.body as { error?: string }).error ?? 'Disable failed'),
          attributes: result.body,
        },
      });
    }
  );
}
