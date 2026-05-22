/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Framework-agnostic SLO handlers. Route adapters translate the returned
 * { status, body } into OSD response shapes.
 */

import type { Logger } from '../../../common/types/alerting';
import {
  deriveExpectedGroups,
  SloDeployContext,
  SloNotFoundError,
  SloRepairContext,
  SloRuleHealthProbe,
  SloRulerError,
  SloRulerTeardownRequiredError,
  SloStatusAggregationContext,
  SloValidationError,
  SloVersionConflictError,
  SloService,
  sloRulerNamespaceFor,
} from '../../../common/slo/slo_service';
import type { SloCreateInput, SloListFilters, SloUpdateInput } from '../../../common/slo/slo_types';
import type { HandlerResult } from '../alerting/route_utils';
import { toHandlerResult } from '../alerting/route_utils';

/**
 * Cap on the upstream ruler diagnostic surfaced to the client. Cortex's
 * verbose error envelopes can carry tenant ids, internal hostnames, or
 * stack traces that don't belong in a multi-tenant OSD toast — the full
 * body is logged server-side at `warn`, the client gets a short, ANSI-
 * stripped excerpt that's still long enough to identify the failure
 * class (e.g. "rule contains label X with empty value").
 */
const RULER_RAW_BODY_MAX_LEN = 256;
function sanitizeRulerRawBody(body: string): string {
  if (!body) return '';
  // Strip ANSI/VT escape sequences that some Cortex builds embed.

  const stripped = body.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');
  // Collapse all remaining control chars (incl. CR/LF/TAB) to spaces so
  // the toast renders as a single line.

  const flattened = stripped.replace(/[\x00-\x1F\x7F]+/g, ' ').trim();
  if (flattened.length <= RULER_RAW_BODY_MAX_LEN) return flattened;
  return `${flattened.slice(0, RULER_RAW_BODY_MAX_LEN - 1)}…`;
}

function toSloError(e: unknown, logger?: Logger): HandlerResult {
  if (e instanceof SloValidationError) {
    if (logger) logger.warn(e.message);
    return { status: 400, body: { error: 'Validation failed', errors: e.errors } };
  }
  if (e instanceof SloNotFoundError) {
    return { status: 404, body: { error: e.message } };
  }
  if (e instanceof SloVersionConflictError) {
    return {
      status: 409,
      body: {
        error: e.message,
        current: e.current,
        attemptedVersion: e.attemptedVersion,
      },
    };
  }
  if (e instanceof SloRulerError) {
    if (logger) {
      // Log the full upstream body server-side so ops still has the raw
      // diagnostic; the client gets a sanitized excerpt instead.
      logger.warn(
        `Ruler dual-write failed: ${e.code} (HTTP ${e.httpStatus}). Upstream body: ${e.rawBody}`
      );
    }
    // Surface upstream status verbatim when available (4xx) so the wizard can
    // show Cortex's own diagnostic. 0 (transport / network failure with no
    // response) maps to 503 — semantically "upstream unavailable" rather
    // than 502 "bad gateway response".
    const status = e.httpStatus >= 400 && e.httpStatus < 600 ? e.httpStatus : 503;
    return {
      status,
      body: {
        error: e.message,
        code: e.code,
        httpStatus: e.httpStatus,
        rawBody: sanitizeRulerRawBody(e.rawBody),
      },
    };
  }
  if (e instanceof SloRulerTeardownRequiredError) {
    if (logger) logger.warn(e.message);
    // 409 Conflict — the client's request is valid, but the current state
    // (unresolved datasource, live rule group) prevents completion. UI can
    // point the user at fixing the datasource before retrying.
    return {
      status: 409,
      body: {
        error: e.message,
        code: 'RULER_TEARDOWN_REQUIRED',
        sloId: e.sloId,
        datasourceId: e.datasourceId,
      },
    };
  }
  return toHandlerResult(e, logger);
}

