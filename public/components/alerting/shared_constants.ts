/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared color maps, formatting utilities, and style constants
 * used across alert-manager components.
 *
 * Centralising these here avoids drift between components that
 * previously each defined their own (slightly different) copies.
 */

// ============================================================================
// Severity
// ============================================================================

/**
 * Maps UnifiedAlertSeverity values to OUI semantic badge color names.
 * Usage: <EuiBadge color={SEVERITY_COLORS[severity]}>{severity}</EuiBadge>
 */
export const SEVERITY_COLORS: Record<string, string> = {
  critical: 'danger',
  high: 'warning',
  medium: 'primary',
  low: 'subdued',
  info: 'default',
};

// ============================================================================
// Alert state
// ============================================================================

/**
 * Maps UnifiedAlertState values to OUI semantic Health / badge color names.
 * Usage: <EuiHealth color={STATE_COLORS[state]}>{state}</EuiHealth>
 */
export const STATE_COLORS: Record<string, string> = {
  active: 'danger',
  pending: 'warning',
  acknowledged: 'primary',
  silenced: 'default',
  resolved: 'success',
  error: 'danger',
};

// ============================================================================
// Monitor status
// ============================================================================

/**
 * Maps MonitorStatus values to OUI semantic badge color names.
 */
export const STATUS_COLORS: Record<string, string> = {
  active: 'danger',
  pending: 'warning',
  muted: 'default',
  disabled: 'subdued',
};

// ============================================================================
// Monitor health
// ============================================================================

/**
 * Maps MonitorHealthStatus values to OUI semantic Health color names.
 */
export const HEALTH_COLORS: Record<string, string> = {
  healthy: 'success',
  failing: 'danger',
  no_data: 'subdued',
};

// ============================================================================
// Monitor type display labels
// ============================================================================

/**
 * Human-readable labels for every MonitorType value, including
 * `cluster_metrics` which was missing in some component-local copies.
 */
export const TYPE_LABELS: Record<string, string> = {
  metric: 'Metric',
  log: 'Log',
  apm: 'APM',
  composite: 'Composite',
  infrastructure: 'Infrastructure',
  cluster_metrics: 'Cluster Metrics',
  synthetics: 'Synthetics',
};

// ============================================================================
// Formatting utilities
// ============================================================================

/**
 * Converts an ISO-8601 timestamp to a compact relative string such as
 * "5m ago", "2h ago", or "3d ago".  Returns "—" for falsy / unparseable input.
 */
export function formatRelativeTime(isoString: string): string {
  if (!isoString) return '—';

  const now = Date.now();
  const then = new Date(isoString).getTime();

  if (Number.isNaN(then)) return '—';

  const diffMs = now - then;

  // Future timestamps — show "just now" rather than negative durations.
  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Returns a user-friendly display name for a DatasourceType value.
 *   "opensearch" → "OpenSearch"
 *   "prometheus" → "Prometheus"
 * Falls back to the raw string with a capitalised first letter for unknown types.
 */
export function formatDatasourceType(type: string): string {
  switch (type) {
    case 'opensearch':
      return 'OpenSearch';
    case 'prometheus':
      return 'Prometheus';
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

// ============================================================================
// SLO status
// ============================================================================

/**
 * Maps SloStatus values to OUI semantic badge color names.
 */
export const SLO_STATUS_COLORS: Record<string, string> = {
  breached: 'danger',
  warning: 'warning',
  ok: 'success',
  no_data: 'subdued',
};

/**
 * Human-readable labels for SLI types.
 */
export const SLI_TYPE_LABELS: Record<string, string> = {
  availability: 'Availability',
  latency_p99: 'Latency (p99)',
  latency_p90: 'Latency (p90)',
  latency_p50: 'Latency (p50)',
};

/**
 * Short icon labels for SLI types (used in table type column).
 */
export const SLI_TYPE_ICONS: Record<string, string> = {
  availability: 'A',
  latency_p99: 'L',
  latency_p90: 'L',
  latency_p50: 'L',
};

/**
 * Icon background colors for SLI type badges.
 */
export const SLI_TYPE_ICON_COLORS: Record<string, { bg: string; color: string }> = {
  availability: { bg: '#E6F9F1', color: '#017D73' },
  latency_p99: { bg: '#e6f1fa', color: '#006BB4' },
  latency_p90: { bg: '#e6f1fa', color: '#006BB4' },
  latency_p50: { bg: '#e6f1fa', color: '#006BB4' },
};

/**
 * Format a decimal (e.g. 0.999) as a percentage string (e.g. "99.9%").
 * Handles edge cases like 1.0 (100%) and very small decimals.
 */
export function formatPercentage(decimal: number, decimals = 2): string {
  if (decimal === 0 || Number.isNaN(decimal)) return '—';
  return `${(decimal * 100).toFixed(decimals).replace(/\.?0+$/, '')}%`;
}

/**
 * Format error budget remaining as a display string.
 * Handles negative values (budget exhausted).
 */
export function formatErrorBudget(remaining: number): string {
  if (Number.isNaN(remaining)) return 'No data';
  const pct = Math.round(remaining * 100);
  if (pct < 0) return `${pct}%`;
  return `${pct}%`;
}

/**
 * Determine the text color for an error budget value.
 */
export function errorBudgetColor(remaining: number): string {
  if (remaining <= 0) return '#BD271E'; // danger
  if (remaining < 0.3) return '#F5A700'; // warning
  return '#017D73'; // success
}

/**
 * Determine the text color for an attainment value relative to target.
 */
export function attainmentColor(attainment: number, target: number): string {
  if (attainment === 0) return '#98A2B3'; // no data
  if (attainment < target) return '#BD271E'; // below target
  if (attainment < target + (1 - target) * 0.3) return '#F5A700'; // close to target
  return '#017D73'; // healthy
}

/**
 * Format latency in milliseconds or seconds depending on magnitude.
 */
export function formatLatency(seconds: number): string {
  if (seconds === 0 || Number.isNaN(seconds)) return '—';
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  return `${seconds.toFixed(2)}s`;
}

// ============================================================================
// HTML escaping
// ============================================================================

/**
 * Escape HTML special characters to prevent XSS in ECharts tooltip formatters
 * and other contexts where user-supplied strings are rendered as HTML.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validate an externally sourced URL (e.g. a runbook URL pulled from an alert
 * annotation) before using it in an `href`. Allows only `http:` and `https:`.
 * Returns `undefined` when the input is missing, unparseable, or uses a
 * disallowed protocol — blocks `javascript:`, `data:`, `file:`, etc.
 */
export function sanitizeExternalUrl(url: string | undefined): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

// ============================================================================
// Collection utilities
// ============================================================================

/**
 * Count occurrences of items grouped by a key function.
 * Generic replacement for lodash.countBy — used by alerts dashboard and charts.
 */
export function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}
