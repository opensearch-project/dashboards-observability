/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AlertingPromResourcesService — frontend transport for Prometheus resource
 * reads (rules, alerts, metric/label metadata). Targets `/api/enhancements/
 * resources` in the final architecture (Q1 verified the existing
 * `query_enhancements` plugin already proxies these paths to DirectQuery).
 *
 * Phase 4 scope: points at the existing custom routes so migrations land
 * cleanly ahead of Phase 5's route swap. Consumers (hooks) are agnostic to
 * which underlying endpoint is in play — only this service needs to change
 * when the swap happens.
 */
import { coreRefs } from '../../../framework/core_refs';
import type { PrometheusMetricMetadata } from '../../../../common/types/alerting';

export class AlertingPromResourcesService {
  constructor(private readonly datasourceId: string) {
    if (!datasourceId || typeof datasourceId !== 'string') {
      throw new Error('datasourceId is required for AlertingPromResourcesService');
    }
  }

  private requireHttp() {
    const http = coreRefs.http;
    if (!http) throw new Error('HTTP client not available');
    return http;
  }

  /** List metric names (optionally filtered by a search prefix). */
  async listMetricNames(search?: string): Promise<{ metrics: string[] }> {
    return (await this.requireHttp().get(
      `/api/alerting/prometheus/${encodeURIComponent(this.datasourceId)}/metadata/metrics`,
      { query: search ? { search } : undefined }
    )) as { metrics: string[] };
  }

  /** List label names (optionally restricted to a specific metric). */
  async listLabelNames(metric?: string): Promise<{ labels: string[] }> {
    return (await this.requireHttp().get(
      `/api/alerting/prometheus/${encodeURIComponent(this.datasourceId)}/metadata/labels`,
      { query: metric ? { metric } : undefined }
    )) as { labels: string[] };
  }

  /** List values for a specific label (optionally constrained by a selector). */
  async listLabelValues(label: string, selector?: string): Promise<{ values: string[] }> {
    return (await this.requireHttp().get(
      `/api/alerting/prometheus/${encodeURIComponent(
        this.datasourceId
      )}/metadata/label-values/${encodeURIComponent(label)}`,
      { query: selector ? { selector } : undefined }
    )) as { values: string[] };
  }

  /** Get descriptions/units/types keyed by metric name. */
  async getMetricMetadata(): Promise<{ metadata: PrometheusMetricMetadata[] }> {
    return (await this.requireHttp().get(
      `/api/alerting/prometheus/${encodeURIComponent(this.datasourceId)}/metadata/metric-metadata`
    )) as { metadata: PrometheusMetricMetadata[] };
  }
}
