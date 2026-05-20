/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 4 W4.7 — integrity-verification helpers shared by `SloService.recover`
 * (W4.4), `SloService.clone` (W4.5), and the adoption HTTP routes (W4.6).
 *
 * The logic was extracted from W4.4 so clone() and the route layer don't have
 * to re-implement parse + sha256 + fingerprint-coverage checks (and so they
 * can't drift from each other). The reconciler (Batch 1) keeps its own inline
 * copy on purpose — its contract with the rest of the reconciliation loop was
 * already frozen; this helper is additive and opt-in.
 *
 * Pure module — no I/O, no clock, no logging.
 */

import {
  ALERT_PROVENANCE_ANNOTATION_KEY,
  AlertProvenance,
  computeSpecSha256,
  parseAlertProvenance,
  PROVENANCE_SCHEMA_VERSION,
} from './slo_rule_provenance';
import { computeSliFingerprint } from './slo_sli_fingerprint';
import { dedupRecordingGroupName } from './slo_promql_generator';
import type { GeneratedRuleGroup, SloSpec } from './slo_types';

// Re-export the canonical sha256 helper so callers can import it from one
// place alongside the other adoption helpers (W4.7 "extracted so others can
// share" — the shared surface includes the hash).
export { computeSpecSha256 };

// ============================================================================
// Contract (B2B consumes this + tests pin it)
// ============================================================================

/**
 * Why a verification failed, or `undefined` when `ok` is true.
 *
 *   - `parse`         — annotation value wasn't valid JSON / missing required
 *                       fields.
 *   - `schema`        — provenance schemaVersion is not
 *                       `PROVENANCE_SCHEMA_VERSION`.
 *   - `sha256`        — embedded spec's canonical sha256 no longer matches
 *                       the recorded `specSha256`; rules have been edited
 *                       out-of-band.
 *   - `fingerprints`  — one or more recording groups the spec implies are
 *                       missing from the ruler snapshot.
 */
export type VerifyProvenanceReason = 'parse' | 'schema' | 'sha256' | 'fingerprints';

export interface VerifyProvenanceResult {
  ok: boolean;
  reason?: VerifyProvenanceReason;
  parsed?: AlertProvenance;
  expectedFingerprints?: string[];
  missingRecordingGroups?: string[];
}

/**
 * Verify a single alert-group provenance annotation against the ruler's
 * current namespace snapshot. Called by recover/clone after the caller has
 * located the candidate alert group.
 *
 *   @param alertGroupAnnotationValue — the raw JSON string pulled from the
 *                                      `osd_slo_provenance` annotation on
 *                                      the alert group's first rule.
 *   @param actualGroupNames          — every group name currently live in
 *                                      the ruler namespace (includes the
 *                                      alert group, every shared recording
 *                                      group, plus any unrelated groups).
 */
export function verifyProvenance(
  alertGroupAnnotationValue: string,
  actualGroupNames: string[]
): VerifyProvenanceResult {
  // --- 1. Parse ---
  // `parseAlertProvenance` returns null both for malformed JSON and for a
  // shape that's missing required fields. We can't distinguish those without
  // duplicating the parse logic — callers treat both as `parse` failure.
  const parsed = parseAlertProvenance(alertGroupAnnotationValue);
  if (!parsed) {
    // Try to recover the schemaVersion from a loose parse so we can report
    // `schema` (rather than `parse`) when the only problem is a future
    // schemaVersion. This is best-effort; anything that isn't JSON-parsable
    // stays `parse`.
    const loose = looseParse(alertGroupAnnotationValue);
    if (loose && typeof loose === 'object' && 'schemaVersion' in loose) {
      const sv = (loose as { schemaVersion: unknown }).schemaVersion;
      if (typeof sv === 'number' && sv !== PROVENANCE_SCHEMA_VERSION) {
        return { ok: false, reason: 'schema' };
      }
    }
    return { ok: false, reason: 'parse' };
  }

  // --- 2. sha256 ---
  const recomputed = computeSpecSha256(parsed.spec);
  if (recomputed !== parsed.specSha256) {
    return { ok: false, reason: 'sha256', parsed };
  }

  // --- 3. Fingerprint coverage ---
  const expected = deriveExpectedFingerprintsFromSpec(parsed.spec);
  const expectedGroups = expected.map(dedupRecordingGroupName);
  const missing = expectedGroups.filter((g) => !actualGroupNames.includes(g));
  if (missing.length > 0) {
    return {
      ok: false,
      reason: 'fingerprints',
      parsed,
      expectedFingerprints: expected,
      missingRecordingGroups: missing,
    };
  }

  return { ok: true, parsed, expectedFingerprints: expected };
}

/**
 * Compute the set of recording-rule fingerprints a given spec implies.
 *
 * Order is stable across calls: fingerprints are emitted in the order their
 * objectives appear in the spec, with duplicates collapsed. Composite SLIs
 * and OpenSearch-backed SLIs produce `null` fingerprints — those are
 * filtered out because they contribute no recording groups.
 */
export function deriveExpectedFingerprintsFromSpec(spec: SloSpec): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const objective of spec.objectives) {
    const fp = computeSliFingerprint(spec.datasourceId, spec.sli, objective);
    if (fp === null) continue;
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(fp);
  }
  return out;
}

/**
 * Scan the ruler's namespace snapshot for an alert group whose provenance
 * annotation resolves to the requested `sloId`. Returns `null` when no group
 * matches (unknown sloId, or the candidate group carries no provenance at
 * all — legacy monolithic groups land here, which is the correct answer for
 * Batch 2 D2: recover() refuses to adopt non-dedup shapes).
 */
export function findAdoptableAlertGroup(
  groups: GeneratedRuleGroup[],
  sloId: string
): { group: GeneratedRuleGroup; provenanceValue: string } | null {
  for (const group of groups) {
    const firstRule = group.rules[0];
    if (!firstRule || !firstRule.annotations) continue;
    const raw = firstRule.annotations[ALERT_PROVENANCE_ANNOTATION_KEY];
    if (typeof raw !== 'string' || raw.length === 0) continue;
    const parsed = parseAlertProvenance(raw);
    if (!parsed) continue;
    if (parsed.sloId === sloId) {
      return { group, provenanceValue: raw };
    }
  }
  return null;
}

// ============================================================================
// Internal helpers
// ============================================================================

function looseParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
