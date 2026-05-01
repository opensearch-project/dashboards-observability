/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Route handlers — pure functions that work with any HTTP framework.
 * Exposes backend-native API shapes + unified views.
 *
 * Post-Phase-3: datasource CRUD handlers and their helpers were removed —
 * datasource discovery + mutation moved to the client via saved-object
 * services (`useDatasources`, `SavedObjectDatasourceService`).
 */
import type { AlertingOSClient, OSMonitor } from '../../../common/types/alerting';
import { MultiBackendAlertService } from '../../services/alerting';
import { toHandlerResult } from './route_utils';
import type { HandlerResult } from './route_utils';

// ============================================================================
// OpenSearch Monitor Handlers
// ============================================================================

export async function handleGetOSMonitors(
  alertSvc: MultiBackendAlertService,
  client: AlertingOSClient,
  dsId: string
): Promise<HandlerResult> {
  try {
    return { status: 200, body: { monitors: await alertSvc.getOSMonitors(client, dsId) } };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

export async function handleGetOSMonitor(
  alertSvc: MultiBackendAlertService,
  client: AlertingOSClient,
  dsId: string,
  monitorId: string
): Promise<HandlerResult> {
  try {
    const m = await alertSvc.getOSMonitor(client, dsId, monitorId);
    if (!m) return { status: 404, body: { error: 'Monitor not found' } };
    return { status: 200, body: m };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

export async function handleCreateOSMonitor(
  alertSvc: MultiBackendAlertService,
  client: AlertingOSClient,
  dsId: string,
  body: Omit<OSMonitor, 'id'>
): Promise<HandlerResult> {
  try {
    return { status: 201, body: await alertSvc.createOSMonitor(client, dsId, body) };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

export async function handleUpdateOSMonitor(
  alertSvc: MultiBackendAlertService,
  client: AlertingOSClient,
  dsId: string,
  monitorId: string,
  body: Partial<OSMonitor>
): Promise<HandlerResult> {
  try {
    const m = await alertSvc.updateOSMonitor(client, dsId, monitorId, body);
    if (!m) return { status: 404, body: { error: 'Monitor not found' } };
    return { status: 200, body: m };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

export async function handleDeleteOSMonitor(
  alertSvc: MultiBackendAlertService,
  client: AlertingOSClient,
  dsId: string,
  monitorId: string
): Promise<HandlerResult> {
  try {
    const ok = await alertSvc.deleteOSMonitor(client, dsId, monitorId);
    if (!ok) return { status: 404, body: { error: 'Monitor not found' } };
    return { status: 200, body: { deleted: true } };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

// ============================================================================
// OpenSearch Alert Handlers
// ============================================================================

export async function handleGetOSAlerts(
  alertSvc: MultiBackendAlertService,
  client: AlertingOSClient,
  dsId: string
): Promise<HandlerResult> {
  try {
    return { status: 200, body: await alertSvc.getOSAlerts(client, dsId) };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

export async function handleAcknowledgeOSAlerts(
  alertSvc: MultiBackendAlertService,
  client: AlertingOSClient,
  dsId: string,
  monitorId: string,
  body: { alerts?: string[] }
): Promise<HandlerResult> {
  try {
    return {
      status: 200,
      body: {
        result: await alertSvc.acknowledgeOSAlerts(client, dsId, monitorId, body.alerts || []),
      },
    };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

// ============================================================================
// Prometheus Handlers
// ============================================================================

export async function handleGetPromRuleGroups(
  alertSvc: MultiBackendAlertService,
  client: AlertingOSClient,
  dsId: string
): Promise<HandlerResult> {
  try {
    const groups = await alertSvc.getPromRuleGroups(client, dsId);
    return { status: 200, body: { status: 'success', data: { groups } } };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

export async function handleGetPromAlerts(
  alertSvc: MultiBackendAlertService,
  client: AlertingOSClient,
  dsId: string
): Promise<HandlerResult> {
  try {
    const alerts = await alertSvc.getPromAlerts(client, dsId);
    return { status: 200, body: { status: 'success', data: { alerts } } };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

// ============================================================================
// Unified View Handlers (cross-backend, parallel with per-datasource status)
// ============================================================================

export async function handleGetUnifiedAlerts(
  alertSvc: MultiBackendAlertService,
  clientResolver: (dsId: string) => Promise<AlertingOSClient>,
  query?: { dsIds?: string; timeout?: string; maxResults?: string }
): Promise<HandlerResult> {
  try {
    const dsIds = query?.dsIds ? query.dsIds.split(',').filter(Boolean) : undefined;
    const rawTimeout = query?.timeout ? parseInt(query.timeout, 10) : undefined;
    const timeoutMs =
      rawTimeout !== undefined && Number.isFinite(rawTimeout) ? rawTimeout : undefined;
    const rawMaxResults = query?.maxResults ? parseInt(query.maxResults, 10) : undefined;
    const maxResults =
      rawMaxResults !== undefined && Number.isFinite(rawMaxResults) ? rawMaxResults : undefined;
    const response = await alertSvc.getUnifiedAlerts(clientResolver, {
      dsIds,
      timeoutMs,
      maxResults,
    });
    return { status: 200, body: response };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

export async function handleGetUnifiedRules(
  alertSvc: MultiBackendAlertService,
  clientResolver: (dsId: string) => Promise<AlertingOSClient>,
  query?: { dsIds?: string; timeout?: string; maxResults?: string }
): Promise<HandlerResult> {
  try {
    const dsIds = query?.dsIds ? query.dsIds.split(',').filter(Boolean) : undefined;
    const rawTimeout = query?.timeout ? parseInt(query.timeout, 10) : undefined;
    const timeoutMs =
      rawTimeout !== undefined && Number.isFinite(rawTimeout) ? rawTimeout : undefined;
    const rawMaxResults = query?.maxResults ? parseInt(query.maxResults, 10) : undefined;
    const maxResults =
      rawMaxResults !== undefined && Number.isFinite(rawMaxResults) ? rawMaxResults : undefined;
    const response = await alertSvc.getUnifiedRules(clientResolver, {
      dsIds,
      timeoutMs,
      maxResults,
    });
    return { status: 200, body: response };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

// ============================================================================
// Detail View Handlers (on-demand, loaded when user opens flyout)
// ============================================================================

export async function handleGetRuleDetail(
  alertSvc: MultiBackendAlertService,
  client: AlertingOSClient,
  dsId: string,
  ruleId: string
): Promise<HandlerResult> {
  try {
    const rule = await alertSvc.getRuleDetail(client, dsId, ruleId);
    if (!rule) return { status: 404, body: { error: 'Rule not found' } };
    return { status: 200, body: rule };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}

export async function handleGetAlertDetail(
  alertSvc: MultiBackendAlertService,
  client: AlertingOSClient,
  dsId: string,
  alertId: string
): Promise<HandlerResult> {
  try {
    const alert = await alertSvc.getAlertDetail(client, dsId, alertId);
    if (!alert) return { status: 404, body: { error: 'Alert not found' } };
    return { status: 200, body: alert };
  } catch (e: unknown) {
    return toHandlerResult(e);
  }
}
