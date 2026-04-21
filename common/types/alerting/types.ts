/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Core types for the Alert Manager plugin.
 *
 * OpenSearch types match: https://opensearch.org/docs/latest/observing-your-data/alerting/api/
 * Prometheus types match: https://prometheus.io/docs/prometheus/latest/querying/api/
 */

// ============================================================================
// OSD scoped client — structural shape of the subset we use
// ============================================================================

/**
 * Structural subset of OSD's `OpenSearchClient` (the `asCurrentUser` /
 * MDS-resolved scoped client). We declare it here instead of importing from
 * `opensearch-dashboards/server` so this file stays importable from the
 * browser bundle. The shape must stay compatible with
 * `src/core/server/opensearch/client/types.ts#OpenSearchClient`.
 */
export interface AlertingOSClient {
  transport: {
    request: <TBody = unknown>(params: {
      method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD';
      path: string;
      body?: unknown;
      querystring?: Record<string, string | number | boolean>;
    }) => Promise<{ statusCode: number; body: TBody; headers?: Record<string, string> }>;
  };
}

// ============================================================================
// Datasource
// ============================================================================

export type DatasourceType = 'opensearch' | 'prometheus';

export interface Datasource {
  id: string;
  name: string;
  type: DatasourceType;
  url: string;
  enabled: boolean;
  /** For Prometheus datasources decomposed into workspaces */
  workspaceId?: string;
  workspaceName?: string;
  /** The parent datasource ID if this is a workspace-derived entry */
  parentDatasourceId?: string;
  /**
   * Name of this datasource as registered in the OpenSearch SQL plugin.
   * Used by DirectQueryPrometheusBackend to route API calls through:
   *   /_plugins/_directquery/_resources/{directQueryName}/...
   */
  directQueryName?: string;
  /** OSD Multi-Data-Source saved object ID — when set, use context.dataSource.opensearch.getClient(mdsId) */
  mdsId?: string;
  auth?: {
    type: 'basic' | 'apikey' | 'sigv4';
    credentials?: Record<string, string>;
  };
  tls?: {
    rejectUnauthorized?: boolean;
  };
}

// ============================================================================
// Prometheus Workspace
// ============================================================================

export interface PrometheusWorkspace {
  id: string;
  name: string;
  alias?: string;
  region?: string;
  status: 'active' | 'inactive';
}

// ============================================================================
// Pagination
// ============================================================================

export interface DatasourceWarning {
  datasourceId: string;
  datasourceName: string;
  datasourceType: DatasourceType;
  error: string;
}

