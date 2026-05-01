/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Prometheus / Alertmanager types.
 *
 * Mirrors the Prometheus HTTP API and the Alertmanager v2 API. Also holds
 * DirectQuery workspace types and PromQL-related shapes consumed by the
 * `DirectQueryPrometheusBackend` and the SLO / metadata provider paths.
 *
 * Prometheus types match: https://prometheus.io/docs/prometheus/latest/querying/api/
 */

import type { AlertingOSClient, Datasource } from './unified_types';

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
  // Alertmanager is a global endpoint reached through any Prometheus datasource,
  // so each method takes an explicit `ds` to resolve the `directQueryName` used in
  // the resource path. Callers are responsible for selecting a Prometheus datasource.

  /** Get alerts from Alertmanager (richer than Prometheus /api/v1/alerts — includes routing info) */
  getAlertmanagerAlerts?(client: AlertingOSClient, ds: Datasource): Promise<AlertmanagerAlert[]>;

  /** List active silences */
  getSilences?(client: AlertingOSClient, ds: Datasource): Promise<AlertmanagerSilence[]>;

  /** Create a new silence (returns the silence ID) */
  createSilence?(
    client: AlertingOSClient,
    ds: Datasource,
    silence: AlertmanagerSilence
  ): Promise<string>;

  /** Delete (expire) a silence by ID */
  deleteSilence?(client: AlertingOSClient, ds: Datasource, silenceId: string): Promise<boolean>;

  /** Get Alertmanager status */
  getAlertmanagerStatus?(client: AlertingOSClient, ds: Datasource): Promise<AlertmanagerStatus>;

  /** Get Alertmanager receivers (notification targets) */
  getAlertmanagerReceivers?(
    client: AlertingOSClient,
    ds: Datasource
  ): Promise<AlertmanagerReceiver[]>;

  /** Get Alertmanager alert groups */
  getAlertmanagerAlertGroups?(
    client: AlertingOSClient,
    ds: Datasource
  ): Promise<AlertmanagerAlertGroup[]>;
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
// Alertmanager parsed-config response (client-consumed shape, built by
// server/routes/alerting/alertmanager_handlers.ts::handleGetAlertmanagerConfig).
// ============================================================================

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
