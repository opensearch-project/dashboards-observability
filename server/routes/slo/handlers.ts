/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Framework-agnostic SLO handlers. Route adapters translate the returned
 * { status, body } into OSD response shapes.
 */

import type { Logger } from '../../../common/types/alerting/types';
import {
  deriveExpectedGroups,
  SloAdoptionError,
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
import { computeSpecSha256 } from '../../../common/slo/slo_rule_provenance';
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

/**
 * Phase 4 W4.6 — map adoption error codes to HTTP status. Pulled out of the
 * generic `toSloError` because the response envelope is different (always
 * echoes `code` + `message`) and the codes are adoption-specific.
 *
 * Status mapping (from W4.6 spec):
 *   ORPHAN_UNSUPPORTED_SCHEMA → 422
 *   ORPHAN_SPEC_DRIFT         → 422
 *   ORPHAN_WORKSPACE_MISMATCH → 422
 *   ORPHAN_CLAIM_CONFLICT     → 409
 *   ORPHAN_TOMBSTONED         → 409  (retry with acknowledgeTombstone: true)
 */
function toAdoptionErrorResponse(err: SloAdoptionError): HandlerResult {
  const code = err.code;
  const status = code === 'ORPHAN_CLAIM_CONFLICT' || code === 'ORPHAN_TOMBSTONED' ? 409 : 422;
  return {
    status,
    body: {
      error: code,
      code,
      message: err.message,
    },
  };
}

function toSloError(e: unknown, logger?: Logger): HandlerResult {
  // Phase 4 W4.6: adoption-specific errors from the recover path.
  // Checked before the generic typed-error ladder so the envelope stays
  // adoption-shaped (code + message) rather than the legacy validation
  // envelope.
  if (e instanceof SloAdoptionError) {
    if (logger) logger.warn(`SLO adoption error: ${e.code} — ${e.message}`);
    return toAdoptionErrorResponse(e);
  }
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
  statusCtx?: SloStatusAggregationContext
): Promise<HandlerResult> {
  try {
    const result = await svc.getPaginated(filters, statusCtx);
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
  deploy?: SloDeployContext
): Promise<HandlerResult> {
  try {
    const doc = await svc.create(input, createdBy, deploy);
    return { status: 201, body: doc };
  } catch (e) {
    return toSloError(e, logger);
  }
}

export async function handleGetSLO(
  svc: SloService,
  id: string,
  logger?: Logger,
  statusCtx?: SloStatusAggregationContext
): Promise<HandlerResult> {
  try {
    const doc = await svc.get(id);
    if (!doc) return { status: 404, body: { error: 'SLO not found' } };
    const liveStatus = await svc.getStatus(id, statusCtx);
    // Phase 3 W3.12 — include the refcount per recording fingerprint so the
    // detail page can render "Shared with N other SLOs". When no ref store
    // is wired (offline / tests / legacy docs) the map is `{}` and the UI
    // treats every fingerprint as unshared.
    const workspaceId = statusCtx?.workspaceId ?? 'default';
    const recordingFingerprintRefcounts = await svc.getFingerprintRefcounts(doc, workspaceId);
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
  deploy?: SloDeployContext
): Promise<HandlerResult> {
  try {
    const doc = await svc.update(id, input, updatedBy, deploy);
    return { status: 200, body: doc };
  } catch (e) {
    return toSloError(e, logger);
  }
}

export async function handleDeleteSLO(
  svc: SloService,
  id: string,
  logger?: Logger,
  deploy?: SloDeployContext
): Promise<HandlerResult> {
  try {
    const result = await svc.delete(id, deploy);
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
  deploy?: SloDeployContext
): Promise<HandlerResult> {
  try {
    const doc = await svc.setEnabled(id, true, updatedBy, deploy);
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
  deploy?: SloDeployContext
): Promise<HandlerResult> {
  try {
    const doc = await svc.setEnabled(id, false, updatedBy, deploy);
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
  statusCtx?: SloStatusAggregationContext
): Promise<HandlerResult> {
  try {
    if (!ids || ids.length === 0) {
      return { status: 400, body: { error: 'ids parameter is required' } };
    }
    const statuses = await svc.getStatuses(ids, statusCtx);
    return { status: 200, body: { statuses } };
  } catch (e) {
    return toSloError(e, logger);
  }
}

// ============================================================================
// W1.5 — Repair + Rule health endpoints
// ============================================================================

/**
 * Context accepted by the W1.5 handlers. The health probe is a structural
 * subset of `RuleHealthChecker` and the deploy context is the same one
 * create/update/delete take — both come from `registerSloRoutes`' closure.
 *
 * When `health` is missing we return 501 instead of silently falling back:
 * the UI already has its own "rule health checker not configured" affordance,
 * and a 200 with a synthetic `ok` would mask genuine rollout regressions.
 */
export interface SloRepairHandlerContext {
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
  ctx?: SloRepairHandlerContext
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
    const result = await svc.repair(id, repairCtx);
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
  ctx?: SloRepairHandlerContext
): Promise<HandlerResult> {
  try {
    if (!ctx?.health) {
      return {
        status: 501,
        body: { error: 'Rule health checker not configured in this environment' },
      };
    }
    const doc = await svc.get(id);
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

// ============================================================================
// W4.6 — Adoption endpoints (`_orphans`, `_recover`)
//
// Framework-agnostic handler factories for the adoption endpoints. The 412
// feature-flag gate lives in the route adapter (`adoption_route.ts`) so the
// gate can short-circuit before any dependency resolution; these handlers
// assume the gate already passed and focus on service-call + error-code
// translation.
//
// Input/output shapes are typed structurally via `Lite` interfaces so this
// module doesn't reach into the concrete `SloService` type.
// ============================================================================

/**
 * Phase 4 (W4.6) — input shape for `SloService.recover`. Mirrors the
 * orchestrator plan's contract; B2A re-exports the same shape from
 * `common/slo/slo_adoption_types.ts` and (transitively) from `slo_service`.
 */
export interface RecoverSloInputLite {
  sloId: string;
  datasourceId: string;
  workspaceId?: string;
  acknowledgeTombstone?: boolean;
}

/**
 * Structural mirror of `RecoverResult`. The handler treats it as opaque
 * pass-through — the service builds the response, we just forward it 200.
 */
export interface RecoverSloResultLite {
  slo: unknown;
  tombstoneCleared: boolean;
  refcountChanges: Array<{ fingerprint: string; previousRefcount: number; newRefcount: number }>;
}

/**
 * Service-surface the adoption handlers call. Structural so `handlers.ts`
 * does not need to import the concrete `SloService` — keeps this module
 * framework-agnostic.
 */
export interface SloAdoptionServiceLite {
  recover(input: RecoverSloInputLite, deploy: SloDeployContext): Promise<RecoverSloResultLite>;
}

/**
 * Phase 4 (W4.6) — minimal reconciler contract the `_orphans` handler
 * consumes. A structural subset of `SloReconciler` from
 * `server/services/slo/reconciler.ts`. Defined locally so `handlers.ts`
 * doesn't reach into the server tree (same rationale as
 * `SloTombstoneStoreLite` etc. in `common/slo/slo_service.ts`).
 */
export interface SloReconcilerLite {
  reconcileOnce(opts?: {
    datasourceIds?: string[];
  }): Promise<{
    adoptableOrphans: Array<{
      datasourceId: string;
      namespace: string;
      groupName: string;
      sourceSloId?: string;
      sourceWorkspaceId?: string;
      spec?: Record<string, unknown>;
      fingerprints?: string[];
      tombstoned?: boolean;
      tombstoneCreatedAt?: string;
      specIntegrity?: 'ok' | 'mismatch' | 'unsupported_schema';
      diagnostic?: string;
    }>;
    unknownOrphans: Array<{
      datasourceId: string;
      namespace: string;
      groupName: string;
      diagnostic?: string;
      // Carried through when the detector identified the orphan as an SLO
      // whose provenance schemaVersion we don't recognize. The UI renders an
      // "upgrade plugin" affordance on rows where `specIntegrity` is
      // `'unsupported_schema'` — without these the unknown bucket is
      // indistinguishable from a legacy rule-layout group.
      sourceSloId?: string;
      sourceWorkspaceId?: string;
      schemaVersion?: number;
      specIntegrity?: 'ok' | 'mismatch' | 'unsupported_schema';
      /**
       * Session E (F3) — populated on orphans carrying the legacy diagnostic
       * when the reconciler's observation hook wrote a timestamp SO on this
       * or a prior sweep. Undefined on adoption-relevant unknowns (the
       * observation hook only tracks legacy layouts).
       */
      firstSeenAt?: string;
      lastSeenAt?: string;
    }>;
  }>;
}

/**
 * `GET /api/observability/v1/slos/_orphans` — returns adoption candidates
 * and unknown orphans from a single reconciler sweep.
 *
 * The route adapter applies the 412 feature-flag gate; this handler assumes
 * the gate passed. When `reconciler` is missing we surface 501 so the route
 * is always present — matches the pattern used by `_reconcile` and repair.
 */
export async function handleListOrphans(
  reconciler: SloReconcilerLite | undefined,
  datasourceId: string | undefined,
  logger?: Logger
): Promise<HandlerResult> {
  try {
    if (!reconciler) {
      return {
        status: 501,
        body: { error: 'Reconciler not configured in this environment' },
      };
    }
    // `datasourceId` is optional. When omitted, the reconciler sweeps all
    // datasources it can see. An empty filter array is normalized to
    // undefined by `reconcileOnce` itself (see `reconcile_route.ts`) — we
    // pass the single-element array straight through.
    const filter = datasourceId ? [datasourceId] : undefined;
    const result = await reconciler.reconcileOnce({ datasourceIds: filter });

    // Map reconciler's rich shape to the public `_orphans` contract. We only
    // surface the fields the UI reads today; extra fields on the entry are
    // dropped so the public envelope stays stable as the reconciler evolves.
    // `specSha256` is derived from the embedded spec when the reconciler
    // didn't carry it — keeps the envelope shape consistent even if
    // upstream hasn't added the field yet.
    const candidates = result.adoptableOrphans.map((o) => ({
      sloId: o.sourceSloId ?? '',
      datasourceId: o.datasourceId,
      workspaceId: o.sourceWorkspaceId ?? o.datasourceId,
      namespace: o.namespace,
      groupName: o.groupName,
      spec: (o.spec ?? {}) as Record<string, unknown>,
      specSha256: computeOrphanSpecSha256(o.spec),
      specIntegrity: o.specIntegrity ?? 'ok',
      fingerprints: o.fingerprints ?? [],
      tombstoned: o.tombstoned ?? false,
      tombstoneCreatedAt: o.tombstoneCreatedAt,
    }));

    // Surface the unsupported-schema discriminator on the unknown bucket. The
    // detector (`detectOrphanDiff`) already populates `specIntegrity`,
    // `sourceSloId`, and `schemaVersion` for orphans whose alert-provenance
    // was parseable but used a schemaVersion this plugin doesn't recognize;
    // the UI renders a distinct "upgrade plugin" row for those so operators
    // don't confuse them with pre-Phase-3 legacy groups.
    const unknowns = result.unknownOrphans.map((o) => ({
      datasourceId: o.datasourceId,
      namespace: o.namespace,
      groupName: o.groupName,
      diagnostic: o.diagnostic,
      sourceSloId: o.sourceSloId,
      sourceWorkspaceId: o.sourceWorkspaceId,
      schemaVersion: o.schemaVersion,
      specIntegrity: o.specIntegrity,
    }));

    return { status: 200, body: { candidates, unknowns } };
  } catch (e) {
    return toSloError(e, logger);
  }
}

/**
 * `POST /api/observability/v1/slos/_recover` — reclaims an adoptable
 * orphan into a live SLO document, idempotently replaying the dedup-shape
 * deploy so ruler state matches the new claim.
 *
 * Error mapping (per W4.6 spec):
 *   - SloAdoptionError → 422/409 depending on code (see toAdoptionErrorResponse)
 *   - SloNotFoundError → 404
 *   - SloValidationError → 400
 *   - anything else → 500 via toHandlerResult
 */
export async function handleRecoverSlo(
  svc: SloAdoptionServiceLite,
  input: RecoverSloInputLite,
  deploy: SloDeployContext,
  logger?: Logger
): Promise<HandlerResult> {
  try {
    const result = await svc.recover(input, deploy);
    return { status: 200, body: result };
  } catch (e) {
    return toSloError(e, logger);
  }
}

/**
 * Best-effort sha256 of an embedded orphan spec. The reconciler doesn't
 * carry `specSha256` on `OrphanEntry` (the detector verifies the hash but
 * the match bit, not the bytes, is what callers care about), so we recompute
 * here. Returns an empty string when the spec is missing so the envelope
 * stays consistent-shaped for callers that only check `specIntegrity`.
 */
function computeOrphanSpecSha256(spec: Record<string, unknown> | undefined): string {
  if (!spec) return '';
  try {
    return computeSpecSha256(spec as Parameters<typeof computeSpecSha256>[0]);
  } catch {
    return '';
  }
}
