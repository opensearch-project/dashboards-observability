/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Orphan / missing diff for a single (datasource, namespace) slice of the
 * Prometheus-compatible ruler.
 *
 * The reconciler feeds this pure function two inputs:
 *   - `expectedGroupsBySlo`: for each SLO saved object that claims rules in
 *     this namespace, the list of ruler group names derived from its SO
 *     (via `deriveExpectedGroups`).
 *   - `actualGroups` (Phase 4): the ruler groups actually present in the
 *     namespace, with their `rules[]` + `annotations` so the detector can
 *     inspect provenance annotations. A name-only `actualGroupNames` input
 *     is still accepted for callers that don't have full groups — those
 *     orphans land in `unknownOrphans` with a "no annotation" diagnostic
 *     because there is no rule-annotation surface to inspect.
 *
 * From that it emits two views of the diff:
 *   - `missingBySlo`: per-SLO, which expected groups are absent. Each SLO
 *     evaluates the diff independently of every other SLO — if two SLOs share
 *     an expected group name (Phase 3 dedup) and the ruler has dropped it,
 *     both SLOs show it as missing.
 *   - `orphans`: ruler groups that no SLO in the input claims. Phase 4
 *     categorizes orphans via provenance annotations:
 *       - Alert group with schema-v1 provenance and verified spec integrity
 *         → `adoptableOrphans` entry (with sourceSloId, spec, fingerprints).
 *       - Alert group with unknown schemaVersion / spec mismatch → ends up
 *         in `unknownOrphans` with populated metadata so the UI can render
 *         "drift detected" or "unknown schema" copy.
 *       - Standalone recording group (no paired alert) or group with no
 *         provenance at all → `unknownOrphans` with a human-readable
 *         `diagnostic` field explaining why it was not adopted.
 *
 * The detector is deliberately pure: it performs no I/O, takes no clock, and
 * knows nothing about ruler clients. The datasourceId + namespace it receives
 * are echoed back verbatim on every result entry so the reconciler can flat-
 * map diffs across many slices into a single `ReconcileResult` without having
 * to re-key by (datasource, namespace) upstream.
 */

import type { GeneratedRuleGroup, Objective, SingleSli } from '../../../common/slo/slo_types';
import {
  ALERT_PROVENANCE_ANNOTATION_KEY,
  PROVENANCE_SCHEMA_VERSION,
  computeSpecSha256,
  parseAlertProvenance,
} from '../../../common/slo/slo_rule_provenance';
import type { AlertProvenance } from '../../../common/slo/slo_rule_provenance';
import { computeSliFingerprint } from '../../../common/slo/slo_sli_fingerprint';
import { dedupRecordingGroupName } from '../../../common/slo/slo_promql_generator';

export type SpecIntegrity = 'ok' | 'mismatch' | 'unsupported_schema';

export interface OrphanDiffInput {
  /** Expected ruler group names per SLO id, as returned by deriveExpectedGroups. */
  expectedGroupsBySlo: Record<string, string[]>;
  /**
   * Ruler group names actually present in the namespace. Pre-Phase-4 callers
   * that do not have the full `rules[]` can still pass just names — every
   * orphan from such callers lands in `unknownOrphans` because no annotation
   * can be inspected.
   */
  actualGroupNames: string[];
  /**
   * Phase 4 — the full ruler group objects (with `rules[].annotations`) for
   * the namespace. When provided, provenance annotations on each orphan
   * group are parsed and used to classify the orphan as adoptable / unknown.
   * Must be the same namespace as `actualGroupNames` if both are supplied;
   * the detector takes the union on name (annotation lookup is indexed by
   * group name).
   */
  actualGroups?: GeneratedRuleGroup[];
  /**
   * Namespace and datasourceId for the slice being diffed. The detector is
   * pure — it doesn't know about ruler clients — but it echoes these back in
   * the result entries so the reconciler can build a single flat ReconcileResult
   * without having to re-key by datasource.
   */
  datasourceId: string;
  namespace: string;
}

export interface MissingEntry {
  sloId: string;
  datasourceId: string;
  namespace: string;
  missingGroups: string[];
}

