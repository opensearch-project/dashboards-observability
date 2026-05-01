/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Monitors table filters — filter state shape + pure filter/suggestion
 * helpers used by the main `MonitorsTable` component. Extracted from the
 * monolithic `monitors_table.tsx` so the matching logic can be unit-tested
 * in isolation and so the main component file stays focused on render.
 *
 * Contents:
 *   - `FilterState` interface + `emptyFilters()` factory
 *   - `buildSuggestions` — typeahead suggestion list
 *   - `matchesSearch` — full-text + `label:value` search matcher
 *   - `matchesFilters` — facet filter matcher
 *   - `collectLabelKeys` / `collectLabelValues` — label enumeration
 *   - `collectUniqueValues` — unique-value collector over a projection
 */
import {
  MonitorHealthStatus,
  MonitorStatus,
  MonitorType,
  UnifiedAlertSeverity,
  UnifiedRuleSummary,
} from '../../../../common/types/alerting';

// ============================================================================
// Types
// ============================================================================

export interface FilterState {
  status: MonitorStatus[];
  severity: UnifiedAlertSeverity[];
  monitorType: MonitorType[];
  healthStatus: MonitorHealthStatus[];
  labels: Record<string, string[]>;
  createdBy: string[];
  destinations: string[];
  backend: string[];
}

export const emptyFilters = (): FilterState => ({
  status: [],
  severity: [],
  monitorType: [],
  healthStatus: [],
  labels: {},
  createdBy: [],
  destinations: [],
  backend: [],
});

// ============================================================================
// Suggestion Engine
// ============================================================================

export function buildSuggestions(rules: UnifiedRuleSummary[]): string[] {
  const set = new Set<string>();
  for (const r of rules) {
    set.add(r.name);
    for (const [k, v] of Object.entries(r.labels)) {
      set.add(`${k}:${v}`);
      set.add(v);
    }
    for (const v of Object.values(r.annotations)) {
      if (v.length < 80) set.add(v);
    }
  }
  return Array.from(set).sort();
}

export function matchesSearch(rule: UnifiedRuleSummary, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  return terms.every((term) => {
    // Support label:value syntax
    if (term.includes(':')) {
      const [key, val] = term.split(':', 2);
      const labelVal = rule.labels[key];
      if (labelVal && labelVal.toLowerCase().includes(val)) return true;
      const annoVal = rule.annotations[key];
      if (annoVal && annoVal.toLowerCase().includes(val)) return true;
    }
    if (rule.name.toLowerCase().includes(term)) return true;
    for (const v of Object.values(rule.labels)) {
      if (v.toLowerCase().includes(term)) return true;
    }
    for (const v of Object.values(rule.annotations)) {
      if (v.toLowerCase().includes(term)) return true;
    }
    return false;
  });
}

export function matchesFilters(rule: UnifiedRuleSummary, filters: FilterState): boolean {
  if (filters.status.length > 0 && !filters.status.includes(rule.status)) return false;
  if (filters.severity.length > 0 && !filters.severity.includes(rule.severity)) return false;
  if (filters.monitorType.length > 0 && !filters.monitorType.includes(rule.monitorType))
    return false;
  if (filters.healthStatus.length > 0 && !filters.healthStatus.includes(rule.healthStatus))
    return false;
  if (filters.createdBy.length > 0 && !filters.createdBy.includes(rule.createdBy)) return false;
  if (filters.backend.length > 0 && !filters.backend.includes(rule.datasourceType)) return false;
  if (filters.destinations.length > 0) {
    const hasMatch = rule.notificationDestinations.some((d) => filters.destinations.includes(d));
    if (!hasMatch) return false;
  }
  for (const [key, values] of Object.entries(filters.labels)) {
    if (values.length > 0) {
      const ruleVal = rule.labels[key];
      if (!ruleVal || !values.includes(ruleVal)) return false;
    }
  }
  return true;
}

// ============================================================================
// All unique label keys from rules
// ============================================================================

export function collectLabelKeys(rules: UnifiedRuleSummary[]): string[] {
  const keys = new Set<string>();
  for (const r of rules) {
    for (const k of Object.keys(r.labels)) keys.add(k);
  }
  return Array.from(keys).sort();
}

export function collectUniqueValues(
  rules: UnifiedRuleSummary[],
  field: (r: UnifiedRuleSummary) => string | string[]
): string[] {
  const set = new Set<string>();
  for (const r of rules) {
    const val = field(r);
    if (Array.isArray(val)) val.forEach((v) => set.add(v));
    else if (val) set.add(val);
  }
  return Array.from(set).sort();
}

export function collectLabelValues(rules: UnifiedRuleSummary[], key: string): string[] {
  const set = new Set<string>();
  for (const r of rules) {
    const v = r.labels[key];
    if (v) set.add(v);
  }
  return Array.from(set).sort();
}
