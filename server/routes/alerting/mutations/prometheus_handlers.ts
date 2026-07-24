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
  /**
   * Optional comparison appended to the query. When omitted, the PromQL
   * query itself is the complete alert expression.
   */
  operator?: string;
  threshold?: number;
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
  // The query alone is the alert expression unless a legacy operator/threshold
  // pair is provided (kept for backward compatibility with older clients).
  const expr =
    payload.operator !== undefined && payload.threshold !== undefined
      ? `${payload.query} ${payload.operator} ${payload.threshold}`
      : payload.query;
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

  // Rule groups are shared: multiple rules may live in the same group, and
  // Cortex's POST is create-or-replace on (namespace, groupName). Merge with
  // the existing group so sibling rules are preserved — the new rule replaces
  // any same-named rule, others are kept.
  const existing = await rulerClient.getRuleGroup(
    client,
    datasource,
    USER_RULES_NAMESPACE,
    group.groupName
  );
  if (existing && existing.rules.length > 0) {
    const siblings = existing.rules.filter((r) => r.name !== payload.name);
    group.rules = [...siblings, ...group.rules];
  }

  await rulerClient.upsertRuleGroup(client, datasource, USER_RULES_NAMESPACE, group);
  logger?.info(
    `alerting: createPrometheusRule success — ds=${datasource.id} group=${group.groupName} rules=${group.rules.length}`
  );
  return { success: true, groupName: group.groupName, namespace: USER_RULES_NAMESPACE };
}

export async function handleDeletePrometheusRule(
  rulerClient: RulerClient,
  client: AlertingOSClient,
  datasource: Datasource,
  groupName: string,
  logger?: Logger,
  ruleName?: string
): Promise<{ success: boolean }> {
  // When a ruleName is provided, splice just that rule out of the group so
  // sibling rules in a shared group are preserved. The whole group is only
  // deleted when it would become empty (or no ruleName was given).
  if (ruleName) {
    const existing = await rulerClient.getRuleGroup(
      client,
      datasource,
      USER_RULES_NAMESPACE,
      groupName
    );
    if (existing) {
      const remaining = existing.rules.filter((r) => r.name !== ruleName);
      if (remaining.length > 0) {
        await rulerClient.upsertRuleGroup(client, datasource, USER_RULES_NAMESPACE, {
          ...existing,
          rules: remaining,
        });
        logger?.info(
          `alerting: deletePrometheusRule spliced rule=${ruleName} from group=${groupName} — ds=${datasource.id} remaining=${remaining.length}`
        );
        return { success: true };
      }
    }
  }
  await rulerClient.deleteRuleGroup(client, datasource, USER_RULES_NAMESPACE, groupName);
  logger?.info(`alerting: deletePrometheusRule success — ds=${datasource.id} group=${groupName}`);
  return { success: true };
}
