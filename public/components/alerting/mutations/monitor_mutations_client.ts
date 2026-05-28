/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MonitorMutationsClient — thin HTTP wrapper around the surviving mutation
 * routes. Mutations do not have a query-enhancements equivalent, so these
 * stay as custom routes under `/api/alerting/mutations/*`; registration is
 * gated on `observabilityConfig.alertManager.enabled`.
 *
 * Replaces the mutation surface of the deleted `alarms_client.ts`.
 */
import { coreRefs } from '../../../framework/core_refs';

export interface MonitorResponse {
  id: string;
  monitor: Record<string, unknown>;
  message: string;
}

export interface MonitorDeleteResponse {
  id: string;
  deleted: boolean;
}

export interface AcknowledgeAlertResponse {
  id: string;
  acknowledged: boolean;
}

export class MonitorMutationsClient {
  private requireHttp() {
    const http = coreRefs.http;
    if (!http) throw new Error('HTTP client not available');
    return http;
  }

  async createMonitor(data: Record<string, unknown>, dsId: string): Promise<MonitorResponse> {
    return (await this.requireHttp().post(
      `/api/alerting/opensearch/${encodeURIComponent(dsId)}/monitors`,
      { body: JSON.stringify(data) }
    )) as MonitorResponse;
  }

  async updateMonitor(
    id: string,
    data: Record<string, unknown>,
    dsId: string
  ): Promise<MonitorResponse> {
    return (await this.requireHttp().put(
      `/api/alerting/opensearch/${encodeURIComponent(dsId)}/monitors/${encodeURIComponent(id)}`,
      { body: JSON.stringify(data) }
    )) as MonitorResponse;
  }

  async deleteMonitor(id: string, dsId: string): Promise<MonitorDeleteResponse> {
    return (await this.requireHttp().delete(
      `/api/alerting/opensearch/${encodeURIComponent(dsId)}/monitors/${encodeURIComponent(id)}`
    )) as MonitorDeleteResponse;
  }

  async acknowledgeAlert(
    alertId: string,
    datasourceId?: string,
    monitorId?: string,
    options?: { timeoutMs?: number }
  ): Promise<AcknowledgeAlertResponse> {
    if (!datasourceId || !monitorId || !alertId) {
      throw new Error('datasourceId, monitorId, and alertId are required to acknowledge an alert');
    }
    // Per-request timeout. The upstream `TransportAcknowledgeAlertAction` is
    // currently known to hang indefinitely against a vanilla cluster (see PR
    // description, callout #5). Without a client-side timeout the toast and
    // confirmation flow would never resolve, freezing the UI. 30s is a
    // generous bound — typical successful acks complete in well under 1s.
    const timeoutMs = options?.timeoutMs ?? ACKNOWLEDGE_TIMEOUT_MS;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return (await this.requireHttp().post(
        `/api/alerting/opensearch/${encodeURIComponent(datasourceId)}/monitors/${encodeURIComponent(
          monitorId
        )}/acknowledge`,
        {
          body: JSON.stringify({ alerts: [alertId] }),
          signal: ctrl.signal,
        }
      )) as AcknowledgeAlertResponse;
    } catch (err) {
      // Translate AbortError into a stable, user-meaningful message so toast
      // copy doesn't leak `AbortError: The user aborted a request`.
      if (
        ctrl.signal.aborted ||
        (err instanceof Error && (err.name === 'AbortError' || err.message?.includes('aborted')))
      ) {
        throw new Error(`Acknowledge request timed out after ${timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

const ACKNOWLEDGE_TIMEOUT_MS = 30_000;