export interface PaginatedResponse<T> {
  results: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  /** Per-datasource errors for partially-failed fetches. Absent when all succeed. */
  warnings?: DatasourceWarning[];
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

// ============================================================================
// OpenSearch Alerting types
// (mirrors _plugins/_alerting API shapes)
// ============================================================================

export interface OSSchedule {
  period: { interval: number; unit: 'MINUTES' | 'HOURS' | 'DAYS' };
}

export interface OSAction {
  id: string;
  name: string;
  destination_id: string;
  message_template: { source: string; lang?: string };
  subject_template?: { source: string; lang?: string };
  throttle_enabled: boolean;
  throttle?: { value: number; unit: 'MINUTES' };
}

export interface OSTrigger {
  id: string;
  name: string;
  severity: '1' | '2' | '3' | '4' | '5';
  condition: { script: { source: string; lang: string } };
  actions: OSAction[];
}

export type OSMonitorInput =
  | { search: { indices: string[]; query: Record<string, unknown> } }
  | {
      uri: { api_type: string; path: string; path_params: string; url: string; clusters: string[] };
    }
  | {
      doc_level_input: {
        description: string;
        indices: string[];
        queries: Array<{ id: string; name: string; query: string; tags: string[] }>;
      };
    };

export interface OSMonitor {
  id: string;
  type: 'monitor';
  monitor_type: 'query_level_monitor' | 'bucket_level_monitor' | 'doc_level_monitor';
  name: string;
  enabled: boolean;
  schedule: OSSchedule;
  inputs: OSMonitorInput[];
  triggers: OSTrigger[];
  last_update_time: number;
  schema_version?: number;
}

export type OSAlertState = 'ACTIVE' | 'ACKNOWLEDGED' | 'COMPLETED' | 'ERROR' | 'DELETED';

export interface OSAlert {
  id: string;
  version: number;
  monitor_id: string;
  monitor_name: string;
  monitor_version: number;
  trigger_id: string;
  trigger_name: string;
  state: OSAlertState;
  severity: '1' | '2' | '3' | '4' | '5';
  error_message: string | null;
  start_time: number;
  last_notification_time: number;
  end_time: number | null;
  acknowledged_time: number | null;
  action_execution_results: Array<{
    action_id: string;
    last_execution_time: number;
    throttled_count: number;
  }>;
}

export interface OSDestination {
  id: string;
  type: 'slack' | 'email' | 'custom_webhook' | 'chime';
  name: string;
  last_update_time: number;
  schema_version?: number;
  slack?: { url: string };
  custom_webhook?: Record<string, unknown>;
  email?: Record<string, unknown>;
}

// ============================================================================
// OpenSearch Alerting API response shapes (for backend parsing)
// ============================================================================

export interface OSMonitorSource {
  type?: string;
  monitor_type?: string;
  name?: string;
  enabled?: boolean;
  schedule?: OSSchedule;
  inputs?: OSMonitorInput[];
  triggers?: OSRawTrigger[];
  last_update_time?: number;
  schema_version?: number;
}

export interface OSRawTrigger {
  id?: string;
  name?: string;
  severity?: string | number;
  condition?: { script: { source: string; lang?: string } };
  actions?: OSRawAction[];
  query_level_trigger?: Record<string, unknown>;
  bucket_level_trigger?: Record<string, unknown>;
  doc_level_trigger?: Record<string, unknown>;
}

export interface OSRawAction {
  id?: string;
  name?: string;
  destination_id?: string;
  message_template?: { source: string; lang?: string };
  subject_template?: { source: string; lang?: string };
  throttle_enabled?: boolean;
  throttle?: { value: number; unit: string };
}

export interface OSMonitorHit {
  _id: string;
  _source: OSMonitorSource;
  sort?: unknown[];
}

export interface OSSearchResponse {
  hits: {
    total?: { value: number };
    hits: OSMonitorHit[];
  };
}

export interface OSGetMonitorResponse {
  _id: string;
  _version?: number;
  _seq_no?: number;
  _primary_term?: number;
  monitor: OSMonitorSource;
}

export interface OSCreateMonitorResponse {
  _id: string;
  _version?: number;
  monitor: OSMonitorSource;
}

export interface OSAlertRaw {
  id?: string;
  alert_id?: string;
  version?: number;
  monitor_id?: string;
  monitor_name?: string;
  monitor_version?: number;
  trigger_id?: string;
  trigger_name?: string;
  state?: string;
  severity?: string | number;
  error_message?: string | null;
  start_time?: number;
  last_notification_time?: number;
  end_time?: number | null;
  acknowledged_time?: number | null;
  action_execution_results?: unknown[];
}

export interface OSAlertsApiResponse {
  totalAlerts?: number;
  alerts?: OSAlertRaw[];
}

export interface OSDestinationRaw {
  id?: string;
  type?: string;
  name?: string;
  last_update_time?: number;
  schema_version?: number;
  slack?: { url: string };
  custom_webhook?: Record<string, unknown>;
  email?: Record<string, unknown>;
}

export interface OSDestinationsApiResponse {
  destinations?: OSDestinationRaw[];
}

// ============================================================================
// Prometheus / AMP Alerting types
// (mirrors /api/v1/rules and /api/v1/alerts)
// ============================================================================

export type PromAlertState = 'firing' | 'pending' | 'inactive';
export type PromRuleHealth = 'ok' | 'err' | 'unknown';

export interface PromAlert {
  labels: Record<string, string>;
  annotations: Record<string, string>;
  state: PromAlertState;
  activeAt: string;
  value: string;
}

export interface PromAlertingRule {
  name: string;
  query: string;
  duration: number; // seconds
  labels: Record<string, string>;
  annotations: Record<string, string>;
  alerts: PromAlert[];
  health: PromRuleHealth;
  type: 'alerting';
  state: PromAlertState;
  lastEvaluation?: string;
  evaluationTime?: number;
}

export interface PromRecordingRule {
  name: string;
  query: string;
  labels: Record<string, string>;
  health: PromRuleHealth;
  type: 'recording';
  lastEvaluation?: string;
  evaluationTime?: number;
}

export type PromRule = PromAlertingRule | PromRecordingRule;

export interface PromRuleGroup {
  name: string;
  file: string;
  rules: PromRule[];
  interval: number; // seconds
}

// ============================================================================
// Service interfaces
// ============================================================================

/** OpenSearch Alerting backend */
export interface OpenSearchBackend {
  readonly type: 'opensearch';

