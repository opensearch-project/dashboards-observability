/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Prometheus rule mutation handlers. Creates, updates, and deletes alerting
 * rules via the Prometheus ruler API (through the DirectQueryRulerClient).
 *
 * Route registrations live in `prometheus_routes.ts`; this file is pure
 * handler logic, testable in isolation.
 */
import type { AlertingOSClient, Datasource, Logger } from '../../../../common/types/alerting';
import type { GeneratedRule, GeneratedRuleGroup } from '../../../../common/slo/slo_types';
import type { RulerClient } from '../../../services/slo/ruler_client';
import { createConflictError } from '../../../services/alerting/errors';

/** The namespace under which user-created alerting rules are stored in the ruler. */
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
  /**
   * When false (default), a create that collides with an existing same-named
   * rule in the target group is rejected (409) rather than silently replacing
   * it. Edit flows that intend to replace pass `true`.
   */
  overwrite?: boolean;
}

/**
 * Converts a form payload into a GeneratedRuleGroup suitable for the
 * Prometheus ruler upsert API.
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
  // Rules created through this route always live in the single user namespace.
  // The namespace is intentionally NOT client-controllable: exposing it would
  // let any caller of this route read/merge/overwrite rule groups in other
  // namespaces of the same ruler (e.g. SLO or recording-rule groups). Pinning
  // it here keeps this route scoped to user-authored alerting rules.
  const namespace = USER_RULES_NAMESPACE;

  // Rule groups are shared: multiple rules may live in the same group, and
  // the ruler's POST is create-or-replace on (namespace, groupName). Merge with
  // the existing group so sibling rules are preserved — the new rule replaces
  // any same-named rule, others are kept.
  //
  // NOTE: this read-modify-write is not atomic. The ruler API offers
  // no compare-and-swap, so two concurrent writers targeting the same group
  // can still lose an update (the second upsert wins). This protects against
  // the common single-writer clobber; true concurrent safety would need
  // server-side coordination in the ruler itself.
  const existing = await rulerClient.getRuleGroup(client, datasource, namespace, group.groupName);
  if (existing && existing.rules.length > 0) {
    // Guard against silently clobbering an existing same-named rule. A create
    // (overwrite=false) that collides is a conflict; only an explicit edit
    // (overwrite=true) may replace. This is the primary protection for the
    // Metrics-page create flow, which has no client-side duplicate check.
    if (!payload.overwrite && existing.rules.some((r) => r.name === payload.name)) {
      throw createConflictError(
        `A rule named "${payload.name}" already exists in group "${group.groupName}". ` +
          `Choose a different rule name or group.`,
        payload.name
      );
    }
    const siblings = existing.rules.filter((r) => r.name !== payload.name);
    group.rules = [...siblings, ...group.rules];
    // The evaluation interval is a group-level property shared by all rules.
    // Preserve the existing group's interval — adding one rule should not
    // silently change when every sibling is evaluated.
    if (existing.interval) {
      group.interval = existing.interval;
    }
  }

  await rulerClient.upsertRuleGroup(client, datasource, namespace, group);
  logger?.info(
    `alerting: createPrometheusRule success — ds=${datasource.id} ns=${namespace} group=${group.groupName} rules=${group.rules.length}`
  );
  return { success: true, groupName: group.groupName, namespace };
}

export async function handleDeletePrometheusRule(
  rulerClient: RulerClient,
  client: AlertingOSClient,
  datasource: Datasource,
  groupName: string,
  logger?: Logger,
  ruleName?: string
): Promise<{ success: boolean }> {
  // Deletes are pinned to the single user namespace — not client-controllable,
  // so this route can never delete rule groups in other namespaces of the same
  // ruler (e.g. SLO groups). Mirrors the create handler.
  const namespace = USER_RULES_NAMESPACE;
  // When a ruleName is provided, splice just that rule out of the group so
  // sibling rules in a shared group are preserved. The whole group is only
  // deleted when it would become empty (or no ruleName was given).
  // Same non-atomicity caveat as the create-merge above: no CAS on the
  // ruler, so concurrent writers to one group can race.
  if (ruleName) {
    const existing = await rulerClient.getRuleGroup(client, datasource, namespace, groupName);
    if (existing) {
      const remaining = existing.rules.filter((r) => r.name !== ruleName);
      if (remaining.length > 0) {
        await rulerClient.upsertRuleGroup(client, datasource, namespace, {
          ...existing,
          rules: remaining,
        });
        logger?.info(
          `alerting: deletePrometheusRule spliced rule=${ruleName} from group=${groupName} — ds=${datasource.id} ns=${namespace} remaining=${remaining.length}`
        );
        return { success: true };
      }
    }
  }
  await rulerClient.deleteRuleGroup(client, datasource, namespace, groupName);
  logger?.info(
    `alerting: deletePrometheusRule success — ds=${datasource.id} ns=${namespace} group=${groupName}`
  );
  return { success: true };
}
