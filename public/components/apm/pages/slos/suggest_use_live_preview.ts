/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `useLivePreview` — drives the rule-group preview fan-out + per-row live SLI
 * fan-out for the suggest page's preview flyout. Owns its own cancellation
 * flag per effect so unmounting (or a new selection) can't race a stale
 * fetch's setState.
 */

import { useEffect, useMemo, useState } from 'react';
import { PromQLSearchService } from '../../query_services/promql_search_service';
import { getTimeInSeconds } from '../../shared/utils/time_utils';
import type { GeneratedRuleGroup, SloCreateInput } from '../../../../../common/slo/slo_types';
import type { SloApiClient } from './slo_api_client';
import type { Suggestion } from './suggest_engine';
import { WindowOption, buildLiveQueries, extractScalar, liveKindFor } from './suggest_live_queries';
import {
  LIVE_SLI_ROW_CONCURRENCY_LIMIT,
  PREVIEW_CONCURRENCY_LIMIT,
  withConcurrency,
} from './suggest_concurrency';

export interface PerPreview {
  key: string;
  suggestion: Suggestion;
  status: 'loading' | 'success' | 'error';
  group?: GeneratedRuleGroup;
  error?: string;
}

/** Live SLI signal computed against the current Prometheus datasource. */
export interface LiveSli {
  /** current SLI value in [0, 1] (availability fraction or fraction-under-threshold). */
  sliRatio?: number;
  /** total samples / requests observed in the window. */
  totalSamples?: number;
  /** observed p99 in milliseconds, only for latency_seconds_bucket-backed drafts. */
  p99Ms?: number;
  status: 'loading' | 'success' | 'error' | 'skipped';
  error?: string;
}

export interface UseLivePreviewArgs {
  apiClient: Pick<SloApiClient, 'preview'>;
  selectedSuggestions: Suggestion[];
  windowChoice: WindowOption;
  prometheusConnectionId?: string;
  prometheusConnectionMeta?: Record<string, unknown>;
}

export interface UseLivePreviewResult {
  previews: PerPreview[];
  liveByKey: Record<string, LiveSli>;
}

export function useLivePreview({
  apiClient,
  selectedSuggestions,
  windowChoice,
  prometheusConnectionId,
  prometheusConnectionMeta,
}: UseLivePreviewArgs): UseLivePreviewResult {
  // Serialize the selected inputs so effect re-runs only when the *content*
  // changes (override typing → new JSON → refetch). Reference equality of
  // the array would refetch every render.
  const serializedInputs = useMemo(
    () =>
      selectedSuggestions.map((s) => ({
        key: s.key,
        suggestion: s,
        body: JSON.stringify(s.input),
      })),
    [selectedSuggestions]
  );
  const serializedKey = useMemo(
    () => serializedInputs.map((r) => `${r.key}::${r.body}`).join('||'),
    [serializedInputs]
  );

  const [previews, setPreviews] = useState<PerPreview[]>([]);
  const [liveByKey, setLiveByKey] = useState<Record<string, LiveSli>>({});

  // --- Rule-group preview (server-generated YAML) ---
  useEffect(() => {
    let cancelled = false;
    setPreviews(
      serializedInputs.map((r) => ({
        key: r.key,
        suggestion: r.suggestion,
        status: 'loading',
      }))
    );
    // Bound the preview fan-out — opening the suggest page on a service tree
    // with hundreds of suggestions would otherwise issue all preview requests
    // at once. PREVIEW_CONCURRENCY_LIMIT keeps the browser's network queue
    // small enough that the page stays responsive while still loading row
    // previews fast.
    const results: PerPreview[] = new Array(serializedInputs.length);
    withConcurrency(
      PREVIEW_CONCURRENCY_LIMIT,
      serializedInputs.map((r, i) => ({ r, i })),
      async ({ r, i }) => {
        try {
          const group = await apiClient.preview(JSON.parse(r.body) as SloCreateInput);
          results[i] = {
            key: r.key,
            suggestion: r.suggestion,
            status: 'success',
            group,
          };
        } catch (e) {
          results[i] = {
            key: r.key,
            suggestion: r.suggestion,
            status: 'error',
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }
    ).then(() => {
      if (!cancelled) setPreviews(results);
    });
    return () => {
      cancelled = true;
    };
    // serializedKey gates re-fetch; serializedInputs is the payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiClient, serializedKey]);

  // --- Live SLI signals ---
  const promqlService = useMemo(() => {
    if (!prometheusConnectionId) return null;
    return new PromQLSearchService(prometheusConnectionId, prometheusConnectionMeta);
  }, [prometheusConnectionId, prometheusConnectionMeta]);

  useEffect(() => {
    if (!promqlService) {
      // Mark every row as skipped so the UI shows "–" instead of a spinner.
      const skipped: Record<string, LiveSli> = {};
      for (const r of serializedInputs) skipped[r.key] = { status: 'skipped' };
      setLiveByKey(skipped);
      return;
    }
    let cancelled = false;
    // Seed loading state for every row.
    const loading: Record<string, LiveSli> = {};
    for (const r of serializedInputs) loading[r.key] = { status: 'loading' };
    setLiveByKey(loading);

    const evalTime = getTimeInSeconds(new Date());
    // Bound per-row PromQL fan-out so a 200-suggestion table doesn't issue
    // 600 simultaneous instant queries against the Prometheus connection.
    // Inner per-row queries (3 of them) still fire in parallel; the outer
    // limit only gates how many rows are in flight at once.
    withConcurrency(LIVE_SLI_ROW_CONCURRENCY_LIMIT, serializedInputs, async (r) => {
      const kind = liveKindFor(r.suggestion);
      if (!kind) {
        if (!cancelled) setLiveByKey((prev) => ({ ...prev, [r.key]: { status: 'skipped' } }));
        return;
      }
      const queries = buildLiveQueries(kind, r.suggestion, windowChoice);
      const values = await Promise.all(
        queries.map((q) =>
          promqlService
            .executeInstantQuery({ query: q, time: evalTime })
            .then((resp) => extractScalar(resp))
            .catch(() => undefined)
        )
      );
      if (cancelled) return;
      const [ratio, samples, p99Ms] = values;
      setLiveByKey((prev) => ({
        ...prev,
        [r.key]: {
          status: 'success',
          sliRatio: Number.isFinite(ratio ?? NaN) ? (ratio as number) : undefined,
          totalSamples: Number.isFinite(samples ?? NaN) ? (samples as number) : undefined,
          p99Ms: Number.isFinite(p99Ms ?? NaN) ? (p99Ms as number) : undefined,
        },
      }));
    });
    return () => {
      cancelled = true;
    };
    // serializedKey/windowChoice gate re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promqlService, serializedKey, windowChoice]);

  return { previews, liveByKey };
}
