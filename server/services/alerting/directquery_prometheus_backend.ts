/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Prometheus backend that routes all API calls through OpenSearch Direct Query
 * resource APIs instead of connecting to Prometheus directly.
 *
 * Each Datasource object carries a `directQueryName` field that identifies which
 * Prometheus datasource (registered in the OpenSearch SQL plugin) to target.
 * This enables auto-discovery: on startup the server queries
 *   GET /_plugins/_query/_datasources
 * and seeds one Datasource per registered PROMETHEUS connector.
 *
 * API calls are routed through the OSD scoped cluster client (auth, TLS handled
 * automatically by OSD):
 *   GET/POST/DELETE /_plugins/_directquery/_resources/{directQueryName}/...
 *
 * Reference (OpenSearch SQL plugin):
 *   - RestDirectQueryResourcesManagementAction.java
 *   - PrometheusQueryHandler.java / PrometheusClient.java
 */
import {
  AlertingOSClient,
  Datasource,
  Logger,
  PrometheusBackend,
  PrometheusMetadataProvider,
  PrometheusMetricMetadata,
  PromAlert,
  PromAlertingRule,
  PromRecordingRule,
  PromRule,
  PromRuleGroup,
  PrometheusWorkspace,
  AlertmanagerAlert,
  AlertmanagerAlertGroup,
  AlertmanagerReceiver,
  AlertmanagerSilence,
  AlertmanagerStatus,
  PromRulesApiResponse,
  PromRawRuleGroup,
  PromRawRule,
  PromRawAlert,
  PromAlertsApiResponse,
  DatasourceDefinition,
  PromTimeSeriesPoint,
  UnifiedAlertSummary,
} from '../../../common/types/alerting';
import { hashRuleIdentity, promAlertToUnified, promEpisodeToUnified } from './alert_utils';
import type { PromAlertEpisode } from './alert_utils';

/**
 * One series from a Prometheus range-query matrix result — the shape
 * returned by `queryRangeMatrix`. Retains label metadata per series so
 * downstream `getHistoricalAlerts` can partition firing runs by alert
 * identity (`alertname`, `instance`, `alertstate`, etc).
 *
 * `queryRange` (the existing single-series API) flattens to
 * `PromTimeSeriesPoint[]` and drops labels, so it can't be reused for
 * the multi-series episode-reconstruction path.
 */
export interface PromSeriesMatrix {
  metric: Record<string, string>;
  values: PromTimeSeriesPoint[];
}

export class DirectQueryPrometheusBackend implements PrometheusBackend, PrometheusMetadataProvider {
  readonly type = 'prometheus' as const;

  constructor(private readonly logger: Logger) {
    this.logger.info(
      'DirectQuery Prometheus backend configured: routing via OSD scoped cluster client'
    );
  }

  // =========================================================================
  // Auto-discovery — query OpenSearch SQL plugin for registered PROMETHEUS datasources
  // =========================================================================

  /**
   * Discover all Prometheus datasources registered in the OpenSearch SQL plugin.
   * Returns entries suitable for seeding into the DatasourceService.
   *
   * Endpoint: GET /_plugins/_query/_datasources
   */
  async discoverDatasources(client: AlertingOSClient): Promise<Array<Omit<Datasource, 'id'>>> {
    try {
      const resp = await client.transport.request({
        method: 'GET',
        path: '/_plugins/_query/_datasources',
      });

      const all: DatasourceDefinition[] = Array.isArray(resp.body) ? resp.body : [];
      const promSources = all.filter(
        (d: DatasourceDefinition) =>
          d.connector?.toUpperCase() === 'PROMETHEUS' && d.status !== 'DISABLED'
      );

      this.logger.info(
        `Discovered ${promSources.length} Prometheus datasource(s) in OpenSearch SQL plugin` +
          (promSources.length > 0
            ? `: ${promSources.map((d: DatasourceDefinition) => d.name).join(', ')}`
            : '')
      );

      return promSources.map((d: DatasourceDefinition) => ({
        name: d.name,
        type: 'prometheus' as const,
        // URL is unused for OSD-scoped calls but retained for Datasource shape
        url: '',
        enabled: true,
        directQueryName: d.name,
      }));
    } catch (err) {
      this.logger.warn(`Failed to discover Prometheus datasources from SQL plugin: ${err}`);
      return [];
    }
  }

  // =========================================================================
  // Helpers — build direct query resource path and dispatch via OSD client
  // =========================================================================

  private resolveDqName(ds: Datasource): string {
    const name = ds.directQueryName;
    if (!name) {
      throw new Error(
        `Datasource "${ds.name}" (${ds.id}) has no directQueryName. ` +
          'It must be auto-discovered from the OpenSearch SQL plugin.'
      );
    }
    return name;
  }

