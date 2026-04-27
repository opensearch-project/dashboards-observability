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
} from '../../../common/types/alerting/types';

/**
 * @deprecated Kept as an exported type for compatibility with callers that
 * previously constructed with a DirectQueryConfig. The backend now relies on
 * the OSD scoped client for auth and TLS, so only the logger is used.
 */
export interface DirectQueryConfig {
  /** @deprecated No longer used — auth is supplied by OSD scoped client. */
  opensearchUrl?: string;
  /** @deprecated No longer used — auth is supplied by OSD scoped client. */
  auth?: { username: string; password: string };
  /** @deprecated No longer used — TLS is handled by OSD scoped client. */
  rejectUnauthorized?: boolean;
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

  // Alertmanager methods use the first available Prometheus datasource since
  // they are global (not per-datasource). A `_defaultDs` is resolved lazily
  // from whatever datasource was last used in getRuleGroups/getAlerts, or
  // the caller can set it via setDefaultDatasource().

  private _defaultDs?: Datasource;

  setDefaultDatasource(ds: Datasource): void {
    this._defaultDs = ds;
  }

  private requireDefaultDs(): Datasource {
    if (!this._defaultDs) {
      throw new Error('No default Prometheus datasource set for alertmanager operations');
    }
    return this._defaultDs;
  }

  async getAlertmanagerAlerts(client: AlertingOSClient): Promise<AlertmanagerAlert[]> {
    try {
      const data = await this.get<AlertmanagerAlert[]>(
        client,
        this.requireDefaultDs(),
        '/alertmanager/api/v2/alerts'
      );
      return Array.isArray(data) ? data : [];
    } catch (err) {
      this.logger.warn(`Failed to get alertmanager alerts via direct query: ${err}`);
      return [];
    }
  }

  async getAlertmanagerAlertGroups(client: AlertingOSClient): Promise<AlertmanagerAlertGroup[]> {
    try {
      const data = await this.get<AlertmanagerAlertGroup[]>(
        client,
        this.requireDefaultDs(),
        '/alertmanager/api/v2/alerts/groups'
      );
      return Array.isArray(data) ? data : [];
    } catch (err) {
      this.logger.warn(`Failed to get alertmanager alert groups via direct query: ${err}`);
      return [];
    }
  }

  async getAlertmanagerReceivers(client: AlertingOSClient): Promise<AlertmanagerReceiver[]> {
    try {
      const data = await this.get<AlertmanagerReceiver[]>(
        client,
        this.requireDefaultDs(),
        '/alertmanager/api/v2/receivers'
      );
      return Array.isArray(data) ? data : [];
    } catch (err) {
      this.logger.warn(`Failed to get alertmanager receivers via direct query: ${err}`);
      return [];
    }
  }

  async getSilences(client: AlertingOSClient): Promise<AlertmanagerSilence[]> {
    try {
      const data = await this.get<AlertmanagerSilence[]>(
        client,
        this.requireDefaultDs(),
        '/alertmanager/api/v2/silences'
      );
      return Array.isArray(data) ? data : [];
    } catch (err) {
      this.logger.warn(`Failed to get alertmanager silences via direct query: ${err}`);
      return [];
    }
  }

  async createSilence(client: AlertingOSClient, silence: AlertmanagerSilence): Promise<string> {
    const data = await this.post<string | { silenceID?: string; silenceId?: string }>(
      client,
      this.requireDefaultDs(),
      '/alertmanager/api/v2/silences',
      silence
    );
    if (typeof data === 'string') return data;
    return data?.silenceID || data?.silenceId || '';
  }

  async deleteSilence(client: AlertingOSClient, silenceId: string): Promise<boolean> {
    try {
      await this.del<unknown>(
        client,
        this.requireDefaultDs(),
        `/alertmanager/api/v2/silence/${encodeURIComponent(silenceId)}`
      );
      return true;
    } catch {
      return false;
    }
  }

  async getAlertmanagerStatus(client: AlertingOSClient): Promise<AlertmanagerStatus> {
    // Routes through DirectQuery: /_plugins/_directquery/_resources/{dsName}/alertmanager/api/v2/status
    return this.get<AlertmanagerStatus>(
      client,
      this.requireDefaultDs(),
      '/alertmanager/api/v2/status'
    );
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
