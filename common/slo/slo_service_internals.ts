/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure helpers and constants extracted from `slo_service.ts` during the
 * lifecycle/status/query decomposition. All functions here are stateless
 * and side-effect-free (apart from the clock callers explicitly thread in)
 * so they can be unit-tested without a service instance and reused across
 * the three sub-services without circular imports.
 *
 * Nothing here is an exported part of the public service surface — the
 * facade re-exports the few symbols (`normalizeSloSpec`, `deriveExpectedGroups`,
 * `deriveRuleCount`) that callers outside the service tree consume.
 */

import type {
  GeneratedRuleGroup,
  SloDocument,
  SloHealthState,
  SloLiveStatus,
  SloSpec,
  SingleSli,
  ObjectiveStatus,
} from './slo_types';
import {
  RECORDING_WINDOWS,
  dedupRecordingGroupName,
  generateAlertGroupFor,
} from './slo_promql_generator';
import {
  annotateAlertGroup,
  buildAlertProvenance,
  buildSentinelAlert,
} from './slo_rule_provenance';

/**
 * Status cache TTL. Rationale:
 *   - Recording rules evaluate every 60s (DEFAULT_INTERVAL_SECONDS in the
 *     generator), so the freshest sample available is at most ~60s old. Any
 *     TTL shorter than the eval interval just wastes ruler calls on identical
 *     samples. Matching the interval gives ~1 cache miss per eval.
 *   - Listing pages poll on the order of 10–30s. Without the cache each open
 *     listing tab would issue N ruler queries per poll; with 60s TTL one batch
 *     per minute covers every open tab.
 *   - A user who fixed a breach sees their status flip within ~1m (next cache
 *     expiry + next eval), which is the right tradeoff. >5m would feel stale.
 */
export const STATUS_CACHE_TTL_MS = 60_000;

/**
 * Run `worker(item)` over `items` with at most `limit` calls in flight at once.
 * Output preserves input order. Use to bound parallel SO reads / network I/O so
 * a large `getStatuses` call doesn't hammer the saved-objects layer with N
 * simultaneous reads.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const i = cursor;
      cursor += 1;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

/**
 * Known keys of SloSpec. The set is the allow-list `normalizeSpec` applies to
 * strip unknown attributes before persistence — the route-level config-schema
 * is lenient (`unknowns: 'allow'`) to stay forgiving of older clients sending
 * fields we don't care about, but the service layer must not round-trip
 * arbitrary JSON into saved-object attributes.
 */
const SLO_SPEC_KEYS: ReadonlyArray<keyof SloSpec> = [
  'datasourceId',
  'name',
  'description',
  'enabled',
  'mode',
  'service',
  'owner',
  'tier',
  'canonicalKind',
  'sli',
  'objectives',
  'budgetWarningThresholds',
  'window',
  'alerting',
  'alarms',
  'exclusionWindows',
  'labels',
  'annotations',
];

/**
 * Normalize an incoming SloSpec into its canonical persisted shape.
 *
 * Rules:
 *   - Strip any top-level keys not in `SLO_SPEC_KEYS`. The schema-at-the-
 *     boundary is `unknowns: 'allow'` so a well-meaning older client doesn't
 *     hard-reject, but the service persists a curated surface. This also
 *     closes off `__proto__` / arbitrary SO-attribute injection even though
 *     the saved-objects client already filters via `projectAttributes`.
 *   - Each objective's `target` is clamped to 6 significant digits
 *     (`target ∈ [0.5, 0.99999]`, clamped pre-rule-gen). Done here — not
 *     in the validator — because validators must stay pure.
 *
 * Pure; safe to call more than once (idempotent on an already-clamped spec).
 */
export function normalizeSpec<T extends Partial<SloSpec>>(spec: T): T {
  const picked: Partial<SloSpec> = {};
  for (const key of SLO_SPEC_KEYS) {
    if (key in (spec as object)) {
      (picked as Record<string, unknown>)[key] = (spec as Record<string, unknown>)[key];
    }
  }
  if (Array.isArray(picked.objectives)) {
    picked.objectives = picked.objectives.map((obj) => {
      if (typeof obj.target !== 'number' || !Number.isFinite(obj.target)) return obj;
      return { ...obj, target: Math.round(obj.target * 1e6) / 1e6 };
    });
  }
  return picked as T;
}