  // Monitors
  getMonitors(ds: Datasource): Promise<OSMonitor[]>;
  getMonitor(ds: Datasource, monitorId: string): Promise<OSMonitor | null>;
  createMonitor(ds: Datasource, monitor: Omit<OSMonitor, 'id'>): Promise<OSMonitor>;
  updateMonitor(
    ds: Datasource,
    monitorId: string,
    monitor: Partial<OSMonitor>
  ): Promise<OSMonitor | null>;
  deleteMonitor(ds: Datasource, monitorId: string): Promise<boolean>;
  runMonitor(ds: Datasource, monitorId: string, dryRun?: boolean): Promise<unknown>;
  searchQuery(ds: Datasource, indices: string[], body: Record<string, unknown>): Promise<unknown>;

  // Alerts
  getAlerts(ds: Datasource): Promise<{ alerts: OSAlert[]; totalAlerts: number }>;
  acknowledgeAlerts(ds: Datasource, monitorId: string, alertIds: string[]): Promise<unknown>;

  // Destinations
  getDestinations(ds: Datasource): Promise<OSDestination[]>;
  createDestination(ds: Datasource, dest: Omit<OSDestination, 'id'>): Promise<OSDestination>;
  deleteDestination(ds: Datasource, destId: string): Promise<boolean>;
}

// ============================================================================
// Prometheus Alertmanager types
// (mirrors /api/v2 shapes from prom/alertmanager)
// ============================================================================

export interface AlertmanagerSilence {
  id?: string;
  status?: { state: 'active' | 'pending' | 'expired' };
  createdBy: string;
  comment: string;
  startsAt: string;
  endsAt: string;
  matchers: Array<{
    name: string;
    value: string;
    isRegex: boolean;
    isEqual: boolean;
  }>;
}

export interface AlertmanagerAlert {
  labels: Record<string, string>;
  annotations: Record<string, string>;
  startsAt: string;
  endsAt: string;
  generatorURL: string;
  fingerprint: string;
  status: {
    state: 'active' | 'suppressed' | 'unprocessed';
    silencedBy: string[];
    inhibitedBy: string[];
  };
  receivers: Array<{ name: string }>;
}

export interface AlertmanagerStatus {
  cluster: { status: string; peers: Array<{ name: string; address: string }> };
  config: { original: string };
  uptime: string;
  versionInfo: Record<string, string>;
}

export interface AlertmanagerReceiver {
  name: string;
}

// ============================================================================
// Prometheus Metric Metadata
// ============================================================================

/**
 * Metric metadata from the Prometheus `/api/v1/metadata` endpoint.
 *
 * Used by the SLO creation wizard to auto-detect metric types and suggest
 * appropriate SLI configurations. When metadata is unavailable (e.g. the
 * Prometheus instance doesn't expose metadata, or the API call fails),
 * the system falls back to suffix-based heuristics in `detectMetricType()`.
 */
export interface PrometheusMetricMetadata {
  /** Prometheus metric name (e.g. "http_requests_total"). */
  metric: string;
  /** Metric type as reported by the Prometheus metadata API. */
  type: 'counter' | 'gauge' | 'histogram' | 'summary' | 'unknown';
  /** Human-readable help string from the HELP comment in the metrics exposition. */
  help: string;
}

// ============================================================================
// Prometheus API response shapes (for backend parsing)
// ============================================================================

export interface PromRulesApiResponse {
  data?: { groups: PromRawRuleGroup[] };
  groups?: PromRawRuleGroup[];
  status?: string;
}

export interface PromRawRuleGroup {
  name: string;
  file: string;
  interval?: string | number;
  rules: PromRawRule[];
}

export interface PromRawRule {
  type: 'recording' | 'alerting';
  name?: string;
  record?: string;
  alert?: string;
  expr?: string;
  query?: string;
  for?: string;
  duration?: string | number;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  alerts?: PromRawAlert[];
  health?: string;
  state?: string;
  lastEvaluation?: string;
  evaluationTime?: number;
}

export interface PromRawAlert {
  labels: Record<string, string>;
  annotations: Record<string, string>;
  state: string;
  activeAt: string;
  value?: string | number;
}

export interface PromAlertsApiResponse {
  data?: PromRawAlert[] | { alerts: PromRawAlert[] };
  alerts?: PromRawAlert[];
  status?: string;
}

export interface DatasourceDefinition {
  name: string;
  connector?: string;
  status?: string;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AlertmanagerAlertGroup {
  labels: Record<string, string>;
  receiver: { name: string };
  alerts: AlertmanagerAlert[];
}

/** Prometheus / AMP backend */
/** Time-series data point from Prometheus range query. */
export interface PromTimeSeriesPoint {
  timestamp: number;
  value: number;
}

export interface PrometheusBackend {
  readonly type: 'prometheus';