export interface OrphanEntry {
  datasourceId: string;
  namespace: string;
  groupName: string;
  // Phase 4 additions (optional; populated only when provenance parse succeeds)
  sourceSloId?: string;
  sourceWorkspaceId?: string;
  schemaVersion?: number;
  /** Parsed + spec-hash-verified spec, when integrity === 'ok'. */
  spec?: Record<string, unknown>;
  /** Fingerprints the source SLO claims, derived from embedded spec. Empty when unavailable. */
  fingerprints?: string[];
  /** Tombstone presence at sweep time. Undefined when no tombstone store is wired. */
  tombstoned?: boolean;
  /** Non-expired tombstone only; expired tombstones surface as `tombstoned: false`. */
  tombstoneCreatedAt?: string;
  specIntegrity?: SpecIntegrity;
  /** Human-readable note for unknownOrphans that pass no provenance check. */
  diagnostic?: string;
}

export interface OrphanDiffResult {
  missingBySlo: MissingEntry[];
  orphans: OrphanEntry[];
  /** Phase 4: alert-group orphans whose provenance integrity is 'ok'. */
  adoptableOrphans: OrphanEntry[];
  /** Phase 4: every other orphan category (no provenance, drift, unknown schema, recording-only). */
  unknownOrphans: OrphanEntry[];
}

