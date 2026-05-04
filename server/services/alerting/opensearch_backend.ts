/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Real OpenSearch Alerting backend — talks to _plugins/_alerting REST APIs.
 *
 * API reference: https://opensearch.org/docs/latest/observing-your-data/alerting/api/
 */
import {
  AlertingOSClient,
  Logger,
  OpenSearchBackend,
  OSMonitor,
  OSAlert,
  OSDestination,
  OSTrigger,
  OSSearchResponse,
  OSGetMonitorResponse,
  OSCreateMonitorResponse,
  OSAlertsApiResponse,
  OSAlertRaw,
  OSMonitorSource,
  OSRawTrigger,
  OSRawAction,
  OSDestinationRaw,
  OSDestinationsApiResponse,
} from '../../../common/types/alerting';
import { isStatusCode } from './errors';

export class HttpOpenSearchBackend implements OpenSearchBackend {
  readonly type = 'opensearch' as const;

  constructor(private readonly logger: Logger) {}

  // =========================================================================
  // Monitors
  // =========================================================================

  async getMonitors(client: AlertingOSClient): Promise<OSMonitor[]> {
    const PAGE_SIZE = 100;
    const monitors: OSMonitor[] = [];
    let searchAfter: unknown[] | undefined;

    // Use search_after pagination to retrieve all monitors
    while (true) {
      const body: Record<string, unknown> = {
        query: { match_all: {} },
        size: PAGE_SIZE,
        sort: [{ _id: 'asc' }],
      };
      if (searchAfter) {
        body.search_after = searchAfter;
      }

      const resp = await this.req<OSSearchResponse>(
        client,
        'POST',
        '/_plugins/_alerting/monitors/_search',
        body
      );
      const hits = resp.body?.hits?.hits ?? [];
      if (hits.length === 0) break;

      for (const hit of hits) {
        monitors.push(this.mapMonitor(hit._id, hit._source));
      }

      if (hits.length < PAGE_SIZE) break;
      searchAfter = hits[hits.length - 1].sort;
    }

    return monitors;
  }

  async getMonitor(client: AlertingOSClient, monitorId: string): Promise<OSMonitor | null> {
    try {
      const resp = await this.req<OSGetMonitorResponse>(
        client,
        'GET',
        `/_plugins/_alerting/monitors/${monitorId}`
      );
      return this.mapMonitor(resp.body._id, resp.body.monitor);
    } catch (err) {
      if (this.is404(err)) return null;
      throw err;
    }
  }

  async createMonitor(
    client: AlertingOSClient,
    monitor: Omit<OSMonitor, 'id'>
  ): Promise<OSMonitor> {
    const resp = await this.req<OSCreateMonitorResponse>(
      client,
      'POST',
      '/_plugins/_alerting/monitors',
      {
        ...monitor,
        type: 'monitor',
      }
    );
    return this.mapMonitor(resp.body._id, resp.body.monitor);
  }

  async updateMonitor(
    client: AlertingOSClient,
    monitorId: string,
    input: Partial<OSMonitor>
  ): Promise<OSMonitor | null> {
    // Fetch the current monitor with version info for optimistic concurrency
    let seqNo: number | undefined;
    let primaryTerm: number | undefined;
    try {
      const getResp = await this.req<OSGetMonitorResponse>(
        client,
        'GET',
        `/_plugins/_alerting/monitors/${monitorId}`
      );
      seqNo = getResp.body._seq_no;
      primaryTerm = getResp.body._primary_term;
      const current = this.mapMonitor(getResp.body._id, getResp.body.monitor);
      const { id: _id, ...currentFields } = current;
      const merged = { ...currentFields, ...input, last_update_time: Date.now() };

      // Use if_seq_no/if_primary_term for optimistic concurrency control
      let putPath = `/_plugins/_alerting/monitors/${monitorId}`;
      if (seqNo !== undefined && primaryTerm !== undefined) {
        putPath += `?if_seq_no=${seqNo}&if_primary_term=${primaryTerm}`;
      }

      const resp = await this.req<OSCreateMonitorResponse>(client, 'PUT', putPath, {
        ...merged,
        type: 'monitor',
      });
      return this.mapMonitor(resp.body._id, resp.body.monitor);
    } catch (err) {
      if (this.is404(err)) return null;
      throw err;
    }
  }

  async deleteMonitor(client: AlertingOSClient, monitorId: string): Promise<boolean> {
    try {
      await this.req(client, 'DELETE', `/_plugins/_alerting/monitors/${monitorId}`);
      return true;
    } catch (err) {
      if (this.is404(err)) return false;
      throw err;
    }
  }

  async runMonitor(
    client: AlertingOSClient,
    monitorId: string,
    dryRun?: boolean
  ): Promise<unknown> {
    const resp = await this.req<unknown>(
      client,
      'POST',
      `/_plugins/_alerting/monitors/${monitorId}/_execute`,
      {
        dryrun: dryRun ?? false,
      }
    );
    return resp.body;
  }

  async searchQuery(
    client: AlertingOSClient,
    indices: string[],
    body: Record<string, unknown>
  ): Promise<unknown> {
    const indexPattern = indices.join(',');
    const resp = await this.req<unknown>(client, 'POST', `/${indexPattern}/_search`, body);
    return resp.body;
  }

  // =========================================================================
  // Alerts
  // =========================================================================