  // Rules (read-only from Prometheus API; AMP supports write via ruler API)
  getRuleGroups(client: AlertingOSClient, ds: Datasource): Promise<PromRuleGroup[]>;

  // Active alerts from Prometheus server
  getAlerts(client: AlertingOSClient, ds: Datasource): Promise<PromAlert[]>;

  // Workspace discovery
  listWorkspaces(client: AlertingOSClient, ds: Datasource): Promise<PrometheusWorkspace[]>;

  /** Execute a PromQL range query and return time-series data points. */
  queryRange?(
    client: AlertingOSClient,
    ds: Datasource,
    query: string,
    start: number,
    end: number,
    step: number
  ): Promise<PromTimeSeriesPoint[]>;

  /** Execute a PromQL instant query and return point-in-time values. */
  queryInstant?(
    client: AlertingOSClient,
    ds: Datasource,
    query: string,
    time?: number
  ): Promise<PromTimeSeriesPoint[]>;

  // ---- Alertmanager operations (optional — only available when alertmanagerUrl is set) ----

  /** Get alerts from Alertmanager (richer than Prometheus /api/v1/alerts — includes routing info) */
  getAlertmanagerAlerts?(client: AlertingOSClient): Promise<AlertmanagerAlert[]>;

  /** List active silences */
  getSilences?(client: AlertingOSClient): Promise<AlertmanagerSilence[]>;

  /** Create a new silence (returns the silence ID) */
  createSilence?(client: AlertingOSClient, silence: AlertmanagerSilence): Promise<string>;

  /** Delete (expire) a silence by ID */
  deleteSilence?(client: AlertingOSClient, silenceId: string): Promise<boolean>;

  /** Get Alertmanager status */
  getAlertmanagerStatus?(client: AlertingOSClient): Promise<AlertmanagerStatus>;

  /** Get Alertmanager receivers (notification targets) */
  getAlertmanagerReceivers?(client: AlertingOSClient): Promise<AlertmanagerReceiver[]>;

  /** Get Alertmanager alert groups */
  getAlertmanagerAlertGroups?(client: AlertingOSClient): Promise<AlertmanagerAlertGroup[]>;

