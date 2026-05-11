/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared time-range helpers — consumed by both the server (alerting routes,
 * `MultiBackendAlertService`) and the browser (`AlarmsPage`, `useAlerts`).
 *
 * Pure, framework-free — no React, no http, no OSD imports. `@elastic/datemath`
 * is already bundled in both server and browser builds (it's a direct
 * dependency of OSD core), so this module is safe to import from either side.
 *
 * Design notes:
 *   - We accept date-math strings (e.g. `"now-1h"`, `"now-7d/d"`) and absolute
 *     ISO timestamps. The caller decides whether the string is meant to
 *     express the start or the end of the window via the `isEndTime` flag;
 *     date-math rounding (e.g. `"now/d"`) depends on which side of the window
 *     we're on (start ⇒ floor, end ⇒ ceil).
 *   - `parseDateMath*` throw on invalid input. Route-layer validators should
 *     call `validateDateMath` first to reject malformed input with a 400
 *     instead of crashing a handler.
 *   - `computeStep` derives the Prometheus `query_range` step in seconds from
 *     the window size, with a floor + ceiling + rule-eval-interval preference.
 */
import dateMath from '@elastic/datemath';

/**
 * Parse a date-math expression (e.g. `"now-1h"`) into an epoch-seconds value.
 *
 * @param expr       Date-math string or absolute ISO timestamp.
 * @param isEndTime  When `true`, rounds UP (end-of-day semantics, so
 *                   `"now/d"` → end-of-today); when `false`, rounds DOWN
 *                   (`"now/d"` → start-of-today). Matches `EuiSuperDatePicker`
 *                   semantics for the two ends of a picked window.
 * @returns Epoch seconds (integer).
 * @throws If the expression cannot be parsed.
 */
export function parseDateMath(expr: string, isEndTime: boolean): number {
  return Math.floor(parseDateMathMs(expr, isEndTime) / 1000);
}

/**
 * Same as {@link parseDateMath} but returns epoch milliseconds — useful for
 * the OpenSearch backend's post-fetch filter where `start_time` / `end_time`
 * are epoch ms, and for `new Date(ms).toISOString()` conversions.
 *
 * @throws If the expression cannot be parsed.
 */
export function parseDateMathMs(expr: string, isEndTime: boolean): number {
  const parsed = dateMath.parse(expr, { roundUp: isEndTime });
  if (!parsed || !parsed.isValid()) {
    throw new Error(`Invalid date-math expression: ${expr}`);
  }
  return parsed.valueOf();
}

/**
 * Pass-through helper for OpenSearch DSL `range` clauses. OpenSearch's
 * query DSL accepts date-math natively (`"gte": "now-1h"`), so the common
 * case is simply forwarding the string. Declared as a function for
 * call-site clarity and to reserve a seam if we later need to strip
 * whitespace / normalize.
 */
export function dateMathToDSLString(expr: string): string {
  return expr;
}

/**
 * Derive the Prometheus `query_range` step (seconds) for the given window.
 *
 * Formula:
 *   `clamp(max(floor((end - start) / 500), evalIntervalSec ?? 15), 15, 300)`
 *
 * Bounds rationale:
 *   - 15s floor: Prometheus default scrape interval; a finer step wastes
 *     resolution on empty points.
 *   - 300s (5min) ceiling: caps the point count per series to keep
 *     payload + plot-render cost predictable on 30d+ ranges.
 *   - 500-point denominator: approximately fills a `AlertTimeline` chart at
 *     typical bucket-counts (12..24) with a few sub-pixels of dither.
 *   - `evalIntervalSec` preference: when the rule's evaluation interval is
 *     known, never ask Prometheus for a finer step than the source rule is
 *     evaluated at — finer would return stale repeats.
 */
export function computeStep(
  startEpochSec: number,
  endEpochSec: number,
  evalIntervalSec?: number
): number {
  const span = Math.max(0, endEpochSec - startEpochSec);
  const pointBased = Math.floor(span / 500);
  const eval_ = evalIntervalSec ?? 15;
  const preferred = Math.max(pointBased, eval_);
  // clamp to [15, 300]
  if (preferred < 15) return 15;
  if (preferred > 300) return 300;
  return preferred;
}

/**
 * Lightweight predicate used by route-layer schema validators to reject
 * malformed date-math input at the HTTP boundary (400) instead of letting
 * it crash a handler later.
 *
 * Returns `true` for any string `@elastic/datemath` can parse (both as a
 * start AND as an end — we check both since some expressions are only
 * valid in one rounding mode).
 */
export function validateDateMath(expr: string): boolean {
  if (typeof expr !== 'string' || expr.length === 0) return false;
  try {
    const parsedStart = dateMath.parse(expr, { roundUp: false });
    const parsedEnd = dateMath.parse(expr, { roundUp: true });
    return !!(parsedStart && parsedStart.isValid() && parsedEnd && parsedEnd.isValid());
  } catch {
    return false;
  }
}
