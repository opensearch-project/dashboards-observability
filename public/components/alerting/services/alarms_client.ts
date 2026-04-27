/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Single source-of-truth HTTP client for the Alert Manager API.
 *
 * Features:
 *  - OSD paths (`/api/alerting/...`)
 *  - Response caching with 30s TTL
 *  - Request deduplication for concurrent calls
 *  - Full CRUD: monitors, alert actions
 */
import type {
  Datasource,
  DatasourceWarning,
  PrometheusMetricMetadata,
  UnifiedAlertSummary,
  UnifiedRuleSummary,
  UnifiedAlert,
  UnifiedRule,
  OSMonitor,
} from '../../../../common/types/alerting';

// ---------------------------------------------------------------------------
// HttpClient interface — implemented by OSD's http service adapter or fetch()
// Note: this mirrors OSD's HttpStart verb signatures (path, options?) where
// `options` carries `body` (pre-stringified JSON) and `query`. The class uses
// private httpGet/httpPost/... wrappers below to JSON.stringify bodies before
// dispatching, so call sites still pass raw body objects.
// ---------------------------------------------------------------------------

interface HttpFetchOpts {
  body?: string;
  query?: Record<string, string | undefined>;
}

export interface HttpClient {
  get<T = unknown>(path: string, opts?: HttpFetchOpts): Promise<T>;
  post<T = unknown>(path: string, opts?: HttpFetchOpts): Promise<T>;
  put<T = unknown>(path: string, opts?: HttpFetchOpts): Promise<T>;
  delete<T = unknown>(path: string, opts?: HttpFetchOpts): Promise<T>;
}

// ---------------------------------------------------------------------------
// Shared response types
// ---------------------------------------------------------------------------

export interface PaginatedResponse<T> {
  results: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  warnings?: DatasourceWarning[];
}

// ---------------------------------------------------------------------------
// API response types for endpoints with dynamic shapes
// ---------------------------------------------------------------------------

/** Response from GET /alertmanager/config */
export interface AlertmanagerConfigResponse {
  available: boolean;
  cluster?: {
    status: string;
    peers: Array<{ name: string; address: string }>;
    peerCount: number;
  };
  uptime?: string;
  versionInfo?: Record<string, string>;
  config?: {
    global: Record<string, unknown>;
    route: unknown;
    receivers: Array<{
      name: string;
      integrations: Array<{ type: string; summary: string }>;
    }>;
    inhibitRules: unknown[];
  };
  configParseError?: string;
  raw?: string;
  error?: string;
}

/** Response from POST /alerts/:id/acknowledge */
export interface AcknowledgeAlertResponse {
  id: string;
  state: string;
  result: unknown;
}

/** Response shape for monitor creation/update */
export interface MonitorResponse {
  id: string;
  [key: string]: unknown;
}

/** Response shape for monitor import */
export interface MonitorImportResponse {
  imported: number;
  total: number;
  results: Array<{ index: number; success: boolean; errors?: string[]; id?: string }>;
}

/** Response shape for monitor export */
export interface MonitorExportResponse {
  monitors: Array<Record<string, unknown>>;
}

/** Response shape for monitor deletion */
export interface MonitorDeleteResponse {
  deleted: boolean;
}

// ---------------------------------------------------------------------------
// Path configuration
// ---------------------------------------------------------------------------

interface ApiPaths {
  datasources: string;
  alerts: string;
  rules: string;
  monitors: (dsId: string) => string;
  alertmanagerConfig: string;
  acknowledgeAlert: (id: string) => string;
  alertDetail: (dsId: string, alertId: string) => string;
  ruleDetail: (dsId: string, ruleId: string) => string;
  metricNames: (dsId: string) => string;
  labelNames: (dsId: string) => string;
  labelValues: (dsId: string, label: string) => string;
  metricMetadata: (dsId: string) => string;
}

