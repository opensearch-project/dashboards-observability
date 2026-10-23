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
import type { EmptyHistogram, LabelValuesByMetric, MetricLabelValues } from './suggest_engine';

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

/** Series selector for server-side span-derived request counts. */
const SPAN_DERIVED_SERVER_SELECTOR =
  '{__name__="request",namespace="span_derived",remoteService=""}';

/**
 * OTel latency histograms and the labels their series are attributed by.
 * Probed for services whose buckets never recorded anything — see
 * `findEmptyHistograms`.
 */
const LATENCY_HISTOGRAMS: OtelProbe[] = [
  { metric: 'http_server_request_duration_seconds_bucket', labels: ['service_name', 'job'] },
  { metric: 'rpc_server_duration_seconds_bucket', labels: ['rpc_service'] },
  { metric: 'db_client_operation_duration_seconds_bucket', labels: ['service_name', 'job'] },
  { metric: 'messaging_process_duration_seconds_bucket', labels: ['service_name', 'job'] },
];

export interface DiscoveryProbesResult {
  /**
   * Latency histograms whose buckets recorded nothing over the last hour for a
   * service even though the series exist — the producer exports `_count` but
   * leaves every bucket (including `+Inf`) at 0, so no latency SLI can be
   * computed. The engine skips latency drafts for these.
   */
  emptyHistograms: EmptyHistogram[];
  /**
   * Services with server-side span-derived RED metrics (`request` with
   * `remoteService=""`). A service can appear in the trace service list
   * without them — e.g. it only makes outgoing calls or consumes from a
   * queue — and an APM SLO on it could never report a value. `undefined`
   * when the probe failed or found none, so callers don't filter on missing
   * information.
   */
  spanDerivedServices: string[] | undefined;
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
  /** Bump to force the probe + ruler fetch to re-run (the "Rediscover" button). */
  epoch?: number;
  /** Datasource meta forwarded on PromQL probes (MDS / data-connection routing). */
  prometheusConnectionMeta?: Record<string, unknown>;
}

export function useDiscoveryProbes({
  http,
  datasourceId,
  epoch = 0,
  prometheusConnectionMeta,
}: UseDiscoveryProbesArgs): DiscoveryProbesResult {
  const [emptyHistograms, setEmptyHistograms] = useState<EmptyHistogram[]>([]);
  const [spanDerivedServices, setSpanDerivedServices] = useState<string[] | undefined>();
  const metaKey = JSON.stringify(prometheusConnectionMeta ?? null);
  const [metricNames, setMetricNames] = useState<string[]>([]);
  const [labelValuesByMetric, setLabelValuesByMetric] = useState<LabelValuesByMetric>({});
  const [existingRuleGroups, setExistingRuleGroups] = useState<PromRuleGroup[]>([]);
  const [rulerFetchFailed, setRulerFetchFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!datasourceId) {
      setEmptyHistograms([]);
      setSpanDerivedServices(undefined);
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
              // Per-probe failure is expected (rejected by Prometheus when the
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

        const spanServicesPromise = http
          .get<{ values: string[] }>(
            `/api/alerting/prometheus/${encodeURIComponent(
              datasourceId
            )}/metadata/label-values/service`,
            { query: { selector: SPAN_DERIVED_SERVER_SELECTOR } }
          )
          .then(
            // Empty = no positive signal (e.g. span metrics live elsewhere):
            // report unknown rather than filtering every APM draft out.
            (res) => (res?.values?.length ? res.values : undefined),
            (err) => {
              console.warn('[slo-suggest] span-derived services probe failed', err);
              return undefined;
            }
          );

        const [labelResults, rulerRes, spanServices] = await Promise.all([
          Promise.all(labelPromises),
          rulerPromise,
          spanServicesPromise,
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
        const empty = await findEmptyHistograms(
          http,
          datasourceId,
          prometheusConnectionMeta,
          LATENCY_HISTOGRAMS.filter((h) => presentMetrics.has(h.metric))
        );
        if (cancelled) return;
        setEmptyHistograms(empty);
        setSpanDerivedServices(spanServices);
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
    // Keyed on the serialized meta: callers often pass a fresh object each
    // render, which would otherwise re-run every probe on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasourceId, http, epoch, metaKey]);

  return {
    emptyHistograms,
    spanDerivedServices,
    metricNames,
    labelValuesByMetric,
    existingRuleGroups,
    rulerFetchFailed,
    loading,
  };
}

/**
 * For each present latency histogram, find the (label, value) attributions
 * whose buckets recorded nothing over the last hour: `== 0` keeps only those
 * rows, so services without the metric at all never appear. Best effort — a
 * failed probe returns nothing and no draft is skipped.
 */
async function findEmptyHistograms(
  http: HttpStart,
  connectionId: string,
  meta: Record<string, unknown> | undefined,
  histograms: OtelProbe[]
): Promise<EmptyHistogram[]> {
  const queries = histograms.flatMap((h) =>
    h.labels.map((label) => ({
      metric: h.metric,
      label,
      // Every bucket series, not just `+Inf`: a series-wide sum is 0 only
      // when no bucket recorded anything, whatever the bucket layout.
      query: `sum by (${label}) (increase(${h.metric}[1h])) == 0`,
    }))
  );
  const results = await Promise.all(
    queries.map(async ({ metric, label, query }) => {
      try {
        const res = await http.post<{ body?: unknown }>('/api/enhancements/search/promql', {
          body: JSON.stringify({
            query: {
              query,
              language: 'PROMQL',
              dataset: { id: connectionId, type: 'PROMETHEUS', dataSource: { meta } },
              format: 'jdbc',
            },
            timeRange: { from: 'now-5m', to: 'now' },
          }),
        });
        return labelValuesFromFrame(res?.body ?? res, label).map((value) => ({
          metric,
          label,
          value,
        }));
      } catch (err) {
        console.warn('[slo-suggest] empty-histogram probe failed for', metric, label, err);
        return [] as EmptyHistogram[];
      }
    })
  );
  return results.flat();
}

/** Pull one label's values out of a PromQL search response (data frame or instant rows). */
export function labelValuesFromFrame(body: unknown, label: string): string[] {
  const b = body as {
    fields?: Array<{ name: string; values: unknown[] }>;
    meta?: { instantData?: { rows?: Array<Record<string, unknown>> } };
  };
  const out = new Set<string>();
  for (const row of b?.meta?.instantData?.rows ?? []) {
    const v = row[label];
    if (typeof v === 'string' && v) out.add(v);
  }
  const labels = b?.fields?.find((f) => f.name === 'Labels')?.values ?? [];
  for (const l of labels) {
    const v = (l as Record<string, unknown> | null)?.[label];
    if (typeof v === 'string' && v) out.add(v);
  }
  return [...out];
}
