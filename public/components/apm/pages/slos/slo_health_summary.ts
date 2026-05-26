/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared SLO health rollup for APM surfaces.
 *
 * `useServiceSloHealth` is the single source of truth for the Services Home
 * header panel, the per-row SLO health column, and the Service Details SLOs
 * tab. State is read point-in-time from server SLO summaries; each SLO
 * evaluates against its own rolling window, so the hook deliberately ignores
 * the caller's time range.
 *
 * The classification + rollup logic lives in `common/slo/classifier.ts` so
 * the server-side aggregate route and the client-side fallback share one
 * implementation. This module re-exports the common types for backward
 * compatibility with existing callers.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SloApiClient } from './slo_api_client';
import { classifySloKind, rollupSloHealth } from '../../../../../common/slo/classifier';
import type { CanonicalKind, SloHealthBucket } from '../../../../../common/slo/classifier';
import type {
  SloAggregateResponse,
  SloListFilters,
  SloSummary,
} from '../../../../../common/slo/slo_types';

// Re-export so existing callers (ChipRow, ServiceSloTab, tests) keep working
// against the hook's module without reaching into `common/slo/`.
export { classifySloKind, rollupSloHealth };
export type { CanonicalKind, SloHealthBucket };

export interface UseServiceSloHealthResult {
  bySvc: Map<string, SloHealthBucket>;
  aggregate: SloHealthBucket;
  isLoading: boolean;
  error: Error | undefined;
  refetch: () => void;
}

/**
 * UI-facing reduction of the raw hook error. `forbidden` renders a dedicated
 * "you don't have access" callout; `generic` surfaces the server message.
 */
export type SloHealthAccessError = { kind: 'generic'; message?: string } | { kind: 'forbidden' };

/**
 * Reduce a raw Error from `useServiceSloHealth` into the access-error
 * discriminator consumed by Services Home header + per-row cells and the
 * Service Details SLOs tab. Keep this alongside the hook so every caller
 * collapses errors the same way.
 */
export function toSloHealthAccessError(error: Error | undefined): SloHealthAccessError | undefined {
  if (!error) return undefined;
  const body = (error as { response?: { status?: number } }).response;
  if (body?.status === 403) return { kind: 'forbidden' };
  return { kind: 'generic', message: error.message };
}

export interface UseServiceSloHealthParams {
  serviceNames: string[];
  datasourceId: string;
  apiClient: SloApiClient;
}

// Sorted, newline-joined key lets React compare service sets by value rather
// than array identity — callers aren't required to memoize `serviceNames`.
function serviceNamesKey(names: string[]): string {
  return [...names].sort().join('\n');
}

const MIN_PAGE_SIZE = 50;
// Canonical pair = 2 availability + 2 latency per service; anything beyond
// that is unexpected and we log a warning before paging through.
const PER_SERVICE_BUDGET = 4;
// Server endpoint caps at 200 — stay in sync so the hook never hits a 400.
const MAX_SERVICES_PER_CALL = 200;

/**
 * Session-level latch: once the aggregate endpoint returns 404, skip it for
 * the remainder of this session and use the list fan-out instead. Intentional
 * — avoids retrying a known-missing endpoint on every mount. A server deploy
 * mid-session won't be picked up until the next page load.
 */
let aggregateEndpointUnavailable = false;

/**
 * Detect an OSD `IHttpFetchError` that surfaced as a 404 — meaning the
 * aggregate endpoint isn't registered (older server, pre-F1 build).
 */
function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const status = (err as { response?: { status?: number } }).response?.status;
  return status === 404;
}

function rollupBucketFromAggregateEntry(
  entry: SloAggregateResponse['bySvc'][string]
): SloHealthBucket {
  return {
    total: entry.total,
    ok: entry.ok,
    warning: entry.warning,
    breached: entry.breached,
    noData: entry.noData,
    stale: entry.stale,
    disabled: entry.disabled,
    rulesMissing: entry.rulesMissing,
    hasAvailability: entry.hasAvailability,
    hasLatency: entry.hasLatency,
    missingCanonicalPair: entry.missingCanonicalPair,
    slos: entry.slos,
  };
}

/**
 * Reduce a server aggregate envelope to the hook's `{ bySvc, aggregate }`
 * shape. The server never ships an `aggregate` field (callers rarely need a
 * true cross-service rollup beyond the `hasAvailability` / `hasLatency`
 * guards), so we recompute it locally from the per-service buckets — cheap
 * given the server also gates total services to ≤200.
 */
function fromAggregateResponse(
  serviceNames: string[],
  response: SloAggregateResponse
): { bySvc: Map<string, SloHealthBucket>; aggregate: SloHealthBucket } {
  const bySvc = new Map<string, SloHealthBucket>();
  for (const name of serviceNames) {
    const entry = response.bySvc[name];
    bySvc.set(name, entry ? rollupBucketFromAggregateEntry(entry) : emptyBucketFor());
  }

  const aggregate = emptyBucketFor();
  aggregate.hasAvailability = serviceNames.length > 0;
  aggregate.hasLatency = serviceNames.length > 0;
  for (const bucket of bySvc.values()) {
    aggregate.total += bucket.total;
    aggregate.ok += bucket.ok;
    aggregate.warning += bucket.warning;
    aggregate.breached += bucket.breached;
    aggregate.noData += bucket.noData;
    aggregate.stale += bucket.stale;
    aggregate.disabled += bucket.disabled;
    aggregate.rulesMissing += bucket.rulesMissing;
    aggregate.slos.push(...bucket.slos);
    if (!bucket.hasAvailability) aggregate.hasAvailability = false;
    if (!bucket.hasLatency) aggregate.hasLatency = false;
  }
  aggregate.missingCanonicalPair = !(aggregate.hasAvailability && aggregate.hasLatency);
  return { bySvc, aggregate };
}

