/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Metric-discovery helpers for the Monitor Template Wizard. Matches a list of
 * observed Prometheus metric names against the static `APPLICATION_CATALOG`
 * and reports how many preconfigured alerts in each category are usable with
 * the currently-observed metrics.
 *
 * Contents:
 *   - `discoverApplications` — keep only categories that have at least one
 *     matching metric, annotating each with its `discoveredMetrics` list
 *   - `countAvailableTemplates` — per-category count of templates whose
 *     `requiredMetrics` are all present in `discoveredMetrics`
 */
import { APPLICATION_CATALOG, ApplicationCategory } from './alert_templates';

// ============================================================================
// Metric Discovery Engine
// ============================================================================

export function discoverApplications(metrics: string[]): ApplicationCategory[] {
  return APPLICATION_CATALOG.map((cat) => {
    const discovered = metrics.filter((m) =>
      cat.metricPrefixes.some((prefix) => (prefix === m ? true : m.startsWith(prefix)))
    );
    return { ...cat, discoveredMetrics: discovered };
  }).filter((cat) => cat.discoveredMetrics.length > 0);
}

export function countAvailableTemplates(
  cat: ApplicationCategory
): { available: number; total: number } {
  const available = cat.templates.filter((t) =>
    t.requiredMetrics.every((rm) => cat.discoveredMetrics.includes(rm))
  ).length;
  return { available, total: cat.templates.length };
}