const OSD_PATHS: ApiPaths = {
  datasources: '/api/alerting/datasources',
  alerts: '/api/alerting/unified/alerts',
  rules: '/api/alerting/unified/rules',
  monitors: (dsId) => `/api/alerting/opensearch/${dsId}/monitors`,
  alertmanagerConfig: '/api/alerting/alertmanager/config',
  acknowledgeAlert: (id) => `/api/alerting/alerts/${encodeURIComponent(id)}/acknowledge`,
  alertDetail: (dsId, alertId) =>
    `/api/alerting/alerts/${encodeURIComponent(dsId)}/${encodeURIComponent(alertId)}`,
  ruleDetail: (dsId, ruleId) =>
    `/api/alerting/rules/${encodeURIComponent(dsId)}/${encodeURIComponent(ruleId)}`,
  metricNames: (dsId) => `/api/alerting/prometheus/${encodeURIComponent(dsId)}/metadata/metrics`,
  labelNames: (dsId) => `/api/alerting/prometheus/${encodeURIComponent(dsId)}/metadata/labels`,
  labelValues: (dsId, label) =>
    `/api/alerting/prometheus/${encodeURIComponent(
      dsId
    )}/metadata/label-values/${encodeURIComponent(label)}`,
  metricMetadata: (dsId) =>
    `/api/alerting/prometheus/${encodeURIComponent(dsId)}/metadata/metric-metadata`,
};

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000;

// ---------------------------------------------------------------------------
// AlarmsApiClient
// ---------------------------------------------------------------------------

export class AlarmsApiClient {
  private readonly paths: ApiPaths = OSD_PATHS;
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(private readonly http: HttpClient) {}

  /** Expose raw HTTP client for components that need direct API access. */
  public get rawHttp(): HttpClient {
    return this.http;
  }

  // ---- Inner HTTP adapter -------------------------------------------------
  // OSD's http.post/put/delete expect `{ body, query }` options with a
  // pre-stringified JSON `body`. These private wrappers accept a raw body
  // object, JSON.stringify it, and forward to the underlying client so every
  // public AlarmsApiClient method can keep its existing object-shaped args.

  private httpGet<T = unknown>(
    path: string,
    query?: Record<string, string | undefined>
  ): Promise<T> {
    return this.http.get<T>(path, query ? { query } : undefined);
  }