/**
 * Default `alarms` map. Mirrors the "most surfaces off by default" posture
 * in the SloSpec JSDoc — only `budgetWarning` defaults ON.
 */
const DEFAULT_ALARMS = (): SloSpec['alarms'] => ({
  sliHealth: { enabled: false },
  attainmentBreach: { enabled: false },
  budgetWarning: { enabled: true },
  noData: { enabled: false, forDuration: '10m' },
  resolved: { enabled: false },
});

/**
 * Read-boundary normalizer. Fills missing `alarms.*` keys with defaults so a
 * future alarm type can land as "type + default-filler" without a saved-
 * object migration. Persisted specs are allowed to lag the current
 * `SloAlarmConfig` shape; this closes the gap on read.
 *
 * Idempotent. Never mutates the input.
 */
export function normalizeSloSpec(raw: SloSpec): SloSpec {
  const defaults = DEFAULT_ALARMS();
  const existing = (raw.alarms ?? {}) as Partial<SloSpec['alarms']>;
  return {
    ...raw,
    alarms: {
      sliHealth: existing.sliHealth ?? defaults.sliHealth,
      attainmentBreach: existing.attainmentBreach ?? defaults.attainmentBreach,
      budgetWarning: existing.budgetWarning ?? defaults.budgetWarning,
      noData: existing.noData ?? defaults.noData,
      resolved: existing.resolved ?? defaults.resolved,
    },
  };
}

/**
 * Dedup predicate — mirrors the gate the `delete`/`update` paths use. A
 * dedup-shape SO has `recordingFingerprints` populated by `createDedup`.
 * Single-group SOs don't, and fall through to the single-group path keyed
 * on `alertGroupName` alone.
 */
export function isDedupSo(doc: SloDocument): boolean {
  if (doc.status.provisioning.backend !== 'prometheus') return false;
  return doc.status.provisioning.recordingFingerprints !== undefined;
}

/**
 * Derive the list of ruler group names an SLO expects to see on the ruler.
 *
 * Dedup shape: one shared recording group per unique fingerprint plus the
 * per-SLO `alertGroupName`. Single-group shape carries only `alertGroupName`
 * (populated with the monolithic group name at create time).
 *
 * Non-prometheus backends (reserved) return [] — nothing to probe.
 */
export function deriveExpectedGroups(doc: SloDocument): string[] {
  if (doc.status.provisioning.backend !== 'prometheus') return [];
  const p = doc.status.provisioning;
  const names: string[] = [];
  if (p.recordingFingerprints) {
    for (const fp of new Set(Object.values(p.recordingFingerprints))) {
      names.push(dedupRecordingGroupName(fp));
    }
  }
  if (p.alertGroupName) {
    names.push(p.alertGroupName);
  }
  return names;
}

/**
 * Count of rules provisioned for this SLO. Derived from the SLI/objective
 * shape (not the ruler) so listing pages can render without a ruler round
 * trip. Dedup shape: unique recording fingerprints × recording windows, plus
 * one alert per objective. Single-group shape: one alert per objective
 * (the monolithic group is not fingerprint-sharded so we conservatively
 * count objectives only). Non-prometheus backends return 0.
 */
export function deriveRuleCount(doc: SloDocument): number {
  if (doc.status.provisioning.backend !== 'prometheus') return 0;
  const p = doc.status.provisioning;
  const objectiveCount = Math.max(doc.spec.objectives.length, 1);
  if (p.recordingFingerprints) {
    const uniqueFps = new Set(Object.values(p.recordingFingerprints)).size;
    return uniqueFps * RECORDING_WINDOWS.length + objectiveCount;
  }
  return objectiveCount;
}

/**
 * Unique set of values from a Record. Order stable across calls because
 * `new Set(Object.values(...))` preserves insertion order.
 */
export function uniqueValues(map: Record<string, string>): string[] {
  return [...new Set(Object.values(map))];
}

/**
 * Pick any objective that maps to the given fingerprint, so we have a
 * representative `SingleSli` + optional `latencyThreshold` to hand to
 * `generateRecordingGroupForFingerprint`. Returns null when the SLI is
 * composite / OpenSearch-backed (no fingerprint → no representative).
 */
