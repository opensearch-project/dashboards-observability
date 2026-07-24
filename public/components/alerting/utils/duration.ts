/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Duration formatting helpers shared by the rule form (edit seeding) and
 * the monitor detail flyout (display).
 */

/** Convert seconds to a compact duration string (e.g., 300 → "5m", 0 → "0s"). */
export function formatSeconds(sec: number): string {
  if (sec <= 0) return '0s';
  if (sec % 3600 === 0) return `${sec / 3600}h`;
  if (sec % 60 === 0) return `${sec / 60}m`;
  return `${sec}s`;
}

/**
 * Normalize a duration string like "120s" to the canonical form used in
 * dropdown options ("2m"). Values already in m/h/d format pass through;
 * anything unparseable is returned as-is.
 */
export function normalizeDuration(dur: string, fallback = '5m'): string {
  if (!dur) return fallback;
  if (/^\d+[mhd]$/.test(dur)) return dur;
  const secMatch = dur.match(/^(\d+)s$/);
  if (secMatch) return formatSeconds(parseInt(secMatch[1], 10));
  return dur;
}