  private resourcePath(ds: Datasource, path: string): string {
    const dqName = encodeURIComponent(this.resolveDqName(ds));
    return `/_plugins/_directquery/_resources/${dqName}${path}`;
  }

  private async req<T = unknown>(
    client: AlertingOSClient,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T> {
    this.logger.debug(`DirectQuery ${method} ${path}`);
    const resp = await client.transport.request({
      method,
      path,
      body: body || undefined,
    });
    const respBody = resp.body as { data?: T } & Record<string, unknown>;
    return respBody?.data !== undefined ? (respBody.data as T) : ((respBody as unknown) as T);
  }

  private get<T = unknown>(client: AlertingOSClient, ds: Datasource, path: string): Promise<T> {
    return this.req<T>(client, 'GET', this.resourcePath(ds, path));
  }

  private post<T = unknown>(
    client: AlertingOSClient,
    ds: Datasource,
    path: string,
    body: unknown
  ): Promise<T> {
    return this.req<T>(client, 'POST', this.resourcePath(ds, path), body);
  }

  private del<T = unknown>(client: AlertingOSClient, ds: Datasource, path: string): Promise<T> {
    return this.req<T>(client, 'DELETE', this.resourcePath(ds, path));
  }

  // =========================================================================
  // Rules — GET /_plugins/_directquery/_resources/{ds}/api/v1/rules
  // =========================================================================

  async getRuleGroups(client: AlertingOSClient, ds: Datasource): Promise<PromRuleGroup[]> {
    const data = await this.get<PromRulesApiResponse>(client, ds, '/api/v1/rules');

    let rawGroups: PromRawRuleGroup[];
    if (Array.isArray(data)) {
      rawGroups = (data as unknown) as PromRawRuleGroup[];
    } else if (data?.groups) {
      rawGroups = data.groups;
    } else if (data?.data?.groups) {
      rawGroups = data.data.groups;
    } else {
      this.logger.warn('Unexpected rules response shape, returning empty');
      rawGroups = [];
    }

    const groups: PromRuleGroup[] = rawGroups.map((g: PromRawRuleGroup) => ({
      name: g.name || '',
      file: g.file || '',
      interval:
        typeof g.interval === 'number'
          ? g.interval
          : this.parseDurationToSeconds(String(g.interval || '60s')),
      rules: (g.rules || []).map((r: PromRawRule) => this.mapRule(r)),
    }));

    if (ds.workspaceId && ds.workspaceId !== 'default') {
      return groups.filter(
        (g) =>
          g.file.includes(ds.workspaceId!) ||
          g.rules.some((r) => r.type === 'alerting' && r.labels._workspace === ds.workspaceId)
      );
    }

    return groups;
  }

  // =========================================================================
  // Alerts — derived from rules when /api/v1/alerts is unavailable
  // =========================================================================

  async getAlerts(client: AlertingOSClient, ds: Datasource): Promise<PromAlert[]> {
    try {
      const data = await this.get<PromAlertsApiResponse>(client, ds, '/api/v1/alerts');
      let rawAlerts: PromRawAlert[];
      if (Array.isArray(data)) {
        rawAlerts = (data as unknown) as PromRawAlert[];
      } else if (data?.alerts) {
        rawAlerts = data.alerts as PromRawAlert[];
      } else if (data?.data) {
        const inner = data.data;
        if (Array.isArray(inner)) {
          rawAlerts = inner;
        } else if (inner && typeof inner === 'object' && 'alerts' in inner) {
          rawAlerts = (inner as { alerts: PromRawAlert[] }).alerts;
        } else {
          rawAlerts = [];
        }
      } else {
        rawAlerts = [];
      }

      if (rawAlerts.length > 0) {
        const alerts = rawAlerts.map((a: PromRawAlert) => this.mapAlert(a));
        if (ds.workspaceId && ds.workspaceId !== 'default') {
          return alerts.filter((a) => a.labels._workspace === ds.workspaceId);
        }
        return alerts;
      }
    } catch {
      this.logger.debug('Dedicated /api/v1/alerts not available, extracting alerts from rules');
    }

    // Fallback: extract alerts from rule groups
    const groups = await this.getRuleGroups(client, ds);
    const alerts: PromAlert[] = [];
    for (const g of groups) {
      for (const r of g.rules) {
        if (r.type === 'alerting') {
          for (const a of r.alerts) {
            alerts.push(a);
          }
        }
      }
    }
    return alerts;
  }

  // =========================================================================
  // Workspaces
  // =========================================================================

  async listWorkspaces(_client: AlertingOSClient, ds: Datasource): Promise<PrometheusWorkspace[]> {
    const ampMatch = ds.url.match(
      /aps-workspaces\.([^.]+)\.amazonaws\.com\/workspaces\/(ws-[a-zA-Z0-9]+)/
    );
    if (ampMatch) {
      return [
        {
          id: ampMatch[2],
          name: ampMatch[2],
          alias: `AMP Workspace (${ampMatch[1]})`,
          region: ampMatch[1],
          status: 'active',
        },
      ];
    }

    return [{ id: 'default', name: 'default', alias: 'Default', status: 'active' }];
  }

  // =========================================================================
  // Alertmanager — via direct query resource APIs
  // =========================================================================

  // Alertmanager methods are global (not per-datasource). The caller must
  // supply the Prometheus datasource that owns the Alertmanager endpoint.

  async getAlertmanagerAlerts(
    client: AlertingOSClient,
    ds: Datasource
  ): Promise<AlertmanagerAlert[]> {
    try {
      const data = await this.get<AlertmanagerAlert[]>(client, ds, '/alertmanager/api/v2/alerts');
      return Array.isArray(data) ? data : [];
    } catch (err) {
      this.logger.warn(`Failed to get alertmanager alerts via direct query: ${err}`);
      return [];
    }
  }

  async getAlertmanagerAlertGroups(
    client: AlertingOSClient,
    ds: Datasource
  ): Promise<AlertmanagerAlertGroup[]> {
    try {
      const data = await this.get<AlertmanagerAlertGroup[]>(
        client,
        ds,
        '/alertmanager/api/v2/alerts/groups'
      );
      return Array.isArray(data) ? data : [];
    } catch (err) {
      this.logger.warn(`Failed to get alertmanager alert groups via direct query: ${err}`);
      return [];
    }
  }

  async getAlertmanagerReceivers(
    client: AlertingOSClient,
    ds: Datasource
  ): Promise<AlertmanagerReceiver[]> {
    try {
      const data = await this.get<AlertmanagerReceiver[]>(
        client,
        ds,
        '/alertmanager/api/v2/receivers'
      );
      return Array.isArray(data) ? data : [];
    } catch (err) {
      this.logger.warn(`Failed to get alertmanager receivers via direct query: ${err}`);
      return [];
    }
  }

  async getSilences(client: AlertingOSClient, ds: Datasource): Promise<AlertmanagerSilence[]> {
    try {
      const data = await this.get<AlertmanagerSilence[]>(
        client,
        ds,
        '/alertmanager/api/v2/silences'
      );
      return Array.isArray(data) ? data : [];
    } catch (err) {
      this.logger.warn(`Failed to get alertmanager silences via direct query: ${err}`);
      return [];
    }
  }

  async createSilence(
    client: AlertingOSClient,
    ds: Datasource,
    silence: AlertmanagerSilence
  ): Promise<string> {
    const data = await this.post<string | { silenceID?: string; silenceId?: string }>(
      client,
      ds,
      '/alertmanager/api/v2/silences',
      silence
    );
    if (typeof data === 'string') return data;
    return data?.silenceID || data?.silenceId || '';
  }

  async deleteSilence(
    client: AlertingOSClient,
    ds: Datasource,
    silenceId: string
  ): Promise<boolean> {
    try {
      await this.del<unknown>(
        client,
        ds,
        `/alertmanager/api/v2/silence/${encodeURIComponent(silenceId)}`
      );
      return true;
    } catch {
      return false;
    }
  }

  async getAlertmanagerStatus(
    client: AlertingOSClient,
    ds: Datasource
  ): Promise<AlertmanagerStatus> {
    // Routes through DirectQuery: /_plugins/_directquery/_resources/{dsName}/alertmanager/api/v2/status
    return this.get<AlertmanagerStatus>(client, ds, '/alertmanager/api/v2/status');
  }

  // =========================================================================
  // Prometheus Metadata (PrometheusMetadataProvider)
  // =========================================================================

  async getMetricNames(client: AlertingOSClient, ds: Datasource): Promise<string[]> {
    try {
      const data = await this.get<string[] | Record<string, unknown>>(
        client,
        ds,
        '/api/v1/label/__name__/values'
      );
      if (Array.isArray(data)) return data;
      // Defensively handle wrapped response
      if (
        data &&
        typeof data === 'object' &&
        Array.isArray((data as Record<string, unknown>).data)
      ) {
        return (data as Record<string, unknown>).data as string[];
      }
      return [];
    } catch (err) {
      this.logger.warn(`Failed to get metric names via DirectQuery: ${err}`);
      return [];
    }
  }

  async getLabelNames(
    client: AlertingOSClient,
    ds: Datasource,
    metric?: string
  ): Promise<string[]> {
    try {
      let path = '/api/v1/labels';
      if (metric) {
        // Validate metric name to prevent PromQL injection via selector breakout
        if (!/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(metric)) {
          this.logger.warn(`Invalid metric name for getLabelNames: ${metric}`);
          return [];
        }
        path = `/api/v1/labels?match[]=${encodeURIComponent(`{__name__="${metric}"}`)}`;
      }
      const data = await this.get<string[] | Record<string, unknown>>(client, ds, path);
      if (Array.isArray(data)) return data;
      if (
        data &&
        typeof data === 'object' &&
        Array.isArray((data as Record<string, unknown>).data)
      ) {
        return (data as Record<string, unknown>).data as string[];
      }
      return [];
    } catch (err) {
      this.logger.warn(`Failed to get label names via DirectQuery: ${err}`);
      return [];
    }
  }

  async getLabelValues(
    client: AlertingOSClient,
    ds: Datasource,
    labelName: string,
    selector?: string
  ): Promise<string[]> {
    try {
      const enc = encodeURIComponent(labelName);
      const path = selector
        ? `/api/v1/label/${enc}/values?match[]=${encodeURIComponent(selector)}`
        : `/api/v1/label/${enc}/values`;
      const data = await this.get<string[] | Record<string, unknown>>(client, ds, path);
      if (Array.isArray(data)) return data;
      if (
        data &&
        typeof data === 'object' &&
        Array.isArray((data as Record<string, unknown>).data)
      ) {
        return (data as Record<string, unknown>).data as string[];
      }
      return [];
    } catch (err) {
      this.logger.warn(`Failed to get label values for "${labelName}" via DirectQuery: ${err}`);
      return [];
    }
  }

  async getMetricMetadata(
    client: AlertingOSClient,
    ds: Datasource
  ): Promise<PrometheusMetricMetadata[]> {
    try {
      const raw = await this.get<Record<string, Array<{ type: string; help: string }>> | unknown>(
        client,
        ds,
        '/api/v1/metadata?limit=-1'
      );
      // The Prometheus /api/v1/metadata returns { metric: [{ type, help, unit }] }
      // DirectQuery may wrap it in a `data` envelope — the get() helper already unwraps `data`.
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return [];
      }
      const record = raw as Record<string, Array<{ type?: string; help?: string }>>;
      const result: PrometheusMetricMetadata[] = [];
      for (const [metric, entries] of Object.entries(record)) {
        if (!Array.isArray(entries) || entries.length === 0) continue;
        const entry = entries[0];
        const metricType = (entry?.type || 'unknown') as PrometheusMetricMetadata['type'];
        const validTypes: Array<PrometheusMetricMetadata['type']> = [
          'counter',
          'gauge',
          'histogram',
          'summary',
          'unknown',
        ];
        result.push({
          metric,
          type: validTypes.includes(metricType) ? metricType : 'unknown',
          help: entry?.help || '',
        });
      }
      return result;
    } catch (err) {
      this.logger.warn(`Failed to get metric metadata via DirectQuery: ${err}`);
      return [];
    }
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private mapRule(r: PromRawRule): PromRule {
    if (r.type === 'recording' || r.record) {
      return {
        type: 'recording',
        name: r.name || r.record || '',
        query: r.query || r.expr || '',
        labels: r.labels || {},
        health: r.health || 'unknown',
        lastEvaluation: r.lastEvaluation,
        evaluationTime: r.evaluationTime,
      } as PromRecordingRule;
    }

    const name = r.name || r.alert || '';
    const query = r.query || r.expr || '';
    const duration =
      typeof r.duration === 'number'
        ? r.duration
        : this.parseDurationToSeconds(r.for || String(r.duration || '0s'));

    return {
      type: 'alerting',
      name,
      query,
      duration,
      labels: r.labels || {},
      annotations: r.annotations || {},
      alerts: (r.alerts || []).map((a: PromRawAlert) => this.mapAlert(a)),
      health: r.health || 'unknown',
      state: r.state || 'inactive',
      lastEvaluation: r.lastEvaluation,
      evaluationTime: r.evaluationTime,
    } as PromAlertingRule;
  }

  /**
   * Execute a PromQL range query via the DirectQuery query execution API.
   *
   * Uses: POST /_plugins/_directquery/_query/{dataSources}
   * This is the query EXECUTION endpoint (separate from the resource proxy).
   * The SQL plugin's PrometheusQueryHandler routes to PrometheusClient.queryRange()
   * which calls Prometheus /api/v1/query_range.
   *
   * Request body: { datasource, query, language: "PROMQL", options: { queryType: "range", start, end, step } }
   * Response: Prometheus matrix result with time-series values.
   */
  async queryRange(
    client: AlertingOSClient,
    ds: Datasource,
    query: string,
    start: number,
    end: number,
    step: number
  ): Promise<PromTimeSeriesPoint[]> {
    try {
      const dqName = this.resolveDqName(ds);
      const path = `/_plugins/_directquery/_query/${encodeURIComponent(dqName)}`;

      this.logger.debug(`DirectQuery range query: ${query.substring(0, 80)}...`);

      const resp = await client.transport.request({
        method: 'POST',
        path,
        body: {
          datasource: dqName,
          query,
          language: 'PROMQL',
          options: {
            queryType: 'range',
            start: start.toString(),
            end: end.toString(),
            step: step.toString(),
          },
        },
      });

      return this.parseRangeQueryResponse(resp.body as Record<string, unknown>);
    } catch (err) {
      this.logger.warn(`Failed to execute DirectQuery range query: ${err}`);
      return [];
    }
  }

  /**
   * Multi-series variant of `queryRange`. Targets the same DirectQuery
   * endpoint but preserves the per-series `metric` label map AND all
   * values from every series — `queryRange`'s `parseRangeQueryResponse`
   * flattens to the first series only, so it can't be reused for the
   * `ALERTS{}` matrix where each active alert emits its own series.
   *
   * Private (tests reach it via the public `getHistoricalAlerts` method).
   * Kept separate from `queryRange` because that method swallows errors to
   * `[]` and collapses series — behavior that's fine for chart previews but
   * would silently hide a bad range query here.
   */
  async queryRangeMatrix(
    client: AlertingOSClient,
    ds: Datasource,
    query: string,
    startSec: number,
    endSec: number,
    stepSec: number
  ): Promise<PromSeriesMatrix[]> {
    const dqName = this.resolveDqName(ds);
    const path = `/_plugins/_directquery/_query/${encodeURIComponent(dqName)}`;

    this.logger.debug(`DirectQuery range matrix query: ${query.substring(0, 80)}...`);

    const resp = await client.transport.request({
      method: 'POST',
      path,
      body: {
        datasource: dqName,
        query,
        language: 'PROMQL',
        options: {
          queryType: 'range',
          start: startSec.toString(),
          end: endSec.toString(),
          step: stepSec.toString(),
        },
      },
    });

    const promResult = this.extractPrometheusResult(resp.body as Record<string, unknown>);
    if (!promResult) return [];

    const rawSeries = (promResult.result ?? []) as Array<{
      metric?: Record<string, string>;
      values?: unknown[][];
    }>;

    // Defensive cap on parsed sample count per series. `computeStep` in the
    // shared helper should keep steps coarse enough that a well-behaved
    // Prometheus response stays well under this, but an exporter returning
    // a fine step on a multi-day range could otherwise allocate unbounded
    // memory here. ~50k points per series accommodates a 30-day range at a
    // 60s step with headroom; anything larger is almost certainly misuse.
    const MAX_POINTS_PER_SERIES = 50_000;

    const series: PromSeriesMatrix[] = [];
    for (const s of rawSeries) {
      const metric = s.metric || {};
      const values: PromTimeSeriesPoint[] = [];
      const rawValues = s.values || [];
      for (const pair of rawValues) {
        if (values.length >= MAX_POINTS_PER_SERIES) {
          this.logger.warn(
            `queryRangeMatrix: series truncated at ${MAX_POINTS_PER_SERIES} points for query "${query.substring(
              0,
              80
            )}..."`
          );
          break;
        }
        if (Array.isArray(pair) && pair.length >= 2) {
          const ts = Number(pair[0]);
          const numVal = parseFloat(String(pair[1]));
          if (!isNaN(ts) && !isNaN(numVal)) {
            values.push({ timestamp: ts * 1000, value: numVal });
          }
        }
      }
      series.push({ metric, values });
    }

    return series;
  }

  /**
   * Assemble the unified alert list for a Prometheus datasource over a
   * window. Two sources are queried in parallel:
   *
   *   1. `queryRangeMatrix('ALERTS', start, end, step)` — historical
   *      firing-run reconstruction from the `ALERTS{}` time series.
   *   2. `getAlerts` (i.e. `/api/v1/alerts`) — currently-firing / pending
   *      alerts right now.
   *
   * We run BOTH unconditionally and merge (Option A). This makes the UI
   * behave consistently regardless of window size vs Prometheus retention:
   *
   *   - Window entirely within retention ⇒ matrix covers everything; live
   *     alerts deduplicate against their matching historical episodes so
   *     there's no double-count.
   *   - Window larger than retention ⇒ matrix returns an empty or partial
   *     result, but live alerts still surface.
   *   - Window fully in the past ⇒ `endIsNow=false` skips the live fetch
   *     and we return just historical episodes.
   *
   * Dedupe rule: a live alert from `/api/v1/alerts` is SUPPRESSED if an
   * episode in the matrix result already represents the same rule AND is
   * still firing at the window's right edge (`stillActiveAtRangeEnd`).
   * "Same rule" is determined by the rule-label hash
   * (`hashRuleIdentity`) — i.e. labels stripped of transport metadata
   * (`__name__`, `alertstate`) which differ between the two sources.
   *
   * Episode reconstruction algorithm:
   *   1. `queryRangeMatrix('ALERTS', start, end, step)` — one series per
   *      unique `(alertname, alertstate, ...labels)` tuple.
   *   2. For each series, scan `values` left-to-right:
   *      - Enter a "firing run" on the first `value === 1` sample.
   *      - Close the run (emit an episode) on the first `value !== 1`
   *        sample OR at the end of the series.
   *      - `truncatedStart` = the first sample is at index 0 AND within
   *        1.5× step of the window start (so we conclude the alert was
   *        already firing before the window opened).
   *      - `stillActiveAtRangeEnd` = the last sample is within 1.5× step
   *        of window end (so the series didn't resolve before we stopped
   *        looking).
   *   3. Map each episode to `UnifiedAlertSummary` via `promEpisodeToUnified`.
   *
   * Flapping: Prometheus emits separate `ALERTS` series for
   * `alertstate="pending"` and `alertstate="firing"` on the same rule. We
   * do NOT merge across `alertstate` on the historical side — a rule that
   * pended and then fired produces two episodes, which is the semantically
   * correct representation. The live-alert dedupe step only cancels the
   * live entry when there's ALSO a `stillActiveAtRangeEnd` episode, so
   * the historical pending/firing split is preserved.
   *
   * Error isolation: errors from either query are captured and returned
   * alongside whatever the other query produced. A `queryRangeMatrix`
   * failure does NOT hide currently-firing alerts, and vice versa.
   */
  async getHistoricalAlerts(
    client: AlertingOSClient,
    ds: Datasource,
    startEpochSec: number,
    endEpochSec: number,
    stepSec: number,
    endIsNow: boolean
  ): Promise<{
    alerts: UnifiedAlertSummary[];
    fallback?: 'prometheus-alerts-current-only';
    error?: string;
  }> {
    // Fire both requests in parallel. When `endIsNow=false` the live
    // endpoint is irrelevant (window is fully past), so skip it to save
    // the RPC. Use `Promise.allSettled`-style tracking — we want a live
    // failure NOT to hide a successful matrix result, and vice versa.
    // Filter `alertstate="firing"` at the PromQL level — the pending state
    // is a transient grace-period signal (rule's `for:` hasn't elapsed
    // yet) and its row counts flap with the query step: a fine step on a
    // 12h window catches pending samples that a coarse step on a 2d
    // window misses, leading to "12h shows 53, 2d shows 29" discrepancies
    // that surprise operators. Filtering upstream keeps the row count
    // step-independent AND cuts wire/memory cost vs filtering after parse.
    // Live `/api/v1/alerts` already excludes pending on most Prom versions
    // (it's a `firing`-or-`inactive` endpoint), so this aligns the two
    // sources.
    const matrixPromise = this.queryRangeMatrix(
      client,
      ds,
      'ALERTS{alertstate="firing"}',
      startEpochSec,
      endEpochSec,
      stepSec
    );
    const liveSettled: Promise<
      { ok: true; alerts: PromAlert[] } | { ok: false; error: string }
    > = endIsNow
      ? this.getAlerts(client, ds).then(
          (alerts) => ({ ok: true, alerts } as const),
          (err) => ({ ok: false, error: String(err) } as const)
        )
      : Promise.resolve({ ok: true, alerts: [] as PromAlert[] } as const);

    let series: PromSeriesMatrix[];
    try {
      series = await matrixPromise;
    } catch (err) {
      // Matrix failed — still try to surface live alerts when the window
      // ends at now, so a transient Cortex error doesn't blank the UI for
      // whatever is firing RIGHT NOW.
      const live = await liveSettled;
      if (!live.ok || live.alerts.length === 0) {
        return { alerts: [], error: String(err) };
      }
      return {
        alerts: live.alerts.map((a) => promAlertToUnified(a, ds.id)),
        fallback: 'prometheus-alerts-current-only',
        error: String(err),
      };
    }

    const windowStartMs = startEpochSec * 1000;
    const windowEndMs = endEpochSec * 1000;
    const stepMs = stepSec * 1000;
    // Edge tolerance: if the first sample of a run is within 1.5 steps of
    // the window's left edge, we conclude the alert was already firing at
    // that edge and mark `truncatedStart`. Symmetric at the right edge.
    // Without this tolerance we'd either over-clamp (every alert looks
    // like it spans the whole window because its first matrix sample is
    // at index 0) or under-clamp (a genuinely pre-window alert gets
    // reported as starting at its first sample inside the window).
    const edgeToleranceMs = Math.round(stepMs * 1.5);
    const episodes: PromAlertEpisode[] = [];

    for (const s of series) {
      const values = s.values;
      if (values.length === 0) continue;

      let runStart: number | null = null;
      let lastSampleTsInRun: number | null = null;
      let truncatedStart = false;

      const closeRun = (endTsMs: number, stillActive: boolean) => {
        if (runStart === null) return;
        episodes.push({
          labels: { ...s.metric },
          startMs: runStart,
          endMs: endTsMs,
          truncatedStart: truncatedStart ? true : undefined,
          stillActiveAtRangeEnd: stillActive ? true : undefined,
        });
        runStart = null;
        lastSampleTsInRun = null;
        truncatedStart = false;
      };

      for (let i = 0; i < values.length; i++) {
        const point = values[i];
        const isFiring = point.value === 1;
        if (isFiring) {
          if (runStart === null) {
            if (i === 0 && point.timestamp - windowStartMs <= edgeToleranceMs) {
              runStart = windowStartMs;
              truncatedStart = true;
            } else {
              runStart = point.timestamp;
            }
          }
          lastSampleTsInRun = point.timestamp;
        } else if (runStart !== null) {
          closeRun(lastSampleTsInRun ?? runStart, false);
        }
      }
      if (runStart !== null && lastSampleTsInRun !== null) {
        const stillActive = windowEndMs - lastSampleTsInRun <= edgeToleranceMs;
        closeRun(stillActive ? windowEndMs : lastSampleTsInRun, stillActive);
      }
    }

    const historicalAlerts = episodes.map((ep) => promEpisodeToUnified(ep, ds.id));

    // Build the dedupe set: the rule-identity hash of every episode that's
    // still active at the window's right edge. A live alert whose hash
    // matches one of these is already represented by an active historical
    // episode — suppress it to avoid the double-count we saw in the UI
    // (same rule appearing once from the matrix and once from /alerts).
    const activeEpisodeHashes = new Set<string>();
    for (const ep of episodes) {
      if (ep.stillActiveAtRangeEnd) {
        activeEpisodeHashes.add(hashRuleIdentity(ep.labels));
      }
    }

    const live = await liveSettled;
    const liveAlerts = live.ok ? live.alerts : [];
    const liveError = live.ok ? undefined : live.error;

    const liveAdditions: UnifiedAlertSummary[] = [];
    for (const la of liveAlerts) {
      // Skip pending alerts from the live endpoint for the same reason we
      // filtered pending out of the matrix query above — we want row
      // counts that don't flap with transient grace-period state.
      if (la.state === 'pending') continue;
      if (!activeEpisodeHashes.has(hashRuleIdentity(la.labels))) {
        liveAdditions.push(promAlertToUnified(la, ds.id));
      }
    }

    // When the matrix itself was empty BUT live alerts exist, flag the
    // response so the UI can explain that coverage was limited to "now".
    // With data from the matrix we skip the banner — the user is seeing
    // a legitimate historical view.
    const fallback =
      historicalAlerts.length === 0 && liveAdditions.length > 0
        ? ('prometheus-alerts-current-only' as const)
        : undefined;

    return {
      alerts: [...historicalAlerts, ...liveAdditions],
      ...(fallback ? { fallback } : {}),
      // Only surface the live-side error when it would otherwise be the
      // ONLY signal the user gets. If historical data landed successfully,
      // a secondary live failure is just "no currently-firing data beyond
      // what's in the matrix" — not worth flashing a per-datasource error.
      ...(liveError && historicalAlerts.length === 0 && liveAdditions.length === 0
        ? { error: liveError }
        : {}),
    };
  }

  /**
   * Execute a PromQL instant query via the DirectQuery query execution API.
   *
   * Uses: POST /_plugins/_directquery/_query/{dataSources}
   * Request body: { datasource, query, language: "PROMQL", options: { queryType: "instant", time } }
   * Response: Prometheus vector result with point-in-time values.
   */
  async queryInstant(
    client: AlertingOSClient,
    ds: Datasource,
    query: string,
    time?: number
  ): Promise<PromTimeSeriesPoint[]> {
    try {
      const dqName = this.resolveDqName(ds);
      const path = `/_plugins/_directquery/_query/${encodeURIComponent(dqName)}`;

      this.logger.debug(`DirectQuery instant query: ${query.substring(0, 80)}...`);

      const options: Record<string, string> = { queryType: 'instant' };
      if (time !== undefined) {
        options.time = time.toString();
      }

      const resp = await client.transport.request({
        method: 'POST',
        path,
        body: {
          datasource: dqName,
          query,
          language: 'PROMQL',
          options,
        },
      });

      return this.parseInstantQueryResponse(resp.body as Record<string, unknown>);
    } catch (err) {
      this.logger.warn(`Failed to execute DirectQuery instant query: ${err}`);
      return [];
    }
  }

  /**
   * Parse a DirectQuery query execution response.
   *
   * Response envelope from the SQL plugin:
   * {
   *   "queryId": "...",
   *   "results": {
   *     "{datasourceName}": {
   *       "resultType": "matrix" | "vector",
   *       "result": [{ metric: {...}, values: [[ts, val], ...] }]  // range
   *                  [{ metric: {...}, value: [ts, val] }]         // instant
   *     }
   *   },
   *   "sessionId": "..."
   * }
   *
   * See: sql/direct-query/.../datasource/PrometheusResult.java
   */
  private parseRangeQueryResponse(body: Record<string, unknown>): PromTimeSeriesPoint[] {
    const promResult = this.extractPrometheusResult(body);
    if (!promResult) return [];

    const points: PromTimeSeriesPoint[] = [];
    const result = (promResult.result ?? []) as Array<{
      metric?: Record<string, string>;
      values?: unknown[][];
    }>;

    if (result.length > 0) {
      const values = result[0].values || [];
      for (const pair of values) {
        if (Array.isArray(pair) && pair.length >= 2) {
          const ts = Number(pair[0]);
          const numVal = parseFloat(String(pair[1]));
          if (!isNaN(ts) && !isNaN(numVal)) {
            points.push({ timestamp: ts * 1000, value: numVal });
          }
        }
      }
    }

    return points;
  }

  private parseInstantQueryResponse(body: Record<string, unknown>): PromTimeSeriesPoint[] {
    const promResult = this.extractPrometheusResult(body);
    if (!promResult) return [];

    const points: PromTimeSeriesPoint[] = [];
    const result = (promResult.result ?? []) as Array<{
      metric?: Record<string, string>;
      value?: unknown[];
    }>;

    for (const entry of result) {
      if (Array.isArray(entry.value) && entry.value.length >= 2) {
        const ts = Number(entry.value[0]);
        const numVal = parseFloat(String(entry.value[1]));
        if (!isNaN(ts) && !isNaN(numVal)) {
          points.push({ timestamp: ts * 1000, value: numVal });
        }
      }
    }

    return points;
  }

  /**
   * Extract the PrometheusResult from the DirectQuery response envelope.
   * Handles both direct data and the nested results.{datasourceName} wrapper.
   */
  private extractPrometheusResult(
    body: Record<string, unknown>
  ): { resultType?: string; result?: unknown[] } | null {
    // Direct Prometheus response: { resultType, result }
    if (body?.resultType || body?.result) {
      return body as { resultType?: string; result?: unknown[] };
    }

    // Wrapped in data field: { data: { resultType, result } }
    if (body?.data && typeof body.data === 'object') {
      const data = body.data as Record<string, unknown>;
      if (data.resultType || data.result) {
        return data as { resultType?: string; result?: unknown[] };
      }
    }

    // DirectQuery envelope: { results: { "DatasourceName": { resultType, result } } }
    if (body?.results && typeof body.results === 'object') {
      const results = body.results as Record<string, unknown>;
      for (const val of Object.values(results)) {
        if (val && typeof val === 'object') {
          const dsResult = val as Record<string, unknown>;
          if (dsResult.resultType || dsResult.result) {
            return dsResult as { resultType?: string; result?: unknown[] };
          }
        }
      }
    }

    return null;
  }

  private parseDurationToSeconds(dur: string): number {
    if (!dur || dur === '0s') return 0;
    let total = 0;
    const hours = dur.match(/(\d+)h/);
    const mins = dur.match(/(\d+)m(?!s)/);
    const secs = dur.match(/(\d+)s/);
    if (hours) total += parseInt(hours[1], 10) * 3600;
    if (mins) total += parseInt(mins[1], 10) * 60;
    if (secs) total += parseInt(secs[1], 10);
    return total;
  }

  private mapAlert(a: PromRawAlert): PromAlert {
    return {
      labels: a.labels || {},
      annotations: a.annotations || {},
      state: (a.state || 'inactive') as PromAlert['state'],
      activeAt: a.activeAt || '',
      value: a.value != null ? String(a.value) : '',
    };
  }
}
