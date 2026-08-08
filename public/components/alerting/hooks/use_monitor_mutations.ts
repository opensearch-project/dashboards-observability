/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * use_monitor_mutations — provides mutation functions for monitors + alerts.
 * Returns memoized callables; consumers `await` them directly in event
 * handlers (no built-in loading state — mutations are fire-and-forget from
 * the caller's perspective and trigger a list refetch via `refreshToken`).
 */
import { useMemo } from 'react';
import { MonitorMutationsClient } from '../mutations/monitor_mutations_client';
import type {
  AcknowledgeAlertResponse,
  MonitorDeleteResponse,
  MonitorResponse,
  PrometheusRuleResponse,
} from '../mutations/monitor_mutations_client';

export interface UseMonitorMutationsResult {
  createMonitor: (data: Record<string, unknown>, dsId: string) => Promise<MonitorResponse>;
  updateMonitor: (
    id: string,
    data: Record<string, unknown>,
    dsId: string
  ) => Promise<MonitorResponse>;
  deleteMonitor: (id: string, dsId: string) => Promise<MonitorDeleteResponse>;
  createPrometheusRule: (
    data: Record<string, unknown>,
    dsId: string
  ) => Promise<PrometheusRuleResponse>;
  deletePrometheusRule: (
    dsId: string,
    groupName: string,
    ruleName?: string
  ) => Promise<{ success: boolean }>;
  acknowledgeAlert: (
    alertId: string,
    datasourceId?: string,
    monitorId?: string
  ) => Promise<AcknowledgeAlertResponse>;
}

export function useMonitorMutations(): UseMonitorMutationsResult {
  const client = useMemo(() => new MonitorMutationsClient(), []);
  return useMemo<UseMonitorMutationsResult>(
    () => ({
      createMonitor: (data, dsId) => client.createMonitor(data, dsId),
      updateMonitor: (id, data, dsId) => client.updateMonitor(id, data, dsId),
      deleteMonitor: (id, dsId) => client.deleteMonitor(id, dsId),
      createPrometheusRule: (data, dsId) => client.createPrometheusRule(data, dsId),
      deletePrometheusRule: (dsId, groupName, ruleName) =>
        client.deletePrometheusRule(dsId, groupName, ruleName),
      acknowledgeAlert: (alertId, datasourceId, monitorId) =>
        client.acknowledgeAlert(alertId, datasourceId, monitorId),
    }),
    [client]
  );
}
