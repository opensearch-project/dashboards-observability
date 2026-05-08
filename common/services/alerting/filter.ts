/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Filtering and sorting utilities for monitors and alerts.
 */

export interface FilterState {
  status: string[];
  severity: string[];
  monitorType: string[];
  healthStatus: string[];
  labels: Record<string, string[]>;
  createdBy: string[];
  destinations: string[];
  backend: string[];
}

export function emptyFilters(): FilterState {
  return {
    status: [],
    severity: [],
    monitorType: [],
    healthStatus: [],
    labels: {},
    createdBy: [],
    destinations: [],
    backend: [],
  };
}

export function matchesSearch(
  rule: { name: string; labels: Record<string, string>; annotations: Record<string, string> },
  query: string
): boolean {
  if (!query) return true;
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every((term) => {
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

export function matchesFilters(
  rule: {
    status: string;
    severity: string;
    monitorType: string;
    healthStatus: string;
    labels: Record<string, string>;
    createdBy: string;
    datasourceType: string;
    notificationDestinations: string[];
  },
  filters: FilterState
): boolean {
  if (filters.status.length > 0 && !filters.status.includes(rule.status)) return false;
  if (filters.severity.length > 0 && !filters.severity.includes(rule.severity)) return false;
  if (filters.monitorType.length > 0 && !filters.monitorType.includes(rule.monitorType))
    return false;
  if (filters.healthStatus.length > 0 && !filters.healthStatus.includes(rule.healthStatus))
    return false;
  if (filters.createdBy.length > 0 && !filters.createdBy.includes(rule.createdBy)) return false;
  if (filters.backend.length > 0 && !filters.backend.includes(rule.datasourceType)) return false;
  if (filters.destinations.length > 0) {
    if (!rule.notificationDestinations.some((d) => filters.destinations.includes(d))) return false;
  }
  for (const [key, values] of Object.entries(filters.labels)) {
    if (values.length > 0) {
      const ruleVal = rule.labels[key];
      if (!ruleVal || !values.includes(ruleVal)) return false;
    }
  }
  return true;
}

export function sortRules<T>(
  rules: T[],
  field: string,
  direction: 'asc' | 'desc',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessor return type varies by field
  accessor?: (item: T, field: string) => any
): T[] {
  const sorted = [...rules];
  sorted.sort((a, b) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic field access for generic sort
    let aVal = accessor ? accessor(a, field) : (a as Record<string, any>)[field] ?? '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic field access for generic sort
    let bVal = accessor ? accessor(b, field) : (b as Record<string, any>)[field] ?? '';
    if (typeof aVal === 'string') aVal = aVal.toLowerCase();
    if (typeof bVal === 'string') bVal = bVal.toLowerCase();
    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
  return sorted;
}

export function filterAlerts<
  T extends {
    severity: string;
    state: string;
    labels: Record<string, string>;
    name: string;
    message?: string;
  }
>(
  alerts: T[],
  filters: {
    severity?: string[];
    state?: string[];
    labels?: Record<string, string[]>;
    search?: string;
  }
): T[] {
  return alerts.filter((a) => {
    if (filters.severity && filters.severity.length > 0 && !filters.severity.includes(a.severity))
      return false;
    if (filters.state && filters.state.length > 0 && !filters.state.includes(a.state)) return false;
    if (filters.labels) {
      for (const [key, values] of Object.entries(filters.labels)) {
        if (values.length > 0 && (!a.labels[key] || !values.includes(a.labels[key]))) return false;
      }
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (
        !a.name.toLowerCase().includes(q) &&
        !(a.message || '').toLowerCase().includes(q) &&
        !Object.values(a.labels).some((v) => v.toLowerCase().includes(q))
      ) {
        return false;
      }
    }
    return true;
  });
}
