/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Deterministic fingerprint of an SLO's SLI definition + the objective
 * fields that materially affect the generated recording rule. Two SLOs that
 * produce identical recording-rule PromQL must produce identical fingerprints;
 * two SLOs that differ in any way that would affect what Cortex evaluates
 * must produce different fingerprints.
 *
 * Output: 16-char lowercase hex (first 8 bytes of sha256). Chosen for
 * portability (any sha256 lib gives the same hex) and because 8 bytes is
 * more than enough entropy for a single-workspace registry. The
 * `FINGERPRINT_VERSION` string is prepended to the hash input so a future
 * bump forces a new value and the registry can coexist with legacy entries.
 *
 * Null paths — returns `null`:
 *   - composite SLI (`sli.type === 'composite'`)
 *   - OpenSearch backend (`sli.definition.backend === 'opensearch'`)
 *
 * This module is pure. No I/O, no clock, no logging.
 */

import { createHash } from 'crypto';
import type { Dimension, Objective, SliNode, CustomPromQLExpr } from './slo_types';
import { formatLatencyBoundLe } from './slo_promql_generator';

export const FINGERPRINT_VERSION = 'v1';

/**
 * Compute the fingerprint. Returns `null` for SLI shapes we don't dedup on
 * (composite, OpenSearch).
 */
export function computeSliFingerprint(
  datasourceId: string,
  sli: SliNode,
  objective: Objective
): string | null {
  if (sli.type !== 'single') return null;
  if (sli.definition.backend !== 'prometheus') return null;

  const prom = sli.definition;
  const input = canonicalize({
    fingerprintVersion: FINGERPRINT_VERSION,
    datasourceId,
    backend: prom.backend,
    type: prom.type,
    calcMethod: prom.calcMethod,
    metric: normalizeMetric(prom.metric),
    goodEventsFilter: normalizeGoodEventsFilter(prom.goodEventsFilter),
    latencyThresholdUnit:
      prom.type === 'latency_threshold' ? prom.latencyThresholdUnit ?? null : null,
    // Hash the *formatted* latency bound (the same `le=` string the
    // recording-rule generator emits) rather than the raw number. Two
    // semantically identical thresholds that differ only in float
    // representation (e.g. `0.1+0.2` vs `0.3`) would otherwise fingerprint
    // differently and defeat shared-recording-group dedup.
    latencyThreshold:
      prom.type === 'latency_threshold' && typeof objective.latencyThreshold === 'number'
        ? formatLatencyBoundLe(objective.latencyThreshold, prom.latencyThresholdUnit ?? 'seconds')
        : null,
    periodLength: prom.periodLength ?? null,
    customExpr: normalizeCustomExpr(prom.customExpr),
    dimensions: normalizeDimensions(sli.dimensions),
  });

  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

// ============================================================================
// Normalization helpers
// ============================================================================

function normalizeMetric(metric: string | undefined): string | null {
  if (metric === undefined || metric === null) return null;
  const trimmed = metric.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Trim, collapse whitespace runs *outside PromQL string literals* to a single
 * space, then strip a single pair of wrapping `{` / `}` if the entire trimmed
 * string is wrapped. Inner braces are preserved.
 *
 * Whitespace inside double-quoted matcher values (e.g. `status=" 5xx "`) is
 * preserved verbatim — it changes which series the matcher selects, so two
 * filters that differ only in literal whitespace must fingerprint differently.
 */
function normalizeGoodEventsFilter(filter: string | undefined): string | null {
  if (filter === undefined || filter === null) return null;
  const collapsed = collapseWhitespaceOutsideLiterals(filter.trim());
  if (collapsed.length === 0) return null;
  if (collapsed.startsWith('{') && collapsed.endsWith('}')) {
    const inner = collapseWhitespaceOutsideLiterals(collapsed.slice(1, -1).trim());
    return inner.length === 0 ? null : inner;
  }
  return collapsed;
}

/**
 * Collapse whitespace runs only outside double-quoted string literals.
 * PromQL matcher values use double quotes with `\"` escapes; backslashes
 * inside the literal escape the next character. Anything outside a literal
 * is plain syntax and safe to collapse.
 */
function collapseWhitespaceOutsideLiterals(input: string): string {
  let out = '';
  let inLiteral = false;
  let lastWasSpaceOutside = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inLiteral) {
      out += ch;
      if (ch === '\\' && i + 1 < input.length) {
        out += input[i + 1];
        i++;
      } else if (ch === '"') {
        inLiteral = false;
      }
      lastWasSpaceOutside = false;
      continue;
    }
    if (ch === '"') {
      out += ch;
      inLiteral = true;
      lastWasSpaceOutside = false;
      continue;
    }
    if (/\s/.test(ch)) {
      if (!lastWasSpaceOutside) {
        out += ' ';
        lastWasSpaceOutside = true;
      }
      continue;
    }
    out += ch;
    lastWasSpaceOutside = false;
  }
  return out.trim();
}

function normalizeCustomExpr(expr: CustomPromQLExpr | undefined): CustomPromQLExpr | null {
  if (!expr) return null;
  if (expr.mode === 'events') {
    return {
      mode: 'events',
      goodQuery: expr.goodQuery.trim(),
      totalQuery: expr.totalQuery.trim(),
    };
  }
  return {
    mode: 'raw',
    errorRatioQuery: expr.errorRatioQuery.trim(),
  };
}

/**
 * Sort by `name` ascending, `value` tiebreaker. Defensive — returns a new
 * array so caller state isn't mutated.
 */
function normalizeDimensions(dims: readonly Dimension[] | undefined): Dimension[] {
  if (!dims || dims.length === 0) return [];
  return [...dims].sort((a, b) => {
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    if (a.value !== b.value) return a.value < b.value ? -1 : 1;
    return 0;
  });
}

/**
 * Stringify an arbitrary JSON-safe value with object keys sorted at every
 * level. Arrays preserve order. This is the canonical form that gets hashed —
 * any change to this function is a breaking change for the fingerprint.
 */
function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeys(obj[key]);
  }
  return sorted;
}
