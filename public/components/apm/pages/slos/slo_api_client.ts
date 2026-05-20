/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Thin HTTP client for the SLO routes registered at
 * `${OBSERVABILITY_BASE}/v1/slos`. Uses core.http so basepath + XSRF are
 * handled by OSD.
 */

import type { HttpStart } from '../../../../../../../src/core/public';
import type { PaginatedResponse } from '../../../../../common/types/alerting/types';
import { OBSERVABILITY_BASE } from '../../../../../common/constants/shared';
import type {
  GeneratedRuleGroup,
  ProbeSliRequest,
  ProbeSliResponse,
  SloAggregateResponse,
  SloCreateInput,
  SloDocument,
  SloLiveStatus,
  SloListFilters,
  SloSpec,
  SloSummary,
  SloUpdateInput,
} from '../../../../../common/slo/slo_types';

const SLO_BASE = `${OBSERVABILITY_BASE}/v1/slos`;

/**
 * Ruler dual-write envelope mirrored from the server's SloRulerError mapping
 * (see server/routes/slo/handlers.ts:toSloError). The wizard renders
 * `rawBody` verbatim so the user sees Cortex's own diagnostic (e.g.
 * "invalid PromQL: parse error at char 42"), not a generic create-failed
 * toast. `code` lets the wizard branch on coarse failure mode.
 */
export type SloRulerErrorCode =
  | 'RULER_VALIDATION_FAILED'
  | 'RULER_AUTH_FAILED'
  | 'RULER_UNREACHABLE';

export interface SloRulerErrorEnvelope {
  error: string;
  code: SloRulerErrorCode;
  httpStatus: number;
  rawBody: string;
}

/**
 * Rule-health state returned by `GET ${SLO_BASE}/{id}/rule_health`.
 *
 * - `ok`: every expected ruler group is present.
 * - `rules_partial`: some (but not all) expected groups are present — typically
 *   a half-finished create or a partial ruler purge.
 * - `rules_missing`: ruler is reachable but no expected groups are present.
 * - `ruler_unreachable`: the health probe could not contact the ruler; the
 *   `rulerErrorCode` field carries the coarse failure mode for the UI to
 *   surface a retry hint vs. a config-fix hint.
 *
 * Types are declared locally (rather than imported from `common/slo/slo_types`)
 * because parallel workstreams are editing `slo_types.ts` in flight.
 */
export type RuleHealthState = 'ok' | 'rules_partial' | 'rules_missing' | 'ruler_unreachable';

export interface RuleHealthResponse {
  sloId: string;
  state: RuleHealthState;
  expectedGroups: string[];
  presentGroups: string[];
  missingGroups: string[];
  rulerErrorCode?: 'RULER_UNREACHABLE' | 'RULER_AUTH_FAILED' | 'RULER_VALIDATION_FAILED';
  computedAt: string;
}

export interface RepairResponse {
  sloId: string;
  /** Whether a ruler upsert actually happened this call (false = already healthy, no-op). */
  repaired: boolean;
  /** Post-repair rule-health snapshot so the UI can re-render in one round-trip. */
  health: RuleHealthResponse;
}

/**
 * Extracts the ruler envelope from an OSD http error, if one is present.
 *
 * OSD's router wraps `res.customError({ body: { message, attributes } })`
 * into an `IHttpFetchError` whose `.body` is `{ message, attributes }`.
 * Our SLO route places the full ruler envelope into `attributes`, so the
 * client walks `err.body.attributes` rather than `err.body` directly.
 *
 * Returns null for non-ruler failures (plain validation, network, etc.) —
 * callers fall back to the generic error message in that case.
 */
export function extractRulerErrorEnvelope(err: unknown): SloRulerErrorEnvelope | null {
  if (!err || typeof err !== 'object') return null;
  const body = (err as { body?: unknown }).body;
  if (!body || typeof body !== 'object') return null;
  const attrs = (body as { attributes?: unknown }).attributes;
  if (!attrs || typeof attrs !== 'object') return null;
  const a = attrs as Partial<SloRulerErrorEnvelope>;
  if (
    a.code === 'RULER_VALIDATION_FAILED' ||
    a.code === 'RULER_AUTH_FAILED' ||
    a.code === 'RULER_UNREACHABLE'
  ) {
    return {
      error: typeof a.error === 'string' ? a.error : 'Ruler dual-write failed',
      code: a.code,
      httpStatus: typeof a.httpStatus === 'number' ? a.httpStatus : 0,
      rawBody: typeof a.rawBody === 'string' ? a.rawBody : '',
    };
  }
  return null;
}

