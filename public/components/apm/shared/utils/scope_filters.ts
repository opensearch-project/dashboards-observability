/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { escapePromQLRegex } from '../../query_services/query_requests/escape_utils';
import { dependencyNamesFilter } from '../../query_services/query_requests/promql_queries';
import { isDependencyType } from './platform_utils';

/**
 * Above this length a name list is not embedded in a query, keeping every query clear of the
 * 10,000-char PromQL limit (the dependency failure-ratio query repeats its selector six times).
 */
export const MAX_SCOPED_FILTER_CHARS = 1200;

export interface ScopeNode {
  serviceName: string;
  environment?: string;
  type?: string;
}

export interface ScopeFilters {
  /** The queries are narrowed to the scope; results cover only the scoped rows. */
  bounded: boolean;
  /**
   * The page is filtered, but the filter could not be pushed into the queries (name list too long
   * and no label matcher applies), so they scan every service. The page should say so.
   */
  fellBack: boolean;
  /** Selector fragment for SERVER-span (service) queries, e.g. `service=~"a|b"`. */
  serviceFilter: string;
  /** `remoteFilter` for caller-derived (dependency) queries; undefined means every target. */
  dependencyFilter?: string;
  runServices: boolean;
  runDependencies: boolean;
}

export interface BuildScopeFiltersParams {
  catalog: ScopeNode[];
  scope: ScopeNode[];
  /**
   * Selected environment platforms (e.g. `eks`, `generic`) when the environment facet is active.
   * Matched as an `environment` label pattern, which stays short however many services it keeps.
   */
  environmentPlatforms?: string[];
  /**
   * Whether the scope depends on more than the environment / type facets (search text, attribute
   * facets), which only a name list can express. Defaults to true.
   */
  needsNameList?: boolean;
}

/**
 * Anchored PromQL regex for environment values whose platform (the part before `:`, compared
 * case-insensitively, see parseEnvironmentType) is one of `platforms`. A value without `:` is the
 * `generic` platform.
 */
export const environmentPlatformMatcher = (label: string, platforms: string[]): string => {
  const alternatives = platforms.map((p) => `(?i:${escapePromQLRegex(p)}):.*`);
  if (platforms.some((p) => p.toLowerCase() === 'generic')) alternatives.push('[^:]*');
  return `${label}=~"${alternatives.join('|')}"`;
};

/**
 * PromQL filters bounding the instant (whole-range) queries to the rows a page's filters leave.
 * Unscoped, the queries run without a list filter and rely on `sum by (service)` grouping.
 */
export const buildScopeFilters = ({
  catalog,
  scope,
  environmentPlatforms,
  needsNameList = true,
}: BuildScopeFiltersParams): ScopeFilters => {
  const unbounded: ScopeFilters = {
    bounded: false,
    fellBack: false,
    serviceFilter: '',
    dependencyFilter: undefined,
    // Caller-derived (remoteService=) queries run only when the catalog has dependency rows, so
    // a service-only catalog (feature off / older data) issues exactly the service queries.
    runServices: true,
    runDependencies: catalog.some((s) => isDependencyType(s.type)),
  };
  if (scope.length >= catalog.length) return unbounded;

  const unique = (rows: ScopeNode[]) => Array.from(new Set(rows.map((s) => s.serviceName)));
  const serviceNames = unique(scope.filter((s) => !isDependencyType(s.type)));
  const dependencyNames = unique(scope.filter((s) => isDependencyType(s.type)));
  const run = { runServices: serviceNames.length > 0, runDependencies: dependencyNames.length > 0 };

  // Environment facet as a label matcher: short at any scale, and a superset of the scope (rows
  // are matched by key afterwards), so it is a valid bound even when a name list is also needed.
  const byEnvironment =
    environmentPlatforms && environmentPlatforms.length > 0
      ? {
          serviceFilter: environmentPlatformMatcher('environment', environmentPlatforms),
          dependencyFilter: `remoteService!="",${environmentPlatformMatcher(
            'remoteEnvironment',
            environmentPlatforms
          )}`,
        }
      : null;

  if (!needsNameList) {
    // Only the environment / type facets: the label matcher (or no list at all, for a type-only
    // filter, which just skips the service or dependency queries) expresses the scope exactly.
    return { bounded: true, fellBack: false, ...(byEnvironment ?? { serviceFilter: '' }), ...run };
  }

  const serviceFilter =
    serviceNames.length > 0 ? `service=~"${serviceNames.map(escapePromQLRegex).join('|')}"` : '';
  const dependencyFilter =
    dependencyNames.length > 0 ? dependencyNamesFilter(dependencyNames) : undefined;
  if (
    serviceFilter.length <= MAX_SCOPED_FILTER_CHARS &&
    (dependencyFilter?.length ?? 0) <= MAX_SCOPED_FILTER_CHARS
  ) {
    return { bounded: true, fellBack: false, serviceFilter, dependencyFilter, ...run };
  }
  if (byEnvironment) return { bounded: true, fellBack: false, ...byEnvironment, ...run };
  return { ...unbounded, fellBack: true };
};

/** Stable identity for a ScopeFilters value, for effect dependencies. */
export const scopeFiltersKey = (f: ScopeFilters): string =>
  [f.bounded, f.serviceFilter, f.dependencyFilter ?? '', f.runServices, f.runDependencies].join(
    '|'
  );

/** A page's filtered scope, as passed to widgets that query alongside the page's table. */
export interface PageScope {
  filters: ScopeFilters;
  /** The rows the page's filters leave (before metric-range filters). */
  services: ScopeNode[];
}

/**
 * topk size for a scoped widget: the query filter can be broader than the scope (a name matches
 * in other environments, a label matcher keeps more rows), so rows are re-checked against the
 * scope and a larger topk keeps the top `limit` from coming up short.
 */
export const SCOPED_TOPK = 50;
