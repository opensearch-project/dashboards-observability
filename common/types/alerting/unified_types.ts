/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Cross-backend / neutral Alert Manager types.
 *
 * This file holds types that are not specific to either the OpenSearch
 * Alerting plugin or Prometheus/Alertmanager — shared datasource shapes,
 * pagination, unified (UI-facing) summaries, service interfaces, and
 * progressive-loading primitives used across both backends.
 */

import type { OSAlert, OSMonitor } from './opensearch_types';
import type { PromAlert, PromAlertingRule } from './prometheus_types';

/**
 * Known fallback reasons a backend may surface through
 * `DatasourceFetchResult.fallback`. String-literal union (not `string`) so
 * the UI can exhaustively switch on the value and a new reason requires a
 * type-level declaration.
 *
 * Today's only member: Prometheus historical reconstruction returned an
 * empty matrix on a `now`-relative range, and the backend fell back to
 * `/api/v1/alerts` (current-active only).
 */
export type DatasourceFetchFallback = 'prometheus-alerts-current-only';

// ============================================================================
// OSD scoped client — structural shape of the subset we use
// ============================================================================

/**
 * Structural subset of OSD's `OpenSearchClient` (the `asCurrentUser` /
 * MDS-resolved scoped client). We declare it here instead of importing from
 * `opensearch-dashboards/server` so this file stays importable from the
 * browser bundle. The shape must stay compatible with
 * `src/core/server/opensearch/client/types.ts#OpenSearchClient`.
 *
 * Lives in `unified_types` because both the OpenSearch and Prometheus
 * backends accept this client — OSD routes Prometheus calls through the
 * same scoped OS client for auth / MDS resolution.
 */
export interface AlertingOSClient {
  transport: {
    request: <TBody = unknown>(
      params: {
        method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD';
        path: string;
        body?: unknown;
        querystring?: Record<string, string | number | boolean>;
      },
      options?: {
        // opensearch-js client honors `requestTimeout` and aborts the
        // underlying HTTP request when it elapses. Plumbed through as a
        // second-arg pass-through so callers (probe-sli, status aggregator)
        // can bound how long an upstream Prometheus query holds a socket.
        requestTimeout?: number;
      }
    ) => Promise<{ statusCode: number; body: TBody; headers?: Record<string, string> }>;
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
// Datasource service interface
// ============================================================================

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
  | 'cluster_metrics'
  | 'ppl';
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
  /**
   * Set by the OpenSearch backend when the post-fetch time-range filter
   * stopped paginating after hitting the 1000-alert cap. UI renders an
   * `EuiCallOut` prompting the user to narrow the range.
   */
  truncated?: boolean;
  /**
   * Set by the Prometheus backend when the historical range query returned
   * an empty matrix AND the range included `now`, so the backend fell back
   * to the legacy `/api/v1/alerts` (active-only) endpoint. UI renders a
   * per-datasource banner explaining the coverage limit.
   */
  fallback?: DatasourceFetchFallback;
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
  /**
   * Start of the time window as a date-math string (e.g. `"now-1h"`).
   * When both `startTime` and `endTime` are provided, backends scope
   * results to alerts whose active interval overlaps the window.
   * When omitted, legacy "no range" behavior is preserved.
   */
  startTime?: string;
  /**
   * End of the time window as a date-math string (e.g. `"now"`). See
   * {@link UnifiedFetchOptions.startTime} for semantics.
   */
  endTime?: string;
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