// ============================================================================
// Phase 4 Batch 3 — adoption endpoint types (browser-side mirror of the
// server contract). Kept structurally identical to the handler shapes in
// `server/routes/slo/handlers.ts` and `server/routes/slo/adoption_route.ts`
// so the client compiles before the deeper B2A / B2B types are re-exported
// from `common/slo/slo_adoption_types.ts`. See the orchestrator plan
// (Phase 4 W4.6) for the authoritative contract.
// ============================================================================

/** Outcome of the server's `verifyProvenance` on an orphan row. */
export type OrphanSpecIntegrity = 'ok' | 'mismatch' | 'unsupported_schema';

/**
 * Row-shape for the `_orphans.candidates` array. Fields match the envelope
 * `handleListOrphans` synthesises in `server/routes/slo/handlers.ts`.
 */
export interface OrphanCandidate {
  sloId: string;
  datasourceId: string;
  workspaceId: string;
  namespace: string;
  groupName: string;
  spec: SloSpec;
  specSha256: string;
  specIntegrity: OrphanSpecIntegrity;
  fingerprints: string[];
  tombstoned: boolean;
  tombstoneCreatedAt?: string;
}

/** Row-shape for `_orphans.unknowns` — informational, no actions. */
export interface OrphanUnknown {
  datasourceId: string;
  namespace: string;
  groupName: string;
  diagnostic?: string;
  /**
   * Populated when the detector found an alert-provenance annotation on the
   * group but rejected it — today only the schemaVersion-mismatch path lands
   * here, and only when the payload was parseable JSON. The UI renders an
   * "upgrade plugin" affordance on rows where `specIntegrity ===
   * 'unsupported_schema'`.
   */
  sourceSloId?: string;
  sourceWorkspaceId?: string;
  schemaVersion?: number;
  specIntegrity?: OrphanSpecIntegrity;
}

export interface OrphanListResponse {
  candidates: OrphanCandidate[];
  unknowns: OrphanUnknown[];
}

export interface RecoverRequestBody {
  sloId: string;
  datasourceId: string;
  workspaceId?: string;
  acknowledgeTombstone?: boolean;
}

export interface RecoverRefcountChange {
  fingerprint: string;
  previousRefcount: number;
  newRefcount: number;
}

export interface RecoverResponseBody {
  slo: SloDocument;
  tombstoneCleared: boolean;
  refcountChanges: RecoverRefcountChange[];
}

/**
 * Envelope returned by the 412 feature-flag gate in `adoption_route.ts`.
 * Populated into `IHttpFetchError.body.attributes` by OSD's `res.customError`
 * pathway.
 */
export interface PreconditionFailedEnvelope {
  error: 'PRECONDITION_FAILED';
  message: string;
  missingFlags: Array<'ruleDedup' | 'ruleAdoption'>;
}

/**
 * Narrow an unknown caught error to the 412 / Precondition-Failed shape the
 * adoption endpoints return when feature flags are off. Uses the same
 * `body.attributes` unwrap pattern as `extractRulerErrorEnvelope` above.
 */
export function isPreconditionFailed(
  err: unknown
): err is {
  response?: { status: 412 };
  body?: { message: string; attributes?: PreconditionFailedEnvelope };
} {
  if (!err || typeof err !== 'object') return false;
  const rec = err as {
    response?: { status?: unknown };
    body?: { attributes?: unknown };
  };
  const status = rec.response?.status;
  const attrs = rec.body?.attributes as { error?: unknown } | undefined;
  // Prefer status-code match when OSD sets it; fall back to the envelope
  // `error === 'PRECONDITION_FAILED'` so tests can exercise either axis.
  if (status === 412) return true;
  if (attrs && typeof attrs === 'object' && attrs.error === 'PRECONDITION_FAILED') return true;
  return false;
}

