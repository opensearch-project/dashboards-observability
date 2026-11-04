/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * What a latency histogram's buckets actually look like for one service, read
 * from an hour of data at suggest time. Latency SLI math depends on it, and
 * producers disagree:
 *
 *   - `cumulative` — the Prometheus norm: each `le` bucket counts every
 *     observation up to its bound, so `+Inf` equals `_count`.
 *   - `per_range` — each bucket holds only the observations between the
 *     previous bound and its own, and `+Inf` only the overflow. The buckets
 *     still grow over time like counters. Reading `+Inf` as the total gives
 *     0, so a cumulative SLI evaluates to NaN.
 *   - `empty` — the series exist but no bucket recorded anything.
 *   - `unknown` — not enough signal to tell; callers leave the draft alone.
 *
 * The unit says whether the `le` labels are seconds or milliseconds. Some
 * producers export a `_seconds` histogram with the bounds the OTel SDK uses
 * for milliseconds (0, 5, 10, … 10000). Those bounds may really be
 * milliseconds, or seconds that are far too coarse — only the distribution
 * tells them apart (see {@link inferBucketUnit}).
 */

export type HistogramLayout = 'cumulative' | 'per_range' | 'empty' | 'unknown';

export interface HistogramShape {
  /** The `_bucket` metric. */
  metric: string;
  /** The label the histogram is attributed by (`service_name`, `job`, …) and its value. */
  label: string;
  value: string;
  layout: HistogramLayout;
  /** Finite `le` bounds, ascending, in `unit`. */
  bounds: number[];
  unit: 'seconds' | 'milliseconds';
}

/** One service's increases over the probe window. */
export interface HistogramIncreases {
  /** `le` label → increase of that bucket. `+Inf` is keyed as `'+Inf'`. */
  buckets: Map<string, number>;
  /** Increase of `<metric>_count`, when the series exists. */
  count?: number;
  /** Increase of `<metric>_sum`, when the series exists. */
  sum?: number;
}

/** Relative slack for comparing increases, which `increase()` extrapolates. */
const TOLERANCE = 0.05;

const near = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE * Math.max(a, b);

/** Parse an `le` label; `+Inf` and junk return undefined. */
function parseLe(le: string): number | undefined {
  if (le === '+Inf') return undefined;
  const n = Number(le);
  return Number.isFinite(n) ? n : undefined;
}

/** Classify the bucket layout from one service's increases. */
export function classifyHistogramLayout(inc: HistogramIncreases): HistogramLayout {
  let total = 0;
  let maxFinite = 0;
  for (const [le, v] of inc.buckets) {
    total += v;
    if (le !== '+Inf') maxFinite = Math.max(maxFinite, v);
  }
  if (inc.buckets.size === 0) return 'unknown';
  if (total === 0) return 'empty';
  const inf = inc.buckets.get('+Inf') ?? 0;
  const count = inc.count;
  if (count !== undefined && count > 0) {
    if (near(inf, count)) return 'cumulative';
    if (inf <= TOLERANCE * count && near(total, count)) return 'per_range';
    return 'unknown';
  }
  // No `_count` to compare with: a cumulative `+Inf` is at least every bucket.
  if (inf > 0 && inf >= maxFinite) return 'cumulative';
  if (inf === 0 && maxFinite > 0) return 'per_range';
  return 'unknown';
}

/**
 * Fraction of observations at or under `bound`, per the layout: the bucket
 * itself for a cumulative histogram, the sum of buckets up to it for a
 * per-range one.
 */
function fractionUnder(
  inc: HistogramIncreases,
  layout: HistogramLayout,
  bound: number,
  total: number
): number {
  if (total <= 0) return 0;
  let good = 0;
  for (const [le, v] of inc.buckets) {
    const b = parseLe(le);
    if (b === undefined) continue;
    if (layout === 'cumulative') {
      if (b === bound) good = v;
    } else if (b <= bound) {
      good += v;
    }
  }
  return good / total;
}

/**
 * Unit of the `le` labels. A name without `_seconds` follows its suffix; a
 * `_seconds` histogram is read as milliseconds only with positive evidence:
 * the bounds reach the OTel millisecond defaults (≥ 1000), the mean
 * observation sits at or above the smallest positive bound, and the
 * observations spread past that bucket instead of piling into it. Seconds
 * read against millisecond-style bounds pile into the first bucket — the
 * "bounds too coarse" case — so they stay seconds.
 */
export function inferBucketUnit(
  metric: string,
  inc: HistogramIncreases,
  layout: HistogramLayout,
  bounds: number[]
): 'seconds' | 'milliseconds' {
  if (/_milliseconds(_bucket)?$/.test(metric)) return 'milliseconds';
  if (!/_seconds(_bucket)?$/.test(metric)) return 'seconds';
  const positive = bounds.filter((b) => b > 0);
  if (positive.length === 0 || positive[positive.length - 1] < 1000) return 'seconds';
  const total = layout === 'cumulative' ? (inc.buckets.get('+Inf') ?? 0) : (inc.count ?? 0);
  if (total <= 0 || inc.sum === undefined || inc.count === undefined || inc.count <= 0) {
    return 'seconds';
  }
  const smallest = positive[0];
  const mean = inc.sum / inc.count;
  const piledIntoFirst = fractionUnder(inc, layout, smallest, total) >= 0.9;
  return mean >= smallest && !piledIntoFirst ? 'milliseconds' : 'seconds';
}

/** Build the shape for one service from its increases. */
export function buildHistogramShape(
  metric: string,
  label: string,
  value: string,
  inc: HistogramIncreases
): HistogramShape {
  const layout = classifyHistogramLayout(inc);
  const bounds = [...inc.buckets.keys()]
    .map(parseLe)
    .filter((b): b is number => b !== undefined)
    .sort((a, b) => a - b);
  return {
    metric,
    label,
    value,
    layout,
    bounds,
    unit: inferBucketUnit(metric, inc, layout, bounds),
  };
}