  async getAlerts(client: AlertingOSClient): Promise<{ alerts: OSAlert[]; totalAlerts: number }> {
    const PAGE_SIZE = 100;
    const allAlerts: OSAlert[] = [];
    let startIndex = 0;
    let totalAlerts = 0;

    // Paginate through all alerts
    while (true) {
      const resp = await this.req<OSAlertsApiResponse>(
        client,
        'GET',
        `/_plugins/_alerting/monitors/alerts?size=${PAGE_SIZE}&startIndex=${startIndex}`
      );
      totalAlerts = resp.body.totalAlerts ?? 0;
      const alerts: OSAlert[] = (resp.body.alerts ?? []).map((a: OSAlertRaw) => this.mapAlert(a));
      allAlerts.push(...alerts);

      if (alerts.length < PAGE_SIZE || allAlerts.length >= totalAlerts) break;
      startIndex += PAGE_SIZE;
    }

    return { alerts: allAlerts, totalAlerts };
  }

  async acknowledgeAlerts(
    client: AlertingOSClient,
    monitorId: string,
    alertIds: string[]
  ): Promise<unknown> {
    const resp = await this.req<unknown>(
      client,
      'POST',
      `/_plugins/_alerting/monitors/${monitorId}/_acknowledge/alerts`,
      { alerts: alertIds }
    );
    return resp.body;
  }

  // =========================================================================
  // Destinations
  // =========================================================================

  async getDestinations(client: AlertingOSClient): Promise<OSDestination[]> {
    const resp = await this.req<OSDestinationsApiResponse>(
      client,
      'GET',
      '/_plugins/_alerting/destinations?size=200'
    );
    return (resp.body.destinations ?? []).map((d: OSDestinationRaw) => this.mapDestination(d));
  }

  async createDestination(
    client: AlertingOSClient,
    dest: Omit<OSDestination, 'id'>
  ): Promise<OSDestination> {
    const resp = await this.req<{ _id: string; destination: OSDestinationRaw }>(
      client,
      'POST',
      '/_plugins/_alerting/destinations',
      dest
    );
    return this.mapDestination({ id: resp.body._id, ...resp.body.destination });
  }

  async deleteDestination(client: AlertingOSClient, destId: string): Promise<boolean> {
    try {
      await this.req(client, 'DELETE', `/_plugins/_alerting/destinations/${destId}`);
      return true;
    } catch (err) {
      if (this.is404(err)) return false;
      throw err;
    }
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private async req<T = unknown>(
    client: AlertingOSClient,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<{ body: T }> {
    const resp = await client.transport.request({
      method,
      path,
      body: body || undefined,
    });
    return { body: resp.body as T };
  }

  private mapMonitor(id: string, source: OSMonitorSource): OSMonitor {
    return {
      id,
      type: (source.type as OSMonitor['type']) || 'monitor',
      monitor_type: (source.monitor_type as OSMonitor['monitor_type']) || 'query_level_monitor',
      name: source.name || '',
      enabled: source.enabled ?? true,
      schedule: source.schedule || { period: { interval: 5, unit: 'MINUTES' } },
      inputs: source.inputs || [],
      triggers: (source.triggers || []).map((t: OSRawTrigger) => this.mapTrigger(t)),
      last_update_time: source.last_update_time || Date.now(),
      schema_version: source.schema_version,
    };
  }

  private mapTrigger(t: OSRawTrigger): OSTrigger {
    // OpenSearch returns triggers in different formats depending on monitor_type
    // For query_level_monitor: { query_level_trigger: { ... } }
    // For bucket_level_monitor: { bucket_level_trigger: { ... } }
    // Normalize to flat trigger format
    const inner = (t.query_level_trigger ||
      t.bucket_level_trigger ||
      t.doc_level_trigger ||
      t) as OSRawTrigger;
    return {
      id: inner.id || '',
      name: inner.name || '',
      severity: String(inner.severity || '3') as OSTrigger['severity'],
      condition: {
        script: {
          source: inner.condition?.script?.source || '',
          lang: inner.condition?.script?.lang || 'painless',
        },
      },
      actions: (inner.actions || []).map((a: OSRawAction) => ({
        id: a.id || '',
        name: a.name || '',
        destination_id: a.destination_id || '',
        message_template: { source: a.message_template?.source || '' },
        subject_template: a.subject_template
          ? { source: a.subject_template.source || '' }
          : undefined,
        throttle_enabled: a.throttle_enabled ?? false,
        throttle: a.throttle as OSTrigger['actions'][0]['throttle'],
      })),
    };
  }

  private mapAlert(a: OSAlertRaw): OSAlert {
    return {
      id: a.id || a.alert_id || '',
      version: a.version ?? 1,
      monitor_id: a.monitor_id || '',
      monitor_name: a.monitor_name || '',
      monitor_version: a.monitor_version ?? 1,
      trigger_id: a.trigger_id || '',
      trigger_name: a.trigger_name || '',
      state: (a.state || 'ACTIVE') as OSAlert['state'],
      severity: String(a.severity || '3') as OSAlert['severity'],
      error_message: a.error_message || null,
      start_time: a.start_time || Date.now(),
      last_notification_time: a.last_notification_time || Date.now(),
      end_time: a.end_time || null,
      acknowledged_time: a.acknowledged_time || null,
      action_execution_results: (a.action_execution_results ||
        []) as OSAlert['action_execution_results'],
    };
  }

  private mapDestination(d: OSDestinationRaw): OSDestination {
    return {
      id: d.id || '',
      type: (d.type || 'custom_webhook') as OSDestination['type'],
      name: d.name || '',
      last_update_time: d.last_update_time || Date.now(),
      schema_version: d.schema_version,
      slack: d.slack,
      custom_webhook: d.custom_webhook,
      email: d.email,
    };
  }

  private is404(err: unknown): boolean {
    return isStatusCode(err, 404);
  }
}