export async function handleListSLOs(
  svc: SloService,
  filters: SloListFilters,
  logger?: Logger,
  statusCtx?: SloStatusAggregationContext,
  request?: unknown,
  cursor?: string | null
): Promise<HandlerResult> {
  try {
    // Cursor wins when present. The legacy `page=N` path stays for clients
    // mid-upgrade — the cursor branch goes through the new `paginate` API
    // which pushes facet filters into the SO and pays status fold-in only
    // for the visible page.
    if (cursor !== undefined && cursor !== null && cursor !== '') {
      const result = await svc.paginate(filters, cursor, statusCtx, request);
      return { status: 200, body: result };
    }
    if (filters.page !== undefined && filters.page !== null) {
      const result = await svc.getPaginated(filters, statusCtx, request);
      return { status: 200, body: result };
    }
    // Default new behavior: fresh listing call with no cursor and no
    // explicit page → cursor pagination, page 1.
    const result = await svc.paginate(filters, null, statusCtx, request);
    return { status: 200, body: result };
  } catch (e) {
    return toSloError(e, logger);
  }
}

export async function handleCreateSLO(
  svc: SloService,
  input: SloCreateInput,
  createdBy: string,
  logger?: Logger,
  deploy?: SloDeployContext,
  request?: unknown
): Promise<HandlerResult> {
  try {
    const doc = await svc.create(input, createdBy, deploy, request);
    return { status: 201, body: doc };
  } catch (e) {
    return toSloError(e, logger);
  }
}

export async function handleGetSLO(
  svc: SloService,
  id: string,
  logger?: Logger,
  statusCtx?: SloStatusAggregationContext,
  request?: unknown
): Promise<HandlerResult> {
  try {
    const doc = await svc.get(id, request);
    if (!doc) return { status: 404, body: { error: 'SLO not found' } };
    const liveStatus = await svc.getStatus(id, statusCtx, request);
    // Include the refcount per recording fingerprint so the detail page
    // can render "Shared with N other SLOs". Under A.4 this read is
    // workspace-local: the wrapper auto-filters slo-rule-ref SOs to the
    // caller's workspace, so N reflects "other SLOs in your workspace
    // sharing this fingerprint" — never information about other
    // workspaces' SLOs.
    const workspaceId = statusCtx?.workspaceId ?? 'default';
    const recordingFingerprintRefcounts = await svc.getFingerprintRefcounts(
      doc,
      workspaceId,
      statusCtx?.resolveDatasource,
      request
    );
    return {
      status: 200,
      body: { ...doc, liveStatus, recordingFingerprintRefcounts },
    };
  } catch (e) {
    return toSloError(e, logger);
  }
}

export async function handleUpdateSLO(
  svc: SloService,
  id: string,
  input: SloUpdateInput,
  updatedBy: string,
  logger?: Logger,
  deploy?: SloDeployContext,
  request?: unknown
): Promise<HandlerResult> {
  try {
    const doc = await svc.update(id, input, updatedBy, deploy, request);
    return { status: 200, body: doc };
  } catch (e) {
    return toSloError(e, logger);
  }
}

export async function handleDeleteSLO(
  svc: SloService,
  id: string,
  logger?: Logger,
  deploy?: SloDeployContext,
  request?: unknown
): Promise<HandlerResult> {
  try {
    const result = await svc.delete(id, deploy, request);
    if (!result.deleted) return { status: 404, body: { error: 'SLO not found' } };
    return { status: 200, body: { deleted: true } };
  } catch (e) {
    return toSloError(e, logger);
  }
}

export async function handleEnableSLO(
  svc: SloService,
  id: string,
  updatedBy: string,
  logger?: Logger,
  deploy?: SloDeployContext,
  request?: unknown
): Promise<HandlerResult> {
  try {
    const doc = await svc.setEnabled(id, true, updatedBy, deploy, request);
    return { status: 200, body: doc };
  } catch (e) {
    return toSloError(e, logger);
  }
}

export async function handleDisableSLO(
  svc: SloService,
  id: string,
  updatedBy: string,
  logger?: Logger,
  deploy?: SloDeployContext,
  request?: unknown
): Promise<HandlerResult> {
  try {
    const doc = await svc.setEnabled(id, false, updatedBy, deploy, request);
    return { status: 200, body: doc };
  } catch (e) {
    return toSloError(e, logger);
  }
}