/** Convert filter array/boolean fields to the string form the server expects. */
function serializeFilters(filters: SloListFilters): Record<string, string | number | boolean> {
  const query: Record<string, string | number | boolean> = {};
  if (filters.page !== undefined) query.page = filters.page;
  if (filters.pageSize !== undefined) query.pageSize = filters.pageSize;
  if (filters.datasourceId?.length) query.datasourceId = filters.datasourceId.join(',');
  if (filters.state?.length) query.state = filters.state.join(',');
  if (filters.sliBackend?.length) query.sliBackend = filters.sliBackend.join(',');
  if (filters.sliLeafType?.length) query.sliLeafType = filters.sliLeafType.join(',');
  if (filters.service?.length) query.service = filters.service.join(',');
  if (filters.team?.length) query.team = filters.team.join(',');
  if (filters.tier?.length) query.tier = filters.tier.join(',');
  if (filters.canonicalKind?.length) query.canonicalKind = filters.canonicalKind.join(',');
  if (filters.enabled !== undefined) query.enabled = String(filters.enabled);
  if (filters.mode?.length) query.mode = filters.mode.join(',');
  if (filters.search) query.search = filters.search;
  return query;
}

export class SloApiClient {
  constructor(private readonly http: HttpStart) {}

  list(filters: SloListFilters = {}): Promise<PaginatedResponse<SloSummary>> {
    return this.http.get(SLO_BASE, { query: serializeFilters(filters) });
  }

  /**
   * Server-side per-service SLO health rollup. Preferred over fanning out
   * `list(...)` on the client — one round-trip, one JSON parse, regardless
   * of service count. Server caps `services` at 200; callers should truncate
   * before calling.
   */
  aggregate(params: { services: string[]; datasourceId: string }): Promise<SloAggregateResponse> {
    return this.http.get(`${SLO_BASE}/_aggregate`, {
      query: {
        services: params.services.join(','),
        datasourceId: params.datasourceId,
      },
    });
  }

  get(
    id: string
  ): Promise<
    SloDocument & {
      liveStatus: SloLiveStatus;
      /**
       * Phase 3 W3.12 — refcount per recording fingerprint, so the detail
       * page can render "Shared with N other SLOs". `{}` for legacy / non-
       * dedup SLOs.
       */
      recordingFingerprintRefcounts?: Record<string, number>;
    }
  > {
    return this.http.get(`${SLO_BASE}/${encodeURIComponent(id)}`);
  }

  create(input: SloCreateInput): Promise<SloDocument> {
    return this.http.post(SLO_BASE, { body: JSON.stringify(input) });
  }

  update(id: string, input: SloUpdateInput): Promise<SloDocument> {
    return this.http.put(`${SLO_BASE}/${encodeURIComponent(id)}`, {
      body: JSON.stringify(input),
    });
  }

  delete(id: string): Promise<{ deleted: boolean }> {
    return this.http.delete(`${SLO_BASE}/${encodeURIComponent(id)}`);
  }

  enable(id: string): Promise<SloDocument> {
    return this.http.post(`${SLO_BASE}/${encodeURIComponent(id)}/enable`);
  }

  disable(id: string): Promise<SloDocument> {
    return this.http.post(`${SLO_BASE}/${encodeURIComponent(id)}/disable`);
  }

  preview(input: SloCreateInput): Promise<GeneratedRuleGroup> {
    return this.http.post(`${SLO_BASE}/preview`, { body: JSON.stringify(input) });
  }

  statuses(ids: string[]): Promise<{ statuses: SloLiveStatus[] }> {
    return this.http.post(`${SLO_BASE}/statuses`, { body: JSON.stringify({ ids }) });
  }

  probeSli(body: ProbeSliRequest): Promise<ProbeSliResponse> {
    return this.http.post(`${SLO_BASE}/probe-sli`, { body: JSON.stringify(body) });
  }

  repair(id: string): Promise<RepairResponse> {
    return this.http.post(`${SLO_BASE}/${encodeURIComponent(id)}/repair`);
  }

  getRuleHealth(id: string): Promise<RuleHealthResponse> {
    return this.http.get(`${SLO_BASE}/${encodeURIComponent(id)}/rule_health`);
  }

  // ==========================================================================
  // Phase 4 Batch 3 (W4.8 / W4.9) — adoption admin endpoints.
  // The feature-flag gate lives server-side; callers treat a 412 response as
  // "feature disabled" via `isPreconditionFailed(err)` above.
  // ==========================================================================

  async listOrphans(datasourceId?: string): Promise<OrphanListResponse> {
    const query: Record<string, string> = {};
    if (datasourceId) query.datasourceId = datasourceId;
    return this.http.get(`${SLO_BASE}/_orphans`, { query });
  }

  async recoverSlo(input: RecoverRequestBody): Promise<RecoverResponseBody> {
    return this.http.post(`${SLO_BASE}/_recover`, { body: JSON.stringify(input) });
  }
}
