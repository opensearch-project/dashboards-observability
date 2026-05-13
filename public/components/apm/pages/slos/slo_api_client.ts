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
import type { PaginatedResponse } from '../../../../../common/types/alerting';
import { OBSERVABILITY_BASE } from '../../../../../common/constants/shared';
import type {
  GeneratedRuleGroup,
  SloCreateInput,
  SloDocument,
  SloLiveStatus,
  SloListFilters,
  SloSummary,
  SloUpdateInput,
} from '../../../../../common/slo/slo_types';

const SLO_BASE = `${OBSERVABILITY_BASE}/v1/slos`;

/**
 * Ruler dual-write envelope mirrored from the server's SloRulerError mapping.
 * The wizard renders `rawBody` verbatim so the user sees Cortex's own
 * diagnostic, not a generic create-failed toast.
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
 * Extracts the ruler envelope from an OSD http error, if one is present.
 * OSD wraps `res.customError({ body: { message, attributes } })` into an
 * `IHttpFetchError` whose `.body` is `{ message, attributes }`.
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

  get(id: string): Promise<SloDocument & { liveStatus: SloLiveStatus }> {
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

  preview(input: SloCreateInput): Promise<GeneratedRuleGroup> {
    return this.http.post(`${SLO_BASE}/preview`, { body: JSON.stringify(input) });
  }
}