export function detectOrphanDiff(input: OrphanDiffInput): OrphanDiffResult {
  const { expectedGroupsBySlo, actualGroupNames, actualGroups, datasourceId, namespace } = input;

  // Defensive dedup: a well-behaved ruler response shouldn't contain dupes,
  // but a misconfigured proxy or a ruler bug could emit the same group name
  // twice. Collapse to a Set before membership checks so orphan computation
  // isn't thrown off by repeats.
  const actualSet = new Set<string>(actualGroupNames);
  // Also fold any names carried exclusively on `actualGroups` so the caller
  // can pass only one of the two and still get accurate orphan detection.
  if (actualGroups) {
    for (const g of actualGroups) actualSet.add(g.groupName);
  }

  // Union of every group any SLO claims. A group is "claimed" if it appears
  // in at least one SLO's expected list — shared names (Phase 3 dedup) count
  // once. Orphans are ruler groups not in this union.
  const claimedSet = new Set<string>();
  for (const groups of Object.values(expectedGroupsBySlo)) {
    for (const name of groups) {
      claimedSet.add(name);
    }
  }

  const missingBySlo: MissingEntry[] = [];
  for (const [sloId, expected] of Object.entries(expectedGroupsBySlo)) {
    const missingGroups: string[] = [];
    for (const groupName of expected) {
      if (!actualSet.has(groupName)) {
        missingGroups.push(groupName);
      }
    }
    if (missingGroups.length > 0) {
      missingBySlo.push({
        sloId,
        datasourceId,
        namespace,
        missingGroups,
      });
    }
  }

  // Index full ruler groups by name so we can read annotations quickly during
  // the categorization pass.
  const groupsByName = new Map<string, GeneratedRuleGroup>();
  if (actualGroups) {
    for (const g of actualGroups) groupsByName.set(g.groupName, g);
  }

  const orphanNames: string[] = [];
  for (const groupName of actualSet) {
    if (!claimedSet.has(groupName)) {
      orphanNames.push(groupName);
    }
  }

  // Two-pass orphan categorization (Phase 4).
  //   Pass 1: walk every orphan group looking for `osd_slo_provenance`
  //           (alert-group provenance). If found, classify by schema version
  //           + spec-hash integrity + fingerprint reachability. Record the
  //           set of recording fingerprints an adoptable alert group already
  //           "covers" so Pass 2 can suppress them.
  //   Pass 2: walk any remaining orphan groups. If they carry
  //           `osd_slo_recording_provenance`, suppress the ones covered in
  //           Pass 1; the rest surface as unknownOrphans with a
  //           "recording-only" diagnostic. Groups with no provenance at all
  //           surface as unknownOrphans with the "pre-Phase-3 rule layout"
  //           diagnostic (legacy-group adoption is out of scope per D2).

  const orphans: OrphanEntry[] = [];
  const adoptableOrphans: OrphanEntry[] = [];
  const unknownOrphans: OrphanEntry[] = [];
  const coveredRecordingFingerprints = new Set<string>();
  const alertGroupHandled = new Set<string>();

  for (const groupName of orphanNames) {
    const group = groupsByName.get(groupName);
    const alertAnnotationRaw = findAnnotation(group, ALERT_PROVENANCE_ANNOTATION_KEY);
    if (alertAnnotationRaw === null) continue;

    alertGroupHandled.add(groupName);
    const baseEntry: OrphanEntry = { datasourceId, namespace, groupName };

    const parsed = parseAlertProvenance(alertAnnotationRaw);
    if (parsed === null) {
      // Could be unparseable JSON, could be schema-version mismatch — the
      // parser collapses both to `null`. Disambiguate by re-running a lax
      // JSON parse so we can surface the better of two diagnostics.
      const lax = laxParseAlertProvenance(alertAnnotationRaw);
      if (
        lax &&
        typeof lax.schemaVersion === 'number' &&
        lax.schemaVersion !== PROVENANCE_SCHEMA_VERSION
      ) {
        const entry: OrphanEntry = {
          ...baseEntry,
          sourceSloId: typeof lax.sloId === 'string' ? lax.sloId : undefined,
          sourceWorkspaceId: typeof lax.workspaceId === 'string' ? lax.workspaceId : undefined,
          schemaVersion: lax.schemaVersion,
          specIntegrity: 'unsupported_schema',
          diagnostic: `provenance schemaVersion ${lax.schemaVersion} not supported (expected ${PROVENANCE_SCHEMA_VERSION})`,
        };
        orphans.push(entry);
        unknownOrphans.push(entry);
      } else {
        const entry: OrphanEntry = {
          ...baseEntry,
          diagnostic: 'provenance annotation unparseable',
        };
        orphans.push(entry);
        unknownOrphans.push(entry);
      }
      continue;
    }

    // Supported schema: verify spec integrity (sha256 match + expected
    // recording groups all present) and populate metadata.
    const recomputedSha = computeSpecSha256(parsed.spec);
    const expectedFingerprints = computeExpectedFingerprints(parsed);
    const recordingGroupsPresent = expectedFingerprints.every((fp) =>
      actualSet.has(dedupRecordingGroupName(fp))
    );

    const shaMatches = recomputedSha === parsed.specSha256;
    const specIntegrity: SpecIntegrity = shaMatches && recordingGroupsPresent ? 'ok' : 'mismatch';

    const diagnosticParts: string[] = [];
    if (!shaMatches) diagnosticParts.push('specSha256 mismatch');
    if (!recordingGroupsPresent) {
      const missing = expectedFingerprints.filter(
        (fp) => !actualSet.has(dedupRecordingGroupName(fp))
      );
      diagnosticParts.push(`missing recording group(s) for fingerprint(s): ${missing.join(', ')}`);
    }

    const entry: OrphanEntry = {
      ...baseEntry,
      sourceSloId: parsed.sloId,
      sourceWorkspaceId: parsed.workspaceId,
      schemaVersion: parsed.schemaVersion,
      spec: (parsed.spec as unknown) as Record<string, unknown>,
      fingerprints: expectedFingerprints,
      specIntegrity,
    };

    if (specIntegrity === 'ok') {
      adoptableOrphans.push(entry);
      for (const fp of expectedFingerprints) coveredRecordingFingerprints.add(fp);
    } else {
      entry.diagnostic =
        diagnosticParts.length > 0 ? diagnosticParts.join('; ') : 'spec integrity mismatch';
      unknownOrphans.push(entry);
    }
    orphans.push(entry);
  }

  // Pass 2 — groups that didn't land on an alert-provenance annotation.
  // Phase 3 emits recording groups without annotations (Cortex forbids
  // annotations on recording rules), so we recognize them by name pattern
  // `slo:rec:<fp>`. Recording groups whose fingerprint was covered by an
  // adoptable alert-group in Pass 1 are suppressed (already adopted as a
  // pair). Orphans that don't match either pattern are pre-Phase-3 layout
  // and not eligible for adoption per D2.
  //
  // Back-compat mode: when the caller didn't pass `actualGroups`, the
  // minimal three-field shape is emitted so pre-Phase-4 callers see the
  // same structure they always saw.
  const categorizeByAnnotation = actualGroups !== undefined;
  for (const groupName of orphanNames) {
    if (alertGroupHandled.has(groupName)) continue;
    const recordingFp = recordingGroupFingerprint(groupName);

    if (recordingFp !== null) {
      if (coveredRecordingFingerprints.has(recordingFp)) {
        // Paired with an adoptable alert group in Pass 1 — suppress.
        continue;
      }
      const entry: OrphanEntry = {
        datasourceId,
        namespace,
        groupName,
        diagnostic: 'recording-only orphan; matching alert group missing',
      };
      orphans.push(entry);
      unknownOrphans.push(entry);
      continue;
    }

    if (categorizeByAnnotation) {
      // No provenance annotation anywhere on this group — D2 says leave
      // adoption off the table.
      const entry: OrphanEntry = {
        datasourceId,
        namespace,
        groupName,
        diagnostic: 'pre-Phase-3 rule layout; not eligible for adoption',
      };
      orphans.push(entry);
      unknownOrphans.push(entry);
    } else {
      // Pre-Phase-4 caller (no actualGroups). Emit the minimal shape so
      // existing callers continue to see the same object structure.
      const entry: OrphanEntry = { datasourceId, namespace, groupName };
      orphans.push(entry);
      unknownOrphans.push(entry);
    }
  }

  return {
    missingBySlo,
    orphans,
    adoptableOrphans,
    unknownOrphans,
  };
}

