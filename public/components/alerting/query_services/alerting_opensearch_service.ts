/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AlertingOpenSearchService — frontend transport for OpenSearch alerting reads.
 *
 * Pattern mirrors APM's PPLSearchService: no-arg constructor, uses `coreRefs.http`,
 * each method encapsulates a single request-response shape. Components consume
 * this through hooks, never directly.
 */
import { coreRefs } from '../../../framework/core_refs';
import type {
  ProgressiveResponse,
  UnifiedAlert,
  UnifiedAlertSummary,
  UnifiedRule,
  UnifiedRuleSummary,
} from '../../../../common/types/alerting';

export interface ListAlertsParams {
  dsIds: string[];
  /** Optional per-datasource timeout in ms. */
  timeout?: number;
  /** Optional cap on the total number of results returned across all datasources. */
  maxResults?: number;
  /** Date-math string (e.g. "now-1h"). */
  startTime?: string;
  /** Date-math string (e.g. "now"). */
  endTime?: string;
  /** Optional AbortSignal — when triggered, cancels the in-flight HTTP request. */
  signal?: AbortSignal;
}

export interface ListRulesParams {
  dsIds: string[];
  timeout?: number;
  maxResults?: number;
  signal?: AbortSignal;
}

export class AlertingOpenSearchService {
  private requireHttp() {
    const http = coreRefs.http;
    if (!http) throw new Error('HTTP client not available');
    return http;
  }

  private buildQuery(params: ListAlertsParams | ListRulesParams): Record<string, string> {
    const q: Record<string, string> = { dsIds: params.dsIds.join(',') };
    if (params.timeout !== undefined) q.timeout = String(params.timeout);
    if (params.maxResults !== undefined) q.maxResults = String(params.maxResults);
    // Time-range fields are defined on ListAlertsParams only. Check via
    // `in` operator rather than type narrowing because ListRulesParams
    // (the other arm of the union) intentionally does not carry them.
    if ('startTime' in params && params.startTime !== undefined) q.startTime = params.startTime;
    if ('endTime' in params && params.endTime !== undefined) q.endTime = params.endTime;
    return q;
  }

  /**
   * Unified alerts list across selected datasources.
   * Returns a `ProgressiveResponse` with `results` + per-datasource status.
   */
  async listAlerts(params: ListAlertsParams): Promise<ProgressiveResponse<UnifiedAlertSummary>> {
    return (await this.requireHttp().get('/api/alerting/unified/alerts', {
      query: this.buildQuery(params),
      signal: params.signal,
    })) as ProgressiveResponse<UnifiedAlertSummary>;
  }

  /**
   * Unified rules/monitors list across selected datasources.
   * Returns a `ProgressiveResponse` with `results` + per-datasource status.
   */
  async listRules(params: ListRulesParams): Promise<ProgressiveResponse<UnifiedRuleSummary>> {
    return (await this.requireHttp().get('/api/alerting/unified/rules', {
      query: this.buildQuery(params),
      signal: params.signal,
    })) as ProgressiveResponse<UnifiedRuleSummary>;
  }

  /** Single alert detail for the flyout. */
  async getAlertDetail(dsId: string, alertId: string): Promise<UnifiedAlert> {
    return (await this.requireHttp().get(
      `/api/alerting/alerts/${encodeURIComponent(dsId)}/${encodeURIComponent(alertId)}`
    )) as UnifiedAlert;
  }

  /** Single rule detail for the flyout. */
  async getRuleDetail(dsId: string, ruleId: string): Promise<UnifiedRule> {
    return (await this.requireHttp().get(
      `/api/alerting/rules/${encodeURIComponent(dsId)}/${encodeURIComponent(ruleId)}`
    )) as UnifiedRule;
  }

  /**
   * List notification destinations for a datasource. Used by the create/edit
   * flyout to populate the action destination picker. Returns a thin
   * summary — id, name, and type are all the picker needs.
   *
   * The upstream alerting API isn't paginated; the server caps at size=200
   * and surfaces `truncated`/`totalDestinations` so the UI can hint when
   * older entries are unreachable.
   */
  async listDestinations(dsId: string): Promise<DestinationsListResult> {
    const resp = (await this.requireHttp().get(
      `/api/alerting/opensearch/${encodeURIComponent(dsId)}/destinations`
    )) as {
      destinations: DestinationSummary[];
      totalDestinations?: number;
      truncated?: boolean;
    };
    const destinations = resp.destinations || [];
    return {
      destinations,
      totalDestinations: resp.totalDestinations ?? destinations.length,
      truncated: resp.truncated ?? false,
    };
  }

  /**
   * Resolve concrete indices for a wildcard pattern via `_cat/indices`.
   * Empty `search` returns the cluster-wide list. Pass the search string
   * through the `query` option so OSD's HTTP client URL-encodes it as a
   * proper query param instead of folding `?` into the path segment.
   */
  async listIndices(dsId: string, search: string): Promise<IndexSummary[]> {
    const resp = (await this.requireHttp().get(
      `/api/alerting/opensearch/${encodeURIComponent(dsId)}/indices`,
      search ? { query: { search } } : undefined
    )) as { indices: IndexSummary[] };
    return resp.indices || [];
  }

  /** Resolve aliases for a wildcard pattern via `_cat/aliases`. */
  async listAliases(dsId: string, search: string): Promise<AliasSummary[]> {
    const resp = (await this.requireHttp().get(
      `/api/alerting/opensearch/${encodeURIComponent(dsId)}/aliases`,
      search ? { query: { search } } : undefined
    )) as { aliases: AliasSummary[] };
    return resp.aliases || [];
  }

  /**
   * Fetch fields-by-type from `_mapping` for one or more indices/aliases.
   * Returns `{ date: ['@timestamp', ...], keyword: [...], ... }`.
   */
  async getFieldsByType(dsId: string, indices: string[]): Promise<Record<string, string[]>> {
    if (indices.length === 0) return {};
    const resp = (await this.requireHttp().post(
      `/api/alerting/opensearch/${encodeURIComponent(dsId)}/mappings`,
      { body: JSON.stringify({ indices }) }
    )) as { fieldsByType: Record<string, string[]> };
    return resp.fieldsByType || {};
  }
}

export interface DestinationSummary {
  id: string;
  name: string;
  type: string;
}

export interface DestinationsListResult {
  destinations: DestinationSummary[];
  totalDestinations: number;
  truncated: boolean;
}

export interface IndexSummary {
  index: string;
  status?: string;
  health?: string;
}

export interface AliasSummary {
  alias: string;
  index: string;
}
