/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { coreRefs } from '../../../../framework/core_refs';
import { APM_RED_REQUIRED_METRICS } from '../../common/constants';
import { mapInChunks, PROBE_CONCURRENCY } from '../utils/apm_auto_detect';

/** A Prometheus data source candidate to check for RED metrics. */
export interface PrometheusCandidate {
  /** Saved-object id — stored in the APM config. */
  id: string;
  /** Connection id (directQueryName) — used to call the metadata endpoint. */
  name: string;
}

/** RED-metric check result for a single Prometheus data source. */
export interface MetricCheckResult {
  id: string;
  name: string;
  /** Required metrics found on this data source. */
  found: string[];
  /** Required metrics missing from this data source. */
  missing: string[];
  /** True when every required RED metric was found. */
  matches: boolean;
  /** Set when the metadata probe failed for this data source. */
  error?: string;
}

/**
 * Exact-membership test for one metric on one data source. The metadata metrics
 * endpoint filters by substring `search`, so we pass the metric name to narrow
 * the response and then confirm the exact name is present — a substring match
 * (e.g. `request` inside `app_frontend_requests_total`) does not count.
 */
async function metricExists(connectionId: string, metric: string): Promise<boolean> {
  const http = coreRefs.http;
  if (!http) return false;
  const response = (await http.get(
    `/api/alerting/prometheus/${encodeURIComponent(connectionId)}/metadata/metrics`,
    { query: { search: metric } }
  )) as { metrics?: string[] };
  return Array.isArray(response?.metrics) && response.metrics.includes(metric);
}

/**
 * Check each candidate Prometheus data source for the required RED metrics.
 * Returns one result per candidate (found/missing/matches). The wizard never
 * creates a data source — it only reports which existing ones qualify.
 */
export const usePrometheusMetricCheck = (candidates: PrometheusCandidate[]) => {
  const [results, setResults] = useState<MetricCheckResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Serialize the candidate identity so the effect re-runs only when the set
  // actually changes (not on every parent render that rebuilds the array).
  const candidateKey = candidates.map((c) => `${c.id}:${c.name}`).join('|');

  useEffect(() => {
    if (candidates.length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      // Each candidate fires one request per required metric, so probe in
      // fixed-size concurrent chunks rather than all candidates × metrics at once.
      const checked = await mapInChunks(candidates, PROBE_CONCURRENCY, async (candidate) => {
        try {
          const presence = await Promise.all(
            APM_RED_REQUIRED_METRICS.map(async (metric) => ({
              metric,
              exists: await metricExists(candidate.name, metric),
            }))
          );
          const found = presence.filter((p) => p.exists).map((p) => p.metric);
          const missing = presence.filter((p) => !p.exists).map((p) => p.metric);
          return {
            id: candidate.id,
            name: candidate.name,
            found,
            missing,
            matches: missing.length === 0,
          } as MetricCheckResult;
        } catch (error) {
          return {
            id: candidate.id,
            name: candidate.name,
            found: [],
            missing: [...APM_RED_REQUIRED_METRICS],
            matches: false,
            error: error instanceof Error ? error.message : String(error),
          } as MetricCheckResult;
        }
      });

      if (!cancelled) {
        setResults(checked);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateKey]);

  return { results, loading };
};