export async function handlePreviewSLORules(
  svc: SloService,
  input: SloCreateInput,
  logger?: Logger
): Promise<HandlerResult> {
  try {
    const group = svc.previewRules(input);
    return { status: 200, body: group };
  } catch (e) {
    return toSloError(e, logger);
  }
}

export async function handleGetSLOStatuses(
  svc: SloService,
  ids: string[],
  logger?: Logger,
  statusCtx?: SloStatusAggregationContext,
  request?: unknown
): Promise<HandlerResult> {
  try {
    if (!ids || ids.length === 0) {
      return { status: 400, body: { error: 'ids parameter is required' } };
    }
    const statuses = await svc.getStatuses(ids, statusCtx, request);
    return { status: 200, body: { statuses } };
  } catch (e) {
    return toSloError(e, logger);
  }
}

// ============================================================================
// Repair + Rule health endpoints
// ============================================================================

/**
 * Context accepted by the repair / rule_health handlers. The health probe is
 * a structural subset of `RuleHealthChecker` and the deploy context is the
 * same one create/update/delete take — both come from `registerSloRoutes`'
 * closure.
 *
 * When `health` is missing we return 501 instead of silently falling back:
 * the UI already has its own "rule health checker not configured" affordance,
 * and a 200 with a synthetic `ok` would mask genuine rollout regressions.
 */
interface SloRepairHandlerContext {
  health?: SloRuleHealthProbe;
  deploy?: SloDeployContext;
}

/**
 * `POST /api/observability/v1/slos/{id}/repair` — re-asserts the expected
 * rule groups for an SLO. See `SloService.repair`.
 */
export async function handleRepairSLO(
  svc: SloService,
  id: string,
  logger?: Logger,
  ctx?: SloRepairHandlerContext,
  request?: unknown
): Promise<HandlerResult> {
  try {
    if (!ctx?.health) {
      return {
        status: 501,
        body: { error: 'Rule health checker not configured in this environment' },
      };
    }
    if (!ctx.deploy) {
      return {
        status: 400,
        body: {
          error:
            'Cannot repair SLO: deploy context unavailable (datasource not registered or not a DirectQuery Prometheus connection)',
        },
      };
    }
    const repairCtx: SloRepairContext = { health: ctx.health, deploy: ctx.deploy };
    const result = await svc.repair(id, repairCtx, request);
    return { status: 200, body: result };
  } catch (e) {
    return toSloError(e, logger);
  }
}

/**
 * `GET /api/observability/v1/slos/{id}/rule_health` — probes the ruler for
 * the SLO's expected rule groups and returns a `RuleHealthResponse`-shaped
 * body (sloId + the rule-health report fields inlined).
 */
export async function handleGetRuleHealth(
  svc: SloService,
  id: string,
  logger?: Logger,
  ctx?: SloRepairHandlerContext,
  request?: unknown
): Promise<HandlerResult> {
  try {
    if (!ctx?.health) {
      return {
        status: 501,
        body: { error: 'Rule health checker not configured in this environment' },
      };
    }
    const doc = await svc.get(id, request);
    if (!doc) throw new SloNotFoundError(id);

    if (!ctx.deploy) {
      return {
        status: 400,
        body: {
          error:
            'Cannot probe rule health: deploy context unavailable (datasource not registered or not a DirectQuery Prometheus connection)',
        },
      };
    }

    const expectedGroups = deriveExpectedGroups(doc);
    const namespace =
      doc.status.provisioning.backend === 'prometheus'
        ? doc.status.provisioning.rulerNamespace || sloRulerNamespaceFor(ctx.deploy.workspaceId)
        : sloRulerNamespaceFor(ctx.deploy.workspaceId);

    const report = await ctx.health.check({
      workspaceId: ctx.deploy.workspaceId,
      datasource: ctx.deploy.datasource,
      client: ctx.deploy.client,
      sloId: doc.id,
      namespace,
      expectedGroups,
    });

    // Shape matches the public `RuleHealthResponse` in `slo_api_client.ts`:
    // { sloId, state, expectedGroups, presentGroups, missingGroups,
    //   rulerErrorCode?, computedAt }. We spread the report first so the
    // route is a thin pass-through — no hidden field mutation.
    return { status: 200, body: { sloId: doc.id, ...report } };
  } catch (e) {
    return toSloError(e, logger);
  }
}