/**
 * Walk a rule group's rules[] looking for the first annotation with the
 * given key. Returns `null` when the group is absent or no rule carries the
 * annotation. Prometheus annotations are string-valued, so the return type
 * mirrors that.
 */
function findAnnotation(group: GeneratedRuleGroup | undefined, key: string): string | null {
  if (!group) return null;
  for (const rule of group.rules) {
    const ann = rule.annotations;
    if (ann && typeof ann[key] === 'string') return ann[key];
  }
  return null;
}

/**
 * Extract the fingerprint from a Phase-3 dedup recording-group name. The name
 * shape is `slo:rec:<fp>`; anything that doesn't match returns `null`. Kept
 * here (rather than centrally) because the detector is the only consumer.
 */
function recordingGroupFingerprint(groupName: string): string | null {
  const prefix = 'slo:rec:';
  if (!groupName.startsWith(prefix)) return null;
  const fp = groupName.slice(prefix.length);
  return fp.length > 0 ? fp : null;
}

/**
 * Permissive JSON parse used only to recover `schemaVersion` / `sloId` /
 * `workspaceId` off an alert-provenance annotation that `parseAlertProvenance`
 * rejected. Returns `null` when the payload is not even valid JSON.
 */
function laxParseAlertProvenance(annotationValue: string): Partial<AlertProvenance> | null {
  try {
    const parsed = JSON.parse(annotationValue);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Partial<AlertProvenance>;
  } catch {
    return null;
  }
}

/**
 * Recompute the set of recording-group fingerprints the provenance's
 * embedded spec would emit. Mirrors `deriveExpectedGroups`'s recording-group
 * logic without re-deploying through the service layer. Non-prometheus /
 * composite SLIs yield an empty array — the integrity check then only
 * cares that the alert group itself stands alone.
 */
function computeExpectedFingerprints(provenance: AlertProvenance): string[] {
  const spec = provenance.spec;
  if (!spec || spec.sli.type !== 'single') return [];
  if (spec.sli.definition.backend !== 'prometheus') return [];
  const sli: SingleSli = spec.sli;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const objective of spec.objectives as Objective[]) {
    const fp = computeSliFingerprint(spec.datasourceId, sli, objective);
    if (fp === null) continue;
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(fp);
  }
  return out;
}