  private httpPost<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.http.post<T>(path, body !== undefined ? { body: JSON.stringify(body) } : undefined);
  }

  private httpPut<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.http.put<T>(path, body !== undefined ? { body: JSON.stringify(body) } : undefined);
  }

  private httpDelete<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.http.delete<T>(
      path,
      body !== undefined ? { body: JSON.stringify(body) } : undefined
    );
  }

  // ---- Datasources --------------------------------------------------------

  async listDatasources(): Promise<Datasource[]> {
    const res = await this.cachedGet<{ datasources: Datasource[] }>(this.paths.datasources);
    return res.datasources ?? [];
  }

  // ---- Alerts (paginated) -------------------------------------------------

  async listAlertsPaginated(
    dsIds: string[],
    _page: number,
    pageSize: number
  ): Promise<PaginatedResponse<UnifiedAlertSummary>> {
    const query: Record<string, string> = { maxResults: String(pageSize) };
    if (dsIds.length > 0) query.dsIds = dsIds.join(',');
    const res = await this.httpGet<{
      results?: UnifiedAlertSummary[];
      alerts?: UnifiedAlertSummary[];
    }>(this.paths.alerts, query);
    const items = res.results ?? res.alerts ?? [];
    return { results: items, total: items.length, page: 1, pageSize: items.length, hasMore: false };
  }

  // ---- Rules (paginated) --------------------------------------------------

  async listRulesPaginated(
    dsIds: string[],
    _page: number,
    pageSize: number
  ): Promise<PaginatedResponse<UnifiedRuleSummary>> {
    const query: Record<string, string> = { maxResults: String(pageSize) };
    if (dsIds.length > 0) query.dsIds = dsIds.join(',');
    const res = await this.httpGet<{
      results?: UnifiedRuleSummary[];
      rules?: UnifiedRuleSummary[];
    }>(this.paths.rules, query);
    const items = res.results ?? res.rules ?? [];
    return { results: items, total: items.length, page: 1, pageSize: items.length, hasMore: false };
  }

  // ---- Monitor CRUD -------------------------------------------------------

  async createMonitor(
    data: Partial<OSMonitor> | Record<string, unknown>,
    dsId: string
  ): Promise<MonitorResponse> {
    return this.httpPost<MonitorResponse>(this.paths.monitors(dsId), data);
  }
  async updateMonitor(
    id: string,
    data: Partial<OSMonitor> | Record<string, unknown>,
    dsId: string
  ): Promise<MonitorResponse> {
    return this.httpPut<MonitorResponse>(
      `${this.paths.monitors(dsId)}/${encodeURIComponent(id)}`,
      data
    );
  }
  async deleteMonitor(id: string, dsId: string): Promise<MonitorDeleteResponse> {
    return this.httpDelete<MonitorDeleteResponse>(
      `${this.paths.monitors(dsId)}/${encodeURIComponent(id)}`
    );
  }
  async importMonitors(
    json: Array<Record<string, unknown>>,
    dsId: string
  ): Promise<MonitorImportResponse> {
    return this.httpPost<MonitorImportResponse>(`${this.paths.monitors(dsId)}/import`, json);
  }
  async exportMonitors(dsId: string): Promise<MonitorExportResponse> {
    return this.httpGet<MonitorExportResponse>(`${this.paths.monitors(dsId)}/export`);
  }

  // ---- Alertmanager config ------------------------------------------------

  async getAlertmanagerConfig(dsId?: string): Promise<AlertmanagerConfigResponse> {
    return this.httpGet<AlertmanagerConfigResponse>(
      this.paths.alertmanagerConfig,
      dsId ? { dsId } : undefined
    );
  }

  // ---- Prometheus Metadata ------------------------------------------------

  async getMetricNames(
    dsId: string,
    search?: string
  ): Promise<{ metrics: string[]; total: number; truncated: boolean }> {
    if (search) {
      return this.httpGet(this.paths.metricNames(dsId), { search });
    }
    return this.cachedGet(this.paths.metricNames(dsId));
  }

  async getLabelNames(dsId: string, metric?: string): Promise<{ labels: string[] }> {
    if (metric) {
      return this.httpGet(this.paths.labelNames(dsId), { metric });
    }
    return this.cachedGet(this.paths.labelNames(dsId));
  }

  async getLabelValues(
    dsId: string,
    labelName: string,
    selector?: string
  ): Promise<{ values: string[]; total: number; truncated: boolean }> {
    if (selector) {
      return this.httpGet(this.paths.labelValues(dsId, labelName), { selector });
    }
    return this.cachedGet(this.paths.labelValues(dsId, labelName));
  }

  async getMetricMetadata(dsId: string): Promise<{ metadata: PrometheusMetricMetadata[] }> {
    return this.cachedGet(this.paths.metricMetadata(dsId));
  }

  // ---- Alert actions ------------------------------------------------------

  async acknowledgeAlert(
    id: string,
    datasourceId?: string,
    monitorId?: string
  ): Promise<AcknowledgeAlertResponse> {
    return this.httpPost<AcknowledgeAlertResponse>(this.paths.acknowledgeAlert(id), {
      datasourceId,
      monitorId,
    });
  }

  // ---- Detail views (flyouts) ---------------------------------------------

  async getAlertDetail(dsId: string, alertId: string): Promise<UnifiedAlert> {
    return this.httpGet<UnifiedAlert>(this.paths.alertDetail(dsId, alertId));
  }

  async getRuleDetail(dsId: string, ruleId: string): Promise<UnifiedRule> {
    return this.httpGet<UnifiedRule>(this.paths.ruleDetail(dsId, ruleId));
  }

  // ---- Cache management ---------------------------------------------------

  invalidateCache(): void {
    this.cache.clear();
  }

  private async cachedGet<T>(path: string): Promise<T> {
    const cached = this.cache.get(path);
    if (cached && cached.expiresAt > Date.now()) return cached.data as T;

    const existing = this.inFlight.get(path);
    if (existing) return existing as Promise<T>;

    const request = this.httpGet<T>(path)
      .then((data) => {
        this.cache.set(path, { data, expiresAt: Date.now() + CACHE_TTL_MS });
        return data;
      })
      .finally(() => {
        this.inFlight.delete(path);
      });

    this.inFlight.set(path, request);
    return request;
  }
}
