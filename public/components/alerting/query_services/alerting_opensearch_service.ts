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
}

export interface ListRulesParams {
  dsIds: string[];
  timeout?: number;
  maxResults?: number;
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
    return q;
  }

  /**
   * Unified alerts list across selected datasources.
   * Returns a `ProgressiveResponse` with `results` + per-datasource status.
   */
  async listAlerts(params: ListAlertsParams): Promise<ProgressiveResponse<UnifiedAlertSummary>> {
    return (await this.requireHttp().get('/api/alerting/unified/alerts', {
      query: this.buildQuery(params),
    })) as ProgressiveResponse<UnifiedAlertSummary>;
  }

  /**
   * Unified rules/monitors list across selected datasources.
   * Returns a `ProgressiveResponse` with `results` + per-datasource status.
   */
  async listRules(params: ListRulesParams): Promise<ProgressiveResponse<UnifiedRuleSummary>> {
    return (await this.requireHttp().get('/api/alerting/unified/rules', {
      query: this.buildQuery(params),
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
}
