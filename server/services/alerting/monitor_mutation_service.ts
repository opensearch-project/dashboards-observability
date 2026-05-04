/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Monitor mutation service — OpenSearch Alerting plugin write path.
 *
 * Hosts the 4 write operations used by `server/routes/alerting/mutations/`:
 *   createMonitor, updateMonitor, deleteMonitor, acknowledgeAlerts.
 *
 * Implementation detail: this class is a **thin delegate** to
 * `HttpOpenSearchBackend`. Prior versions duplicated the implementation
 * (mapMonitor/mapTrigger/req/is404 verbatim) across both modules, which
 * meant the same bug had to be fixed twice. The backend is stateless and
 * can be shared across requests, so passing it into the constructor is safe.
 *
 * REST contract unchanged — the OpenSearch Alerting plugin's monitor write
 * endpoints remain the source of truth:
 *   https://opensearch.org/docs/latest/observing-your-data/alerting/api/
 */
import type { AlertingOSClient, Logger, OSMonitor } from '../../../common/types/alerting';
import type { HttpOpenSearchBackend } from './opensearch_backend';

export class MonitorMutationService {
  constructor(private readonly backend: HttpOpenSearchBackend, private readonly logger: Logger) {}

  async createMonitor(
    client: AlertingOSClient,
    monitor: Omit<OSMonitor, 'id'>
  ): Promise<OSMonitor> {
    return this.backend.createMonitor(client, monitor);
  }

  /**
   * Update a monitor. Delegates to `HttpOpenSearchBackend.updateMonitor`,
   * which handles the split GET/PUT + typed `ConflictError` on 409 +
   * `InternalError` on missing `_seq_no`/`_primary_term`.
   */
  async updateMonitor(
    client: AlertingOSClient,
    monitorId: string,
    input: Partial<OSMonitor>
  ): Promise<OSMonitor | null> {
    return this.backend.updateMonitor(client, monitorId, input);
  }

  async deleteMonitor(client: AlertingOSClient, monitorId: string): Promise<boolean> {
    return this.backend.deleteMonitor(client, monitorId);
  }

  async acknowledgeAlerts(
    client: AlertingOSClient,
    monitorId: string,
    alertIds: string[]
  ): Promise<unknown> {
    return this.backend.acknowledgeAlerts(client, monitorId, alertIds);
  }
}
