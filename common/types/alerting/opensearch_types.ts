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
  getAlerts(client: AlertingOSClient): Promise<{ alerts: OSAlert[]; totalAlerts: number }>;
  acknowledgeAlerts(
    client: AlertingOSClient,
    monitorId: string,
    alertIds: string[]
  ): Promise<unknown>;

  // Destinations
  getDestinations(client: AlertingOSClient): Promise<OSDestination[]>;
  createDestination(
    client: AlertingOSClient,
    dest: Omit<OSDestination, 'id'>
  ): Promise<OSDestination>;
  deleteDestination(client: AlertingOSClient, destId: string): Promise<boolean>;
}
