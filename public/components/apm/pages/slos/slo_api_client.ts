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
  SloSummary,
  SloUpdateInput,
} from '../../../../../common/slo/slo_types';
import type { SloRulerErrorCode } from '../../../../../common/slo/slo_errors';
import type { SloRuleHealthState } from '../../../../../common/slo/slo_service';

export type { SloRulerErrorCode, SloRuleHealthState };

const SLO_BASE = `${OBSERVABILITY_BASE}/v1/slos`;

/**
 * Ruler dual-write envelope mirrored from the server's SloRulerError mapping
 * (see server/routes/slo/handlers.ts:toSloError). The wizard renders
 * `rawBody` verbatim so the user sees Cortex's own diagnostic (e.g.
 * "invalid PromQL: parse error at char 42"), not a generic create-failed
 * toast. `code` lets the wizard branch on coarse failure mode.
 */
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
 * @deprecated alias of `SloRuleHealthState`. New callers should import the
 * canonical name from `common/slo/slo_service`.
 */
export type RuleHealthState = SloRuleHealthState;

export interface RuleHealthResponse {
  sloId: string;
  state: SloRuleHealthState;
  expectedGroups: string[];
  presentGroups: string[];
  missingGroups: string[];
  rulerErrorCode?: SloRulerErrorCode;
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

/** Convert filter array/boolean fields to the string form the server expects. */
function serializeFilters(
  filters: SloListFilters,
  cursor: string | null
): Record<string, string | number | boolean> {
  const query: Record<string, string | number | boolean> = {};
  if (cursor) query.cursor = cursor;
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

export interface ListSlosResponse {
  results: SloSummary[];
  total: number;
  pageSize: number;
  hasMore: boolean;
  /** Opaque cursor for the next page; null on the final page. */
  nextCursor: string | null;
  /** Opaque cursor for the previous page; null on page 1. */
  prevCursor: string | null;
}

export class SloApiClient {
  constructor(private readonly http: HttpStart) {}

  list(filters: SloListFilters = {}, cursor: string | null = null): Promise<ListSlosResponse> {
    return this.http.get(SLO_BASE, { query: serializeFilters(filters, cursor) });
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
       * Refcount per recording fingerprint, so the detail page can render
       * "Shared with N other SLOs". `{}` for non-dedup SLOs.
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
}
