/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Prometheus rule mutation handlers. Creates, updates, and deletes alerting
 * rules via the Cortex ruler API (through the DirectQueryRulerClient).
 *
 * Route registrations live in `prometheus_routes.ts`; this file is pure
 * handler logic, testable in isolation.
 */
import type { AlertingOSClient, Datasource, Logger } from '../../../../common/types/alerting';
import type { GeneratedRule, GeneratedRuleGroup } from '../../../../common/slo/slo_types';
import type { RulerClient } from '../../../services/slo/ruler_client';

/** The namespace under which user-created alerting rules are stored in Cortex. */
export const USER_RULES_NAMESPACE = 'observability-alerting';

export interface PrometheusRulePayload {
  name: string;
  query: string;
  operator: string;
  threshold: number;
  forDuration: string;
  evaluationInterval: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  enabled: boolean;
  /** Optional group name override. Defaults to the rule name. */
  groupName?: string;
}

/**
 * Converts a form payload into a GeneratedRuleGroup suitable for the
 * Cortex ruler upsert API.
 */
export function buildRuleGroup(payload: PrometheusRulePayload): GeneratedRuleGroup {
  const expr = `${payload.query} ${payload.operator} ${payload.threshold}`;
  const rule: GeneratedRule = {
    type: 'alerting',
    name: payload.name,
    expr,
    for: payload.forDuration,
    labels: payload.labels,
    annotations: payload.annotations,
    description: payload.annotations.description || payload.annotations.summary || '',
  };

  const intervalSeconds = parseDurationToSeconds(payload.evaluationInterval);
  const groupName = payload.groupName || payload.name;

  return {
    groupName,
    interval: intervalSeconds,
    rules: [rule],
  };
}

function parseDurationToSeconds(dur: string): number {
  const match = dur.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 60;
  const val = parseInt(match[1], 10);
  switch (match[2]) {
    case 's':
      return val;
    case 'm':
      return val * 60;
    case 'h':
      return val * 3600;
    case 'd':
      return val * 86400;
    default:
      return 60;
  }
}

export async function handleCreatePrometheusRule(
  rulerClient: RulerClient,
  client: AlertingOSClient,
  datasource: Datasource,
  payload: PrometheusRulePayload,
  logger?: Logger
): Promise<{ success: boolean; groupName: string; namespace: string }> {
  const group = buildRuleGroup(payload);
  await rulerClient.upsertRuleGroup(client, datasource, USER_RULES_NAMESPACE, group);
  logger?.info(
    `alerting: createPrometheusRule success — ds=${datasource.id} group=${group.groupName}`
  );
  return { success: true, groupName: group.groupName, namespace: USER_RULES_NAMESPACE };
}

export async function handleDeletePrometheusRule(
  rulerClient: RulerClient,
  client: AlertingOSClient,
  datasource: Datasource,
  groupName: string,
  logger?: Logger
): Promise<{ success: boolean }> {
  await rulerClient.deleteRuleGroup(client, datasource, USER_RULES_NAMESPACE, groupName);
  logger?.info(`alerting: deletePrometheusRule success — ds=${datasource.id} group=${groupName}`);
  return { success: true };
}
