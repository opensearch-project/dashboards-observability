/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { escapePromQLRegex } from '../../query_services/query_requests/escape_utils';
import { dependencyNamesFilter } from '../../query_services/query_requests/promql_queries';
import { isDependencyType } from './platform_utils';
import { chunkNames } from './name_batches';

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
  /**
   * The dependency rows to fetch, as bounded name batches (`remoteService=~"..."`). The
   * whole-range dependency queries always run per batch, never over every remote target: an
   * unbounded caller-derived latency query timed out (503) at large scale.
   */
  dependencyBatches: Array<{ names: string[]; filter: string }>;
  runServices: boolean;
  runDependencies: boolean;
}

export interface BuildScopeFiltersParams {
  catalog: ScopeNode[];
  scope: ScopeNode[];
  /**
   * Selected environments (exact values, e.g. `dev`, `eks:cluster/ns`) when the environment facet
   * is active. Matched as an `environment` label pattern, which stays short however many services
   * it keeps.
   */
  environments?: string[];
  /**
   * Whether the scope depends on more than the environment / type facets (search text, attribute
   * facets), which only a name list can express. Defaults to true.
   */
  needsNameList?: boolean;
}

/**
 * PromQL matcher for `label` equal to one of `environments` (PromQL regex matchers are anchored).
 */
export const environmentMatcher = (label: string, environments: string[]): string =>
  `${label}=~"${environments.map(escapePromQLRegex).join('|')}"`;

/**
 * PromQL filters bounding the instant (whole-range) queries to the rows a page's filters leave.
 * Unscoped, the queries run without a list filter and rely on `sum by (service)` grouping.
 */
export const buildScopeFilters = ({
  catalog,
  scope,
  environments,
  needsNameList = true,
}: BuildScopeFiltersParams): ScopeFilters => {
  const unique = (rows: ScopeNode[]) => Array.from(new Set(rows.map((s) => s.serviceName)));
  const batchesFor = (rows: ScopeNode[]) =>
    chunkNames(unique(rows.filter((s) => isDependencyType(s.type)))).map((names) => ({
      names,
      filter: dependencyNamesFilter(names),
    }));
  const unbounded: ScopeFilters = {
    bounded: false,
    fellBack: false,
    serviceFilter: '',
    dependencyFilter: undefined,
    // Caller-derived (remoteService=) queries run only when the catalog has dependency rows, so
    // a service-only catalog (feature off / older data) issues exactly the service queries.
    dependencyBatches: batchesFor(catalog),
    runServices: true,
    runDependencies: catalog.some((s) => isDependencyType(s.type)),
  };
  if (scope.length >= catalog.length) return unbounded;

  const dependencyBatches = batchesFor(scope);
  const serviceNames = unique(scope.filter((s) => !isDependencyType(s.type)));
  const dependencyNames = unique(scope.filter((s) => isDependencyType(s.type)));
  const run = {
    runServices: serviceNames.length > 0,
    runDependencies: dependencyNames.length > 0,
    dependencyBatches,
  };

  // Environment facet as a label matcher: one alternative per selected environment (not per
  // service), and a superset of the scope (rows are matched by key afterwards), so it is a valid
  // bound even when a name list is also needed. Unusable when so many environments are selected
  // that the matcher would exceed the query length budget.
  const hasEnvironments = !!environments && environments.length > 0;
  const environmentFilter = hasEnvironments ? environmentMatcher('environment', environments) : '';
  const byEnvironment =
    hasEnvironments && environmentFilter.length <= MAX_SCOPED_FILTER_CHARS
      ? {
          serviceFilter: environmentFilter,
          dependencyFilter: `remoteService!="",${environmentMatcher(
            'remoteEnvironment',
            environments
          )}`,
        }
      : null;

  if (!needsNameList && (byEnvironment || !hasEnvironments)) {
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
  // The name list is too long for one service query: services run unscoped, but only for the
  // kinds of rows in scope (a services-only filter still skips the dependency queries), and the
  // dependency rows still run in bounded batches.
  return { ...unbounded, fellBack: true, ...run };
};

/** Stable identity for a ScopeFilters value, for effect dependencies. */
export const scopeFiltersKey = (f: ScopeFilters): string =>
  [
    f.bounded,
    f.serviceFilter,
    f.dependencyFilter ?? '',
    f.runServices,
    f.runDependencies,
    (f.dependencyBatches ?? []).map((b) => b.filter).join('&'),
  ].join('|');

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
