/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * "Successful response, unusable state" cases. Some surfaces return HTTP 200
 * with a state enum that still means something is wrong for the user — a
 * missing rule group, or a routing backend that reported no usable status.
 * These aren't thrown errors, but they should speak the same user-facing
 * language as the error layer.
 *
 * We model them as synthetic `upstreamCode`s ('STATE_*') routed through the
 * same `classifyError` pipeline, so wording, categories, and adapters are
 * shared. Callers use the thin helpers below rather than constructing contexts
 * by hand.
 */

import { classifyError } from '../registry';
import { ErrorCode } from '../messages';
import type { ClassifiedError, ClassifierResult, ErrorClassifier, RawErrorContext } from '../types';

const STATE_CODE_MAP: Record<
  string,
  { category: ClassifierResult['category']; code: string; retryable: boolean }
> = {
  STATE_RULES_MISSING: {
    category: 'PARTIAL_STATE',
    code: ErrorCode.RULES_MISSING,
    retryable: false,
  },
  STATE_RULES_PARTIAL: {
    category: 'PARTIAL_STATE',
    code: ErrorCode.RULES_PARTIAL,
    retryable: false,
  },
  STATE_RULER_UNREACHABLE: {
    category: 'UPSTREAM_UNAVAILABLE',
    code: ErrorCode.RULE_HEALTH_UNAVAILABLE,
    retryable: true,
  },
  STATE_ROUTING_UNKNOWN: {
    category: 'PARTIAL_STATE',
    code: ErrorCode.ROUTING_STATE_UNKNOWN,
    retryable: false,
  },
};

export const stateClassifier: ErrorClassifier = {
  name: 'core.state',
  priority: 90,
  match: (ctx) => typeof ctx.upstreamCode === 'string' && ctx.upstreamCode in STATE_CODE_MAP,
  classify: (ctx): ClassifierResult => {
    const mapped = STATE_CODE_MAP[ctx.upstreamCode as string];
    return {
      category: mapped.category,
      code: mapped.code,
      retryable: mapped.retryable,
    };
  },
};

const RULE_HEALTH_STATE_TO_CODE: Record<string, string> = {
  rules_missing: 'STATE_RULES_MISSING',
  rules_partial: 'STATE_RULES_PARTIAL',
  ruler_unreachable: 'STATE_RULER_UNREACHABLE',
};

/**
 * Classify a rule-health `state` enum. Returns null for healthy/unknown states
 * ('ok' or anything not recognized as a problem) so callers can skip surfacing.
 */
export function classifyRuleHealthState(
  state: string,
  ctx: Partial<RawErrorContext> = {}
): ClassifiedError | null {
  const upstreamCode = RULE_HEALTH_STATE_TO_CODE[state];
  if (!upstreamCode) return null;
  return classifyError({ operation: 'slo.rule_health', ...ctx, upstreamCode });
}

/**
 * Recognized routing/alertmanager cluster states that are NOT errors: 'ready'
 * (healthy) and 'settling' (valid transient — starting up / gossip in
 * progress). Callers surface these as their literal status rather than a
 * partial-state error.
 */
const NON_ERROR_ROUTING_STATES: ReadonlySet<string> = new Set(['ready', 'settling']);

/**
 * Classify a routing/alertmanager cluster status string. Returns null for a
 * recognized non-error state (so the caller shows the literal status); anything
 * else — including 'unknown' or '' — surfaces as a partial/unknown routing
 * state instead of the literal word.
 */
export function classifyRoutingStatus(
  status: string | undefined,
  ctx: Partial<RawErrorContext> = {}
): ClassifiedError | null {
  if (status && NON_ERROR_ROUTING_STATES.has(status)) return null;
  return classifyError({
    operation: 'routing.config',
    ...ctx,
    upstreamCode: 'STATE_ROUTING_UNKNOWN',
  });
}