export function pickRepresentativeForFingerprint(
  spec: SloSpec,
  recordingFingerprints: Record<string, string>,
  fingerprint: string
): { sli: SingleSli; latencyThreshold?: number } | null {
  if (spec.sli.type !== 'single') return null;
  for (const objective of spec.objectives) {
    if (recordingFingerprints[objective.name] === fingerprint) {
      return { sli: spec.sli, latencyThreshold: objective.latencyThreshold };
    }
  }
  return null;
}

/**
 * Build the per-SLO alert group with provenance annotations, inserting the
 * sentinel alert when the group would otherwise be empty (shadow mode or
 * all burn-rate tiers disabled). Pure, apart from the clock — callers pass
 * `createdAt` and `updatedAt` explicitly so tests can pin provenance values.
 */
export function buildAlertGroupWithProvenance(
  doc: SloDocument,
  recordingFingerprints: Record<string, string>,
  workspaceId: string,
  datasourceId: string,
  pluginVersion: string,
  createdAt: string,
  updatedAt: string = createdAt
): GeneratedRuleGroup {
  const group = generateAlertGroupFor(doc, recordingFingerprints, { workspaceId });
  const provenance = buildAlertProvenance({
    pluginVersion,
    sloId: doc.id,
    workspaceId,
    datasourceId,
    createdAt,
    updatedAt,
    spec: doc.spec,
  });
  if (group.rules.length === 0) {
    const sentinel = buildSentinelAlert(doc.id, provenance);
    return annotateAlertGroup({ ...group, rules: [sentinel] }, provenance);
  }
  return annotateAlertGroup(group, provenance);
}

/**
 * Best-guess unit for the stub `computeStatus` path. Matches the unit the
 * status aggregator infers when it builds an `ObjectiveStatus` for a sample.
 */
export function inferUnit(doc: SloDocument): 'ratio' | 'seconds' | 'count' {
  if (doc.spec.sli.type !== 'single') return 'ratio';
  const def = doc.spec.sli.definition;
  if (def.backend === 'prometheus' && def.type === 'latency_threshold') return 'seconds';
  return 'ratio';
}

/**
 * Stub status — disabled / no_data depending on `spec.enabled`. The live
 * aggregator overrides this when wired; the stub is what list/detail render
 * when the aggregator isn't configured (offline dev / tests) or it rejected.
 *
 * Pure: takes the doc and synthesizes the shape callers expect.
 */
export function computeStubStatus(doc: SloDocument): SloLiveStatus {
  const state: SloHealthState = doc.spec.enabled ? 'no_data' : 'disabled';
  const objectiveStatuses: ObjectiveStatus[] = doc.spec.objectives.map((obj) => ({
    objectiveName: obj.name,
    currentValue: 0,
    currentValueUnit: inferUnit(doc),
    attainment: 0,
    errorBudgetRemaining: 1,
    state,
  }));
  return {
    sloId: doc.id,
    objectives: objectiveStatuses,
    state,
    firingCount: 0,
    ruleCount: deriveRuleCount(doc),
    computedAt: new Date().toISOString(),
  };
}

/**
 * Skeleton status for an id the store doesn't have. The listing path still
 * needs a placeholder so the order-preserving contract on `getStatuses`
 * doesn't return holes.
 */
export function missingStatus(sloId: string): SloLiveStatus {
  return {
    sloId,
    objectives: [],
    state: 'no_data',
    firingCount: 0,
    ruleCount: 0,
    computedAt: new Date().toISOString(),
  };
}

/**
 * RFC 4122 v4 UUID — crypto-safe if `crypto.randomUUID()` is available
 * (Node 14.17+ / modern browsers), falls back to Math.random otherwise.
 */
export function generateUuidV4(): string {
  const g = (globalThis as unknown) as {
    crypto?: { randomUUID?: () => string };
  };
  if (typeof g.crypto?.randomUUID === 'function') return g.crypto.randomUUID();
  const hex = '0123456789abcdef';
  let out = '';
  /* eslint-disable no-bitwise */
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      out += '-';
    } else if (i === 14) {
      out += '4';
    } else if (i === 19) {
      // RFC 4122 variant bits: %10xx — clamp to 8..11.
      out += hex[Math.floor(Math.random() * 4) | 0 | 8];
    } else {
      out += hex[Math.floor(Math.random() * 16)];
    }
  }
  /* eslint-enable no-bitwise */
  return out;
}
