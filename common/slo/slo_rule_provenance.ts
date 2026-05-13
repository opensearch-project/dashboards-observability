/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Provenance annotation emitted alongside every SLO-generated alert group
 * (Phase 3 W3.3). The alert-group annotation is the sole provenance surface:
 *
 *   - `osd_slo_provenance` on the first rule of the alert group — carries the
 *     full SloSpec, the workspace/datasource/sloId tuple, and a `specSha256`
 *     that lets the adoption code verify the rule group hasn't been tampered
 *     with before restoring the SO.
 *   - A synthetic "sentinel" alert is emitted when the alert group would
 *     otherwise be empty (shadow mode, or all burn-rate tiers have
 *     `createAlarm: false`). It carries the `osd_slo_provenance` annotation
 *     but never fires (`expr: vector(0) > 1`), so the provenance surface
 *     exists regardless of the user's alerting choices.
 *
 * Recording groups are NOT annotated. Cortex/Prometheus forbid `annotations`
 * on recording rules (only alerting rules may carry them), so any attempt to
 * upsert a recording group with an annotation fails ruler-side with
 * `RULER_VALIDATION_FAILED`. The alert-group provenance carries enough
 * information (full spec + fingerprints are re-derivable from the spec) for
 * the Phase 4 orphan-adoption path to operate; recording-group-level
 * provenance would be redundant.
 *
 * Prometheus annotations are string-valued. The object defined here is
 * JSON-stringified and assigned verbatim to the annotation value — readers
 * run `JSON.parse` to recover the structured payload.
 *
 * This module is pure. No I/O, no clock, no logging.
 */

import { createHash } from 'crypto';
import type { GeneratedRule, GeneratedRuleGroup, SloSpec } from './slo_types';

// ============================================================================
// Constants (public contract — Phase 4 reads these)
// ============================================================================

/**
 * Schema version stamped into every provenance object. Phase 4 adoption
 * rejects provenance values whose `schemaVersion` it doesn't recognize
 * (surfaces as `unsupported_schema`).
 */
export const PROVENANCE_SCHEMA_VERSION = 1;

export const ALERT_PROVENANCE_ANNOTATION_KEY = 'osd_slo_provenance';
export const SENTINEL_ALERT_NAME_PREFIX = 'SLO_ProvenanceSentinel_';

/** Maximum length for the sentinel alert rule name — keeps us under ruler-side name caps. */
const SENTINEL_NAME_MAX_LEN = 200;

// ============================================================================
// Provenance shapes (Phase 4 parses these — change only with a schema bump)
// ============================================================================

export interface AlertProvenance {
  schemaVersion: number;
  pluginVersion: string;
  sloId: string;
  workspaceId: string;
  datasourceId: string;
  createdAt: string;
  updatedAt: string;
  /** SHA-256 hex of the canonical-JSON serialized spec. */
  specSha256: string;
  /** Embedded for adoption — Phase 4 reconstructs the SO from this. */
  spec: SloSpec;
}

// ============================================================================
// Builders / verifiers
// ============================================================================

/**
 * Compute SHA-256 of a canonical-JSON stringification of the spec. Object
 * keys are sorted at every level; array order is preserved. Returned as
 * lowercase hex.
 *
 * The canonicalization MUST stay identical between `buildAlertProvenance`
 * time and Phase 4's integrity check — that's the point of exporting it.
 */
export function computeSpecSha256(spec: SloSpec): string {
  return createHash('sha256').update(canonicalJson(spec)).digest('hex');
}

export interface BuildAlertProvenanceInput {
  pluginVersion: string;
  sloId: string;
  workspaceId: string;
  datasourceId: string;
  createdAt: string;
  updatedAt: string;
  spec: SloSpec;
}

export function buildAlertProvenance(input: BuildAlertProvenanceInput): AlertProvenance {
  return {
    schemaVersion: PROVENANCE_SCHEMA_VERSION,
    pluginVersion: input.pluginVersion,
    sloId: input.sloId,
    workspaceId: input.workspaceId,
    datasourceId: input.datasourceId,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    specSha256: computeSpecSha256(input.spec),
    spec: input.spec,
  };
}

/**
 * Attach `osd_slo_provenance` to the first rule of an alert group. Pure —
 * returns a new group whose first rule carries the annotation. The rest of
 * the group is returned by reference.
 *
 * Throws if the group has no rules; the caller is responsible for ensuring
 * the alert group is non-empty (see `buildSentinelAlert` for the
 * shadow-mode fallback).
 */
export function annotateAlertGroup(
  group: GeneratedRuleGroup,
  provenance: AlertProvenance
): GeneratedRuleGroup {
  if (group.rules.length === 0) {
    throw new Error(
      `annotateAlertGroup: cannot annotate an empty alert group "${group.groupName}" — emit a sentinel alert first`
    );
  }
  const [first, ...rest] = group.rules;
  const annotated: GeneratedRule = {
    ...first,
    annotations: {
      ...(first.annotations ?? {}),
      [ALERT_PROVENANCE_ANNOTATION_KEY]: JSON.stringify(provenance),
    },
  };
  return {
    ...group,
    rules: [annotated, ...rest],
  };
}

/**
 * Build a sentinel alert that never fires but carries the alert-group
 * provenance annotation on itself. Used when the user disables every
 * burn-rate tier or runs the SLO in shadow mode — without the sentinel the
 * alert group would be empty and there'd be no rule to annotate.
 */
export function buildSentinelAlert(sloId: string, provenance: AlertProvenance): GeneratedRule {
  const name = truncateName(`${SENTINEL_ALERT_NAME_PREFIX}${sloId}`, SENTINEL_NAME_MAX_LEN);
  return {
    type: 'alerting',
    name,
    expr: 'vector(0) > 1',
    for: '5m',
    labels: {
      slo_id: sloId,
      slo_alarm_type: 'sentinel',
      slo_severity: 'info',
    },
    annotations: {
      [ALERT_PROVENANCE_ANNOTATION_KEY]: JSON.stringify(provenance),
      summary: 'SLO provenance sentinel — never fires',
    },
    description:
      'Sentinel alert carrying SLO provenance metadata for adoption. Expression never evaluates true.',
  };
}

/**
 * Parse an alert-provenance annotation value back to a typed object.
 * Returns `null` on malformed JSON or on shape mismatch (wrong
 * schemaVersion, missing required field). Phase 4's adoption path treats a
 * `null` return as "this rule group wasn't emitted by us (or was emitted
 * by an unsupported schema version)".
 */
export function parseAlertProvenance(annotationValue: string): AlertProvenance | null {
  const parsed = safeJsonParse(annotationValue);
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Partial<AlertProvenance>;
  if (obj.schemaVersion !== PROVENANCE_SCHEMA_VERSION) return null;
  if (
    typeof obj.pluginVersion !== 'string' ||
    typeof obj.sloId !== 'string' ||
    typeof obj.workspaceId !== 'string' ||
    typeof obj.datasourceId !== 'string' ||
    typeof obj.createdAt !== 'string' ||
    typeof obj.updatedAt !== 'string' ||
    typeof obj.specSha256 !== 'string' ||
    !obj.spec ||
    typeof obj.spec !== 'object'
  ) {
    return null;
  }
  return parsed as AlertProvenance;
}

// ============================================================================
// Helpers
// ============================================================================

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = sortKeys(obj[key]);
  }
  return out;
}

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function truncateName(input: string, max: number): string {
  if (input.length <= max) return input;
  return input.slice(0, max);
}
