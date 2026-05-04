/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Monitor mutation service — OpenSearch Alerting plugin write path.
 *
 * Hosts the 4 write operations that survive Phase 5's route reduction:
 *   createMonitor, updateMonitor, deleteMonitor, acknowledgeAlerts.
 *
 * Previously these lived on `HttpOpenSearchBackend` (see
 * `opensearch_backend.ts`). They were absorbed here so the lean mutation
 * route file has a single, focused collaborator — the read-side and unified
 * aggregator code paths live on the client now (Phase 4 `AlertingOpenSearchService`
 * + `AlertingPromQLSearchService` + `AlertingPromResourcesService`).
 *
 * Every method takes `client: AlertingOSClient` so the caller (the OSD route
 * handler) controls MDS / workspace / scoped-client resolution.
 *
 * REST contract unchanged — the OpenSearch Alerting plugin's monitor write
 * endpoints remain the source of truth:
 *   https://opensearch.org/docs/latest/observing-your-data/alerting/api/
 */
import {
  AlertingOSClient,
  Logger,
  OSMonitor,
  OSCreateMonitorResponse,
  OSGetMonitorResponse,
  OSMonitorSource,
  OSTrigger,
  OSRawTrigger,
  OSRawAction,
} from '../../../common/types/alerting';
import { createConflictError, createInternalError, isStatusCode } from './errors';

export class MonitorMutationService {
  constructor(private readonly logger: Logger) {}

  // =========================================================================
  // Create
  // =========================================================================

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

  // =========================================================================
  // Update — optimistic concurrency via if_seq_no / if_primary_term
  // =========================================================================

  async updateMonitor(
    client: AlertingOSClient,
    monitorId: string,
    input: Partial<OSMonitor>
  ): Promise<OSMonitor | null> {
    // Fetch the current monitor with version info for optimistic concurrency.
    // Splitting the GET and PUT lets us distinguish a missing monitor (return
    // null) from a conflict on write (throw typed conflict).
    let getResp: { body: OSGetMonitorResponse };
    try {
      getResp = await this.req<OSGetMonitorResponse>(
        client,
        'GET',
        `/_plugins/_alerting/monitors/${monitorId}`
      );
    } catch (err) {
      if (isStatusCode(err, 404)) return null;
      throw err;
    }

    const seqNo = getResp.body._seq_no;
    const primaryTerm = getResp.body._primary_term;
    // Optimistic concurrency control requires both values. If either is
    // missing, fail hard rather than silently downgrade to a non-CAS write —
    // that would allow concurrent writers to clobber each other.
    if (seqNo === undefined || primaryTerm === undefined) {
      throw createInternalError(
        'OpenSearch Alerting GET monitor response missing _seq_no or _primary_term; refusing non-CAS update'
      );
    }

    const current = this.mapMonitor(getResp.body._id, getResp.body.monitor);
    const { id: _id, ...currentFields } = current;
    const merged = { ...currentFields, ...input, last_update_time: Date.now() };

    const putPath =
      `/_plugins/_alerting/monitors/${monitorId}` +
      `?if_seq_no=${seqNo}&if_primary_term=${primaryTerm}`;

    try {
      const resp = await this.req<OSCreateMonitorResponse>(client, 'PUT', putPath, {
        ...merged,
        type: 'monitor',
      });
      return this.mapMonitor(resp.body._id, resp.body.monitor);
    } catch (err) {
      if (isStatusCode(err, 404)) return null;
      if (isStatusCode(err, 409)) {
        throw createConflictError(
          `Monitor ${monitorId} was modified by another writer; re-fetch and retry`,
          monitorId
        );
      }
      throw err;
    }
  }

  // =========================================================================
  // Delete
  // =========================================================================

  async deleteMonitor(client: AlertingOSClient, monitorId: string): Promise<boolean> {
    try {
      await this.req(client, 'DELETE', `/_plugins/_alerting/monitors/${monitorId}`);
      return true;
    } catch (err) {
      if (isStatusCode(err, 404)) return false;
      throw err;
    }
  }

  // =========================================================================
  // Acknowledge alerts
  // =========================================================================

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
  // Helpers (duplicated minimally from HttpOpenSearchBackend — kept private
  // so the mutation service remains a self-contained module)
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

  /**
   * Map an OpenSearch Alerting plugin monitor document back into the
   * framework-agnostic `OSMonitor` shape. Same logic as
   * `HttpOpenSearchBackend.mapMonitor` — retained here so the mutation service
   * doesn't depend on the read-side backend.
   */
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
    // OpenSearch returns triggers in different formats depending on monitor_type:
    //   query_level_monitor  → { query_level_trigger: { ... } }
    //   bucket_level_monitor → { bucket_level_trigger: { ... } }
    //   doc_level_monitor    → { doc_level_trigger: { ... } }
    // Normalize to flat trigger format so the domain shape stays stable.
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
}