  /**
   * Alertmanager is a global endpoint reached through any Prometheus datasource.
   * Setting a default lets `getAlertmanagerStatus` and friends resolve a
   * `directQueryName` for the resource path.
   */
  setDefaultDatasource?(ds: Datasource): void;
}

export interface DatasourceService {
  list(): Promise<Datasource[]>;
  get(id: string): Promise<Datasource | null>;
  create(input: Omit<Datasource, 'id'>): Promise<Datasource>;
  update(id: string, input: Partial<Datasource>): Promise<Datasource | null>;
  delete(id: string): Promise<boolean>;
  testConnection(
    client: AlertingOSClient,
    id: string
  ): Promise<{ success: boolean; message: string }>;
  /** List workspaces for a Prometheus datasource, returning them as selectable datasource entries */
  listWorkspaces(client: AlertingOSClient, dsId: string): Promise<Datasource[]>;
}

// ============================================================================
// Unified view types (for the UI to consume across backends)
// ============================================================================

export type UnifiedAlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type UnifiedAlertState =
  | 'active'
  | 'pending'
  | 'acknowledged'
  | 'silenced'
  | 'resolved'
  | 'error';

/** Lightweight alert representation for list views and tables. */
export interface UnifiedAlertSummary {
  id: string;
  datasourceId: string;
  datasourceType: DatasourceType;
  name: string;
  state: UnifiedAlertState;
  severity: UnifiedAlertSeverity;
  message?: string;
  startTime: string;
  lastUpdated: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

/** Full alert with backend-specific raw data. Use for detail views only. */
export interface UnifiedAlert extends UnifiedAlertSummary {
  raw: OSAlert | PromAlert;
}

export type MonitorType =
  | 'metric'
  | 'log'
  | 'apm'
  | 'composite'
  | 'infrastructure'
  | 'synthetics'
  | 'cluster_metrics';
export type MonitorStatus = 'active' | 'pending' | 'muted' | 'disabled';
export type MonitorHealthStatus = 'healthy' | 'failing' | 'no_data';

export interface SuppressionRule {
  id: string;
  name: string;
  reason: string;
  schedule?: string; // e.g. "Sat 02:00-06:00 UTC"
  matchLabels?: Record<string, string>;
  active: boolean;
}

export interface AlertHistoryEntry {
  timestamp: string;
  state: UnifiedAlertState;
  value?: string;
  message?: string;
}

export interface NotificationRouting {
  channel: string; // e.g. "Slack", "Email", "PagerDuty"
  destination: string; // e.g. "#ops-alerts", "oncall@example.com"
  severity?: UnifiedAlertSeverity[];
  throttle?: string; // e.g. "10 minutes"
}

/** Lightweight rule representation for list views and tables. */
export interface UnifiedRuleSummary {
  id: string;
  datasourceId: string;
  datasourceType: DatasourceType;
  name: string;
  enabled: boolean;
  severity: UnifiedAlertSeverity;
  query: string;
  condition: string;
  group?: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  monitorType: MonitorType;
  status: MonitorStatus;
  healthStatus: MonitorHealthStatus;
  createdBy: string;
  createdAt: string;
  lastModified: string;
  lastTriggered?: string;
  notificationDestinations: string[];
  evaluationInterval: string;
  pendingPeriod: string;
  threshold?: { operator: string; value: number; unit?: string };
}

/** Full rule with detail-view fields. Use for single-item detail views only. */
export interface UnifiedRule extends UnifiedRuleSummary {
  description: string;
  aiSummary: string;
  firingPeriod?: string;
  lookbackPeriod?: string;
  alertHistory: AlertHistoryEntry[];
  conditionPreviewData: Array<{ timestamp: number; value: number }>;
  notificationRouting: NotificationRouting[];
  suppressionRules: SuppressionRule[];
  raw: OSMonitor | PromAlertingRule;
}

// ============================================================================
// Progressive Loading Types
// ============================================================================

export type DatasourceFetchStatus = 'pending' | 'loading' | 'success' | 'error' | 'timeout';

export interface DatasourceFetchResult<T> {
  datasourceId: string;
  datasourceName: string;
  datasourceType: DatasourceType;
  status: DatasourceFetchStatus;
  data: T[];
  error?: string;
  durationMs: number;
}

export interface ProgressiveResponse<T> {
  results: T[];
  datasourceStatus: Array<DatasourceFetchResult<T>>;
  totalDatasources: number;
  completedDatasources: number;
  fetchedAt: string;
}

export interface UnifiedFetchOptions {
  /** Only fetch from these datasource IDs. If empty/undefined, fetch from all enabled. */
  dsIds?: string[];
  /** Per-datasource timeout in ms. Defaults to 10000. */
  timeoutMs?: number;
  /** Called as each datasource completes, for progressive UI updates. */
  onProgress?: (result: DatasourceFetchResult<unknown>) => void;
  /** Pagination params for server-side pagination. */
  page?: number;
  pageSize?: number;
  /** Maximum total results to return. Defaults to 5000. Prevents unbounded responses. */
  maxResults?: number;
}

// ============================================================================
// Prometheus Metadata Provider
// ============================================================================

/** Separate interface for metadata discovery — keeps PrometheusBackend clean. */
export interface PrometheusMetadataProvider {
  getMetricNames(client: AlertingOSClient, ds: Datasource): Promise<string[]>;
  getLabelNames(client: AlertingOSClient, ds: Datasource, metric?: string): Promise<string[]>;
  getLabelValues(
    client: AlertingOSClient,
    ds: Datasource,
    labelName: string,
    selector?: string
  ): Promise<string[]>;
  getMetricMetadata(client: AlertingOSClient, ds: Datasource): Promise<PrometheusMetricMetadata[]>;
}

// ============================================================================
// Logger
// ============================================================================

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
}
