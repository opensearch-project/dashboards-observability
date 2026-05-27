/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenSearch Alerting plugin types.
 *
 * Mirrors the `_plugins/_alerting` API shapes — monitors, alerts,
 * destinations, and the raw response shapes the backend parser consumes.
 *
 * OpenSearch types match: https://opensearch.org/docs/latest/observing-your-data/alerting/api/
 */

import type { AlertingOSClient } from './unified_types';

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

export type OSPPLQueryLanguage = 'ppl' | 'sql';

export interface OSPPLInput {
  ppl_input: {
    query: string;
    query_language: OSPPLQueryLanguage;
  };
}

export type OSPPLNumResultsOperator = '>' | '>=' | '<' | '<=' | '==' | '!=';
export type OSPPLConditionType = 'number_of_results' | 'custom';

/** Inner body of a `ppl_trigger`. The wire envelope is {@link OSPPLTrigger}. */
export interface OSPPLTriggerBody {
  id?: string;
  name: string;
  severity: '1' | '2' | '3' | '4' | '5';
  actions: OSAction[];
  type: OSPPLConditionType;
  num_results_condition?: OSPPLNumResultsOperator;
  num_results_value?: number;
  custom_condition?: string;
}

/** Wire-shape PPL trigger as it appears in monitor payloads. */
export interface OSPPLTrigger {
  ppl_trigger: OSPPLTriggerBody;
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
    }
  | OSPPLInput;

export type OSMonitorType =
  | 'query_level_monitor'
  | 'bucket_level_monitor'
  | 'doc_level_monitor'
  | 'ppl_monitor';

export interface OSMonitor {
  id: string;
  type: 'monitor';
  monitor_type: OSMonitorType;
  name: string;
  enabled: boolean;
  schedule: OSSchedule;
  inputs: OSMonitorInput[];
  /** Wrapped `OSPPLTrigger` for `ppl_monitor`; flat `OSTrigger` otherwise. */
  triggers: Array<OSTrigger | OSPPLTrigger>;
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

/**
 * Notification channel projection — populated from the OpenSearch
 * Notifications plugin's `_notifications/channels` endpoint, which replaces
 * the deprecated `_alerting/destinations` API. The picker only consumes
 * the lightweight identity/type triple; the full per-config payload (slack
 * url, smtp host, etc.) lives behind the Notifications plugin's own UI.
 *
 * `type` is widened to `string` because the Notifications plugin supports
 * a broader set of channel types than the legacy alerting destinations
 * (slack, chime, webhook, email, sns, ses_account, smtp_account,
 * email_group, microsoft_teams, ...) and the picker only needs to render
 * the value as a label.
 */
export interface OSDestination {
  id: string;
  type: string;
  name: string;
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
  ppl_trigger?: OSRawPPLTrigger;
}

/** Permissive read-side shape — the mapper fills defaults for missing fields. */
export interface OSRawPPLTrigger {
  id?: string;
  name?: string;
  severity?: string | number;
  actions?: OSRawAction[];
  type?: string;
  num_results_condition?: string;
  num_results_value?: number;
  custom_condition?: string;
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

/**
 * One entry from `GET /_plugins/_notifications/channels.channel_list[]`.
 * The endpoint is a lightweight, picker-friendly projection of the full
 * Notifications config — only id/name/type/description/is_enabled.
 *
 * Reference: https://docs.opensearch.org/latest/observing-your-data/notifications/api/
 *   "List all notification channels: GET /_plugins/_notifications/channels"
 */
export interface OSNotificationChannelRaw {
  config_id?: string;
  name?: string;
  description?: string;
  /**
   * Notifications config_type, e.g. `slack` | `chime` | `webhook` | `email`
   * | `sns` | `ses_account` | `smtp_account` | `email_group` |
   * `microsoft_teams`. Kept as a string so a future channel type doesn't
   * break the picker.
   */
  config_type?: string;
  is_enabled?: boolean;
}

export interface OSNotificationChannelsApiResponse {
  start_index?: number;
  total_hits?: number;
  total_hit_relation?: 'eq' | 'gte';
  channel_list?: OSNotificationChannelRaw[];
}

/**
 * Mapped result of the notifications `_plugins/_notifications/channels`
 * call. The endpoint returns up to its own server-side default page (no
 * client-controllable size on `/channels`), so we surface `total_hits` as
 * `totalDestinations` and set `truncated` when the returned list is
 * shorter than the upstream total.
 */
export interface OSDestinationsResult {
  destinations: OSDestination[];
  totalDestinations: number;
  truncated: boolean;
}

// ============================================================================
// Service interfaces
// ============================================================================

/** OpenSearch Alerting backend.
 *
 * Implementations talk to the cluster through the caller-provided scoped
 * `AlertingOSClient` (resolved via OSD's multi-data-source client factory).
 * The datasource identity is already baked into that client, so the methods
 * take the client directly rather than a `Datasource`.
 */
export interface OpenSearchBackend {
  readonly type: 'opensearch';

  // Monitors — read-only methods.
  getMonitors(client: AlertingOSClient): Promise<OSMonitor[]>;
  getMonitor(client: AlertingOSClient, monitorId: string): Promise<OSMonitor | null>;
  runMonitor(client: AlertingOSClient, monitorId: string, dryRun?: boolean): Promise<unknown>;
  searchQuery(
    client: AlertingOSClient,
    indices: string[],
    body: Record<string, unknown>
  ): Promise<unknown>;

  // Mutations — kept on the backend interface for the service layer;
  // `MonitorMutationService` shadows them for the dedicated mutation routes.
  createMonitor(client: AlertingOSClient, monitor: Omit<OSMonitor, 'id'>): Promise<OSMonitor>;
  updateMonitor(
    client: AlertingOSClient,
    monitorId: string,
    monitor: Partial<OSMonitor>,
    seqNo?: number,
    primaryTerm?: number
  ): Promise<OSMonitor | null>;
  deleteMonitor(client: AlertingOSClient, monitorId: string): Promise<boolean>;

  // Alerts — read + acknowledge.
  getAlerts(
    client: AlertingOSClient,
    options?: { startMs?: number; endMs?: number }
  ): Promise<{ alerts: OSAlert[]; totalAlerts: number; truncated: boolean }>;
  acknowledgeAlerts(
    client: AlertingOSClient,
    monitorId: string,
    alertIds: string[]
  ): Promise<unknown>;

  // Notification channels (read-only projection — destination CRUD lives in
  // the OpenSearch Notifications plugin's own UI; we only feed the picker).
  getDestinations(client: AlertingOSClient): Promise<OSDestinationsResult>;
}
