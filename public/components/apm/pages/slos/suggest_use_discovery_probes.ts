/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `useDiscoveryProbes` — fans out the OTel metric-family probes plus the
 * ruler-rules fetch the Suggest SLOs page needs before it can build
 * suggestions. Returns the materialised universe (metricNames /
 * labelValuesByMetric / existingRuleGroups) plus a `rulerFetchFailed` flag so
 * the page can warn the user that dedup against pre-existing recording rules
 * couldn't run.
 *
 * The probes are *intentionally* per-metric rather than via
 * `/metadata/metrics`: the latter is truncated server-side at 200 names
 * (alphabetical), which silently drops the families we need. Probing the
 * bucket/count metric directly bounds the traffic at ~12 requests regardless
 * of TSDB size, and label-values is cached (90s TTL) server-side so follow-up
 * loads are cheap. A family "exists" iff *any* of its probes returns a
 * non-empty label set — that's what the detectors in suggest_engine.ts check
 * too.
 */

import { useEffect, useState } from 'react';
import type { HttpStart } from '../../../../../../../src/core/public';
import type { PromRuleGroup } from '../../../../../common/types/alerting';
import type { LabelValuesByMetric, MetricLabelValues } from './suggest_engine';

interface OtelProbe {
  metric: string;
  labels: string[];
}

const OTEL_PROBES: OtelProbe[] = [
  { metric: 'http_server_request_duration_seconds_count', labels: ['service_name', 'job'] },
  { metric: 'http_server_request_duration_seconds_bucket', labels: ['service_name', 'job'] },
  { metric: 'rpc_server_duration_seconds_count', labels: ['rpc_service'] },
  { metric: 'rpc_server_duration_seconds_bucket', labels: ['rpc_service'] },
  { metric: 'db_client_operation_duration_seconds_bucket', labels: ['service_name', 'job'] },
  { metric: 'messaging_process_duration_seconds_bucket', labels: ['service_name', 'job'] },
  { metric: 'gen_ai_client_operation_duration_seconds_count', labels: ['service_name', 'job'] },
];

export interface DiscoveryProbesResult {
  metricNames: string[];
  labelValuesByMetric: LabelValuesByMetric;
  existingRuleGroups: PromRuleGroup[];
  /** True when the ruler-rules fetch fell through its catch — dedup against
   *  pre-existing rules can't run, so the page surfaces a warning callout. */
  rulerFetchFailed: boolean;
  loading: boolean;
}

export interface UseDiscoveryProbesArgs {
  http: HttpStart;
  datasourceId: string;
  /** Bumping this triggers a re-probe; covers the "Rediscover" button. */
  epoch: number;
}

export function useDiscoveryProbes({
  http,
  datasourceId,
  epoch,
}: UseDiscoveryProbesArgs): DiscoveryProbesResult {
  const [metricNames, setMetricNames] = useState<string[]>([]);
  const [labelValuesByMetric, setLabelValuesByMetric] = useState<LabelValuesByMetric>({});
  const [existingRuleGroups, setExistingRuleGroups] = useState<PromRuleGroup[]>([]);
  const [rulerFetchFailed, setRulerFetchFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!datasourceId) {
      setMetricNames([]);
      setLabelValuesByMetric({});
      setExistingRuleGroups([]);
      setRulerFetchFailed(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const labelPromises = OTEL_PROBES.flatMap((probe) =>
          probe.labels.map(async (label) => {
            // Pass `selector` through http.get's `query` option rather than
            // inline in the URL — OSD's http client URL-encodes every
            // reserved char in the path segment, including `?`, which would
            // swallow the selector into the final path component and make
            // the server return empty values.
            const url = `/api/alerting/prometheus/${encodeURIComponent(
              datasourceId
            )}/metadata/label-values/${encodeURIComponent(label)}`;
            try {
              const res = await http.get<{ values: string[] }>(url, {
                query: { selector: `{__name__="${probe.metric}"}` },
              });
              return { metric: probe.metric, label, values: res?.values ?? [] };
            } catch (err) {
              // Per-probe failure is expected (rejected by Cortex when the
              // metric family is absent). Log at warn level so the failure is
              // visible in dev tools without blowing up the discovery effect.

              console.warn('[slo-suggest] label-values probe failed for', probe.metric, label, err);
              return { metric: probe.metric, label, values: [] as string[] };
            }
          })
        );
        // Wrap the ruler fetch so we can distinguish "ruler responded with no
        // groups" (success, dedup runs against an empty universe) from "ruler
        // unreachable" (we surface a warning so the user knows duplicate
        // recording groups may be created if they proceed).
        const rulerPromise = http
          .get<{ data?: { groups?: PromRuleGroup[] } }>(
            `/api/alerting/prometheus/${encodeURIComponent(datasourceId)}/rules`
          )
          .then(
            (res) => ({ ok: true as const, groups: res?.data?.groups ?? [] }),
            (err) => {
              console.warn('[slo-suggest] ruler-rules fetch failed', err);
              return { ok: false as const, groups: [] as PromRuleGroup[] };
            }
          );

        const [labelResults, rulerRes] = await Promise.all([
          Promise.all(labelPromises),
          rulerPromise,
        ]);
        if (cancelled) return;

        // Aggregate per-metric label values. A metric is considered "present"
        // iff any of its probes returned values — we synthesise the metric
        // name list from that signal so the detectors' `has(metricName)`
        // checks continue to work.
        const labelsByMetric: LabelValuesByMetric = {};
        const presentMetrics = new Set<string>();
        for (const { metric, label, values } of labelResults) {
          const existing: MetricLabelValues = labelsByMetric[metric] ?? {};
          (existing as Record<string, string[]>)[label] = values;
          labelsByMetric[metric] = existing;
          if (values.length > 0) presentMetrics.add(metric);
        }
        setMetricNames([...presentMetrics]);
        setLabelValuesByMetric(labelsByMetric);
        setExistingRuleGroups(rulerRes.groups);
        setRulerFetchFailed(!rulerRes.ok);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [datasourceId, http, epoch]);

  return {
    metricNames,
    labelValuesByMetric,
    existingRuleGroups,
    rulerFetchFailed,
    loading,
  };
}