function emptyBucketFor(): SloHealthBucket {
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

export const useServiceSloHealth = ({
  serviceNames,
  datasourceId,
  apiClient,
}: UseServiceSloHealthParams): UseServiceSloHealthResult => {
  const [state, setState] = useState<{
    bySvc: Map<string, SloHealthBucket>;
    aggregate: SloHealthBucket;
  }>(() => rollupSloHealth(serviceNames, []));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  const key = serviceNamesKey(serviceNames);
  // Capture the latest service-names snapshot without making the fetch effect
  // depend on array identity — avoids refetch churn when callers construct
  // the list inline.
  const serviceNamesRef = useRef(serviceNames);
  serviceNamesRef.current = serviceNames;

  useEffect(() => {
    const activeNames = serviceNamesRef.current;
    if (!datasourceId || activeNames.length === 0) {
      // Guard against unstable serviceNames array identity from callers that pass
      // a fresh array per render (e.g. ServiceSloTab passes [serviceName]).
      setState((prev) => (prev.aggregate.total === 0 ? prev : rollupSloHealth(activeNames, [])));
      setError((prev) => (prev === undefined ? prev : undefined));
      setIsLoading((prev) => (prev ? false : prev));
      return;
    }

    // Guard at the caller boundary: server rejects >200 services. Truncate
    // + warn so the hook still renders a partial panel rather than 400ing.
    let names = activeNames;
    if (names.length > MAX_SERVICES_PER_CALL) {
      console.warn(
        '[useServiceSloHealth] serviceNames (%d) exceeds cap (%d); truncating.',
        names.length,
        MAX_SERVICES_PER_CALL
      );
      names = names.slice(0, MAX_SERVICES_PER_CALL);
    }

    let cancelled = false;
    setIsLoading(true);
    setError(undefined);

    (async () => {
      // Primary path: server aggregate endpoint. One round-trip regardless of
      // service count. Fall back only on 404 (endpoint not registered).
      if (!aggregateEndpointUnavailable) {
        try {
          const response = await apiClient.aggregate({
            services: names,
            datasourceId,
          });
          if (cancelled) return;
          setState(fromAggregateResponse(names, response));
          setIsLoading(false);
          return;
        } catch (err) {
          if (cancelled) return;
          if (isNotFoundError(err)) {
            aggregateEndpointUnavailable = true;
            // Fall through to the client-side path below.
          } else {
            setError(err instanceof Error ? err : new Error(String(err)));
            setState(rollupSloHealth(names, []));
            setIsLoading(false);
            return;
          }
        }
      }

      // Fallback: client-side fan-out over `apiClient.list`. Kept intact
      // from pre-F1 for back-compat with older OSD servers.
      try {
        const pageSize = Math.max(MIN_PAGE_SIZE, names.length * PER_SERVICE_BUDGET);
        const baseFilters: SloListFilters = {
          service: names,
          datasourceId: [datasourceId],
          pageSize,
        };

        const first = await apiClient.list({ ...baseFilters, page: 1 });
        if (cancelled) return;

        const collected: SloSummary[] = [...first.results];
        if (first.total > collected.length) {
          console.warn(
            '[useServiceSloHealth] SLO total (%d) exceeds pageSize (%d); paging through.',
            first.total,
            pageSize
          );
          let page = 2;
          while (collected.length < first.total) {
            const next = await apiClient.list({ ...baseFilters, page });
            if (cancelled) return;
            if (next.results.length === 0) break;
            collected.push(...next.results);
            if (!next.hasMore) break;
            page += 1;
          }
        }

        if (!cancelled) {
          setState(rollupSloHealth(names, collected));
          setIsLoading(false);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setState(rollupSloHealth(names, []));
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `key` stands in for `serviceNames` content; `apiClient` identity is
    // stable across the caller's lifetime.
  }, [key, datasourceId, apiClient, refetchTrigger]);

  const result = useMemo(
    () => state,
    // `state` identity changes on every successful fetch; memo keeps
    // references stable between renders that don't trigger a refetch.
    [state]
  );

  const refetch = useCallback(() => {
    setRefetchTrigger((prev) => prev + 1);
  }, []);

  return { bySvc: result.bySvc, aggregate: result.aggregate, isLoading, error, refetch };
};

/**
 * Test-only hook reset. Clears the module-level fallback latch so each test
 * starts with the aggregate endpoint considered available. Not exported for
 * production callers — the latch intentionally persists for the session.
 */
export function __resetAggregateFallbackLatchForTests(): void {
  aggregateEndpointUnavailable = false;
}
