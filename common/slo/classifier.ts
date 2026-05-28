/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Canonical-kind classification and per-service rollup of SLO summaries.
 *
 * Lives in `common/` so the browser hook (`useServiceSloHealth`) and the
 * server-side aggregate route share one source of truth. The classifier
 * prefers the stored `canonicalKind` tag stamped at suggest-driven create
 * time (M5A); for legacy / manually-authored SLOs it falls back to a
 * heuristic over the SLI definition.
 */

import type { SloHealthState, SloSummary, SuggestionKind } from './slo_types';

/**
 * Full `SuggestionKind` union so downstream surfaces can distinguish
 * http/rpc/db/etc. when the SLO was created from a suggestion.
 * `hasAvailability` / `hasLatency` roll-ups treat any `-availability` /
 * `-latency` suffix as the respective side — so an HTTP availability SLO
 * still counts toward the canonical pair for its service.
 */
export type CanonicalKind = SuggestionKind;

export interface SloHealthBucket {
  total: number;
  ok: number;
  warning: number;
  breached: number;
  noData: number;
  stale: number;
  disabled: number;
  rulesMissing: number;
  hasAvailability: boolean;
  hasLatency: boolean;
  missingCanonicalPair: boolean;
  slos: SloSummary[];
}

/**
 * Classifier. Prefers the stored `canonicalKind` tag stamped at suggest-
 * driven create time (M5A). Falls back to the heuristic over the SLI
 * definition for legacy / manually-authored SLOs that predate the tag.
 */
export function classifySloKind(slo: SloSummary): CanonicalKind | undefined {
  if (slo.canonicalKind) return slo.canonicalKind;
  if (slo.sliBackend !== 'prometheus') return undefined;
  if (slo.sliLeafType === 'availability') return 'apm-availability';
  if (slo.sliLeafType === 'latency_threshold') return 'apm-latency';
  return undefined;
}

function kindSide(kind: CanonicalKind | undefined): 'availability' | 'latency' | undefined {
  if (!kind) return undefined;
  if (kind.endsWith('-availability')) return 'availability';
  if (kind.endsWith('-latency')) return 'latency';
  return undefined;
}

function emptyBucket(): SloHealthBucket {
  return {
    total: 0,
    ok: 0,
    warning: 0,
    breached: 0,
    noData: 0,
    stale: 0,
    disabled: 0,
    rulesMissing: 0,
    hasAvailability: false,
    hasLatency: false,
    missingCanonicalPair: true,
    slos: [],
  };
}

function tallyState(bucket: SloHealthBucket, state: SloHealthState): void {
  switch (state) {
    case 'ok':
      bucket.ok += 1;
      break;
    case 'warning':
      bucket.warning += 1;
      break;
    case 'breached':
      bucket.breached += 1;
      break;
    case 'no_data':
      bucket.noData += 1;
      break;
    case 'source_idle':
      // Roll source_idle into the same bucket as no_data — both surface as
      // "no signal" on services-home. Listing/detail surfaces still
      // distinguish them via the badge label and color.
      bucket.noData += 1;
      break;
    case 'stale':
      bucket.stale += 1;
      break;
    case 'disabled':
      bucket.disabled += 1;
      break;
    case 'rules_missing':
      bucket.rulesMissing += 1;
      break;
  }
}

function recomputeDerived(bucket: SloHealthBucket): void {
  bucket.missingCanonicalPair = !(bucket.hasAvailability && bucket.hasLatency);
}

/**
 * Roll `summaries` up into per-service + aggregate buckets. Shared between
 * the server aggregate route and the client-side fallback path so both
 * surfaces produce identical shapes.
 */
export function rollupSloHealth(
  serviceNames: string[],
  summaries: SloSummary[]
): { bySvc: Map<string, SloHealthBucket>; aggregate: SloHealthBucket } {
  const bySvc = new Map<string, SloHealthBucket>();
  for (const name of serviceNames) bySvc.set(name, emptyBucket());

  const aggregate = emptyBucket();
  // Aggregate tracks "every service has X", not "any summary exists" — start
  // true and flip when we find a service without availability / latency.
  aggregate.hasAvailability = serviceNames.length > 0;
  aggregate.hasLatency = serviceNames.length > 0;

  for (const slo of summaries) {
    const bucket = bySvc.get(slo.service);
    if (!bucket) continue; // summary outside the requested service set
    bucket.total += 1;
    bucket.slos.push(slo);
    tallyState(bucket, slo.status.state);

    const side = kindSide(classifySloKind(slo));
    if (side === 'availability') bucket.hasAvailability = true;
    if (side === 'latency') bucket.hasLatency = true;

    aggregate.total += 1;
    aggregate.slos.push(slo);
    tallyState(aggregate, slo.status.state);
  }

  for (const bucket of bySvc.values()) {
    recomputeDerived(bucket);
    if (!bucket.hasAvailability) aggregate.hasAvailability = false;
    if (!bucket.hasLatency) aggregate.hasLatency = false;
  }
  recomputeDerived(aggregate);

  return { bySvc, aggregate };
}
