/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Fetch fields-by-type for one or more indices via the alerting plugin's
 * `_mapping` proxy. Powers the timestamp-field selector and the PPL
 * editor's autocomplete.
 *
 * Requesting again with the same ds + index list short-circuits to the
 * already-loaded result so flipping between indices in the picker doesn't
 * re-issue the same call.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertingOpenSearchService } from '../query_services/alerting_opensearch_service';

export interface UseIndexMappingsParams {
  dsId: string;
  indices: string[];
}

export interface UseIndexMappingsResult {
  fieldsByType: Record<string, string[]>;
  isLoading: boolean;
  error: Error | null;
}

export function useIndexMappings({
  dsId,
  indices,
}: UseIndexMappingsParams): UseIndexMappingsResult {
  const service = useMemo(() => new AlertingOpenSearchService(), []);
  const [fieldsByType, setFieldsByType] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Sort the indices into a stable cache key so re-orders don't trigger a
  // refetch but actual additions/removals do.
  const cacheKey = useMemo(() => `${dsId}::${[...indices].sort().join(',')}`, [dsId, indices]);
  const lastKeyRef = useRef<string>('');

  // The `indices` array is captured as part of `cacheKey` (sorted-stable
  // join), so listing the array directly in deps would re-fire the effect
  // on every parent render due to array-reference churn — even though the
  // body short-circuits on cache hit, the effect cleanup/setup still runs
  // wastefully. Pin the deps to the stable string instead.
  // We still need `indices` at call-time, so a ref captures the latest
  // value without forcing the effect to re-run.
  const indicesRef = useRef<string[]>(indices);
  indicesRef.current = indices;

  useEffect(() => {
    if (!dsId || indicesRef.current.length === 0) {
      setFieldsByType({});
      return;
    }
    if (lastKeyRef.current === cacheKey) return;
    lastKeyRef.current = cacheKey;

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const result = await service.getFieldsByType(dsId, indicesRef.current);
        if (!cancelled) setFieldsByType(result);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [service, dsId, cacheKey]);

  return { fieldsByType, isLoading, error };
}
