/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Framework-agnostic mutation handlers for the 4 surviving OpenSearch
 * monitor/alert write routes. Each handler returns `{ status, body }` so it
 * stays testable in isolation from the OSD router.
 *
 * Extracted from the pre-Phase-5 `server/routes/alerting/handlers.ts` during
 * the route-reduction pass. The rest of that file — datasource / list / read
 * / unified / detail handlers — now lives on the client (Phase 4 query
 * services) and was deleted.
 */
import type { AlertingOSClient, OSMonitor } from '../../../../common/types/alerting';
import { MonitorMutationService } from '../../../services/alerting/monitor_mutation_service';
import { toHandlerResult } from '../route_utils';
import type { HandlerResult } from '../route_utils';

// ============================================================================
// Create monitor
// ============================================================================

export async function handleCreateOSMonitor(
  mutationSvc: MonitorMutationService,
  client: AlertingOSClient,
  body: Omit<OSMonitor, 'id'>
): Promise<HandlerResult> {
  try {
    return { status: 201, body: await mutationSvc.createMonitor(client, body) };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

// ============================================================================
// Update monitor
// ============================================================================

export async function handleUpdateOSMonitor(
  mutationSvc: MonitorMutationService,
  client: AlertingOSClient,
  monitorId: string,
  body: Partial<OSMonitor>
): Promise<HandlerResult> {
  try {
    const m = await mutationSvc.updateMonitor(client, monitorId, body);
    if (!m) return { status: 404, body: { error: 'Monitor not found' } };
    return { status: 200, body: m };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

// ============================================================================
// Delete monitor
// ============================================================================

export async function handleDeleteOSMonitor(
  mutationSvc: MonitorMutationService,
  client: AlertingOSClient,
  monitorId: string
): Promise<HandlerResult> {
  try {
    const ok = await mutationSvc.deleteMonitor(client, monitorId);
    if (!ok) return { status: 404, body: { error: 'Monitor not found' } };
    return { status: 200, body: { deleted: true } };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

// ============================================================================
// Acknowledge alerts
// ============================================================================

export async function handleAcknowledgeOSAlerts(
  mutationSvc: MonitorMutationService,
  client: AlertingOSClient,
  monitorId: string,
  body: { alerts?: string[] }
): Promise<HandlerResult> {
  try {
    return {
      status: 200,
      body: {
        result: await mutationSvc.acknowledgeAlerts(client, monitorId, body.alerts || []),
      },
    };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}
