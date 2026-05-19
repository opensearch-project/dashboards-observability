/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Debounced index/alias resolver for the Create flyout's "Define index"
 * combobox. Calls `_cat/indices` and `_cat/aliases` in parallel and merges
 * the results into a single de-duplicated suggestion list. Wildcards are
 * passed through to the backend as-is (e.g. `logs-*`, `prod-app-*`).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertingOpenSearchService,
  AliasSummary,
  IndexSummary,
} from '../query_services/alerting_opensearch_service';

export interface IndexOption {
  /** Concrete index name or alias label. */
  label: string;
  /** When this label is an alias, the underlying index it resolves to. */
  aliasFor?: string;
}

export interface UseIndicesParams {
  dsId: string;
  search: string;
  /** Debounce window in ms before firing the network call. Default 250. */
  debounceMs?: number;
}

export interface UseIndicesResult {
  options: IndexOption[];
  isLoading: boolean;
  error: Error | null;
}

const DEFAULT_DEBOUNCE_MS = 250;

export function useIndices({
  dsId,
  search,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseIndicesParams): UseIndicesResult {
  const service = useMemo(() => new AlertingOpenSearchService(), []);
  const [options, setOptions] = useState<IndexOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track the latest search string so a fast typist doesn't get a stale
  // network response written into state. Without this, racing requests
  // could flicker the dropdown back to an older suggestion list.
  const latestSearchRef = useRef(search);
  latestSearchRef.current = search;

  useEffect(() => {
    if (!dsId) {
      setOptions([]);
      return;
    }

    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setIsLoading(true);
      setError(null);
      try {
        // The reference plugin appends `*` for short queries to broaden the
        // match window — matches what users expect when typing prefixes.
        const padded = search.length === 0 ? '*' : search.includes('*') ? search : `${search}*`;
        const [indices, aliases] = await Promise.all([
          service.listIndices(dsId, padded),
          service.listAliases(dsId, padded),
        ]);
        if (cancelled || latestSearchRef.current !== search) return;
        setOptions(mergeOptions(indices, aliases));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [service, dsId, search, debounceMs]);

  return { options, isLoading, error };
}

function mergeOptions(indices: IndexSummary[], aliases: AliasSummary[]): IndexOption[] {
  const seen = new Set<string>();
  const out: IndexOption[] = [];
  for (const i of indices) {
    if (!i.index || seen.has(i.index)) continue;
    seen.add(i.index);
    out.push({ label: i.index });
  }
  for (const a of aliases) {
    if (!a.alias || seen.has(a.alias)) continue;
    seen.add(a.alias);
    out.push({ label: a.alias, aliasFor: a.index });
  }
  return out.sort((x, y) => x.label.localeCompare(y.label));
}
