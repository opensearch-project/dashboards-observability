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
    monitorId?: string
  ): Promise<AcknowledgeAlertResponse> {
    return (await this.requireHttp().post(
      `/api/alerting/alerts/${encodeURIComponent(alertId)}/acknowledge`,
      {
        body: JSON.stringify({
          ...(datasourceId ? { datasourceId } : {}),
          ...(monitorId ? { monitorId } : {}),
        }),
      }
    )) as AcknowledgeAlertResponse;
  }
}
