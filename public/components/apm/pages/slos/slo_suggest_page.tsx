/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * "Suggest SLOs" page — enumerates the APM services the plugin already sees
 * (same PPL discovery path as Services Home: `useServices`), then drafts a
 * pair of SLOs per service (availability + latency on span-derived RED
 * metrics). The user reviews, tweaks, and creates in one batch.
 *
 * Nothing ships alerting rules until the user clicks "Create N selected";
 * every draft is a harmless client-side object until then.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiBasicTable,
  EuiBasicTableColumn,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonGroup,
  EuiButtonIcon,
  EuiCallOut,
  EuiCheckbox,
  EuiCode,
  EuiCodeBlock,
  EuiConfirmModal,
  EuiFieldNumber,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiIcon,
  EuiIconTip,
  EuiLink,
  EuiLoadingSpinner,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPageContentBody,
  EuiPanel,
  EuiProgress,
  EuiSpacer,
  EuiStat,
  EuiTitle,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { useHistory, useLocation } from 'react-router-dom';
import { ChromeStart, HttpStart, NotificationsStart } from '../../../../../../../src/core/public';
import { toMountPoint } from '../../../../../../../src/plugins/opensearch_dashboards_react/public';
import { HeaderControlledComponentsWrapper } from '../../../../plugin_helpers/plugin_headerControl';
import { useApmConfig } from '../../config/apm_config_context';
import { useServices } from '../../shared/hooks/use_services';
import { parseTimeRange, getTimeInSeconds } from '../../shared/utils/time_utils';
import { PromQLSearchService } from '../../query_services/promql_search_service';
import type {
  GeneratedRuleGroup,
  SloCreateInput,
  SloSummary,
} from '../../../../../common/slo/slo_types';
import type { PromRuleGroup } from '../../../../../common/types/alerting';
import type { SloApiClient } from './slo_api_client';
import { templateIconFor } from './template_icons';
import {
  DiscoveredService,
  LabelValuesByMetric,
  MetricLabelValues,
  Suggestion,
  generateSuggestionsForServices,
} from './suggest_engine';
import {
  buildLiveQueries,
  extractScalar,
  formatSamples,
  liveKindFor,
  WindowOption,
} from './suggest_live_queries';
import { parseSuggestScopeFromSearch } from './slo_suggest_scope';

export interface SloSuggestPageProps {
  apiClient: SloApiClient;
  http: HttpStart;
  chrome: ChromeStart;
  notifications: NotificationsStart;
  parentBreadcrumb: { text: string; href: string };
}

// ============================================================================
// Main component
// ============================================================================

export const SloSuggestPage: React.FC<SloSuggestPageProps> = ({
  apiClient,
  chrome,
  http,
  notifications,
  parentBreadcrumb,
}) => {
  const history = useHistory();
  const location = useLocation();
  const scope = useMemo(() => parseSuggestScopeFromSearch(location.search), [location.search]);
  const { config, loading: configLoading } = useApmConfig();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Per-suggestion overrides users type into the card. */
  const [overrides, setOverrides] = useState<
    Record<
      string,
      { ownerTeam?: string; tier?: string; target?: string; latencyThreshold?: string }
    >
  >({});
  const [creating, setCreating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    chrome.setBreadcrumbs([
      parentBreadcrumb,
      { text: 'SLO/SLI', href: '#/slos' },
      { text: 'Suggest' },
    ]);
  }, [chrome, parentBreadcrumb]);

  // Use the Prometheus datasource the APM config points at — same one the SLO
  // wizard writes SLOs against. Users who want a different datasource edit the
  // APM config rather than picking here.
  const datasourceId = config?.prometheusDataSource?.name ?? '';

  // Same time range as Services Home's default (15m) — discovery is only about
  // "does this service emit traces right now?", not historical enumeration.
  const timeRange = useMemo(() => ({ from: 'now-15m', to: 'now' }), []);
  const parsedTimeRange = useMemo(() => parseTimeRange(timeRange), [timeRange]);

  const {
    data: allDiscoveredServices,
    isLoading: servicesLoading,
    error: servicesError,
    refetch,
  } = useServices({
    startTime: parsedTimeRange.startTime,
    endTime: parsedTimeRange.endTime,
  });

  // Apply URL scope before the `services.length === 0` guard in `suggestions`.
  // A stale deep link (scope names nothing discovery sees) falls back to the
  // full list so the page stays usable; the UI still surfaces the miss.
  const scopedServices = useMemo(() => {
    if (!scope.services) return allDiscoveredServices;
    const allow = new Set(scope.services);
    const filtered = allDiscoveredServices.filter((s) => allow.has(s.serviceName));
    return filtered.length > 0 ? filtered : allDiscoveredServices;
  }, [allDiscoveredServices, scope.services]);

  const scopeFellThrough =
    scope.services !== undefined &&
    allDiscoveredServices.length > 0 &&
    allDiscoveredServices.every((s) => !scope.services!.includes(s.serviceName));

  const services = scopedServices;

  // Prometheus metric universe + label values. Used to decide which OTel
  // detectors fire and to scope each OTel draft to the right label selector.
  // Populated lazily after the APM service list lands.
  const [metricNames, setMetricNames] = useState<string[]>([]);
  const [labelValuesByMetric, setLabelValuesByMetric] = useState<LabelValuesByMetric>({});
  const [existingRuleGroups, setExistingRuleGroups] = useState<PromRuleGroup[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  /** Bumping this triggers the discovery effect; covers the "Rediscover" button. */
  const [discoveryEpoch, setDiscoveryEpoch] = useState(0);

  useEffect(() => {
    if (!datasourceId) {
      setMetricNames([]);
      setLabelValuesByMetric({});
      setExistingRuleGroups([]);
      return;
    }
    let cancelled = false;
    setDiscoveryLoading(true);
    (async () => {
      try {
        // Probe each OTel metric family directly via
        // `/metadata/label-values/<label>?selector={__name__="<metric>"}`.
        // We intentionally skip `/metadata/metrics` and the label/__name__
        // fallback: both are truncated server-side at 200 names (alphabetical),
        // which drops the `http_*`, `rpc_*`, etc. families we need. Probing
        // the bucket/count metric directly bounds the traffic at ~12 requests
        // regardless of TSDB size, and label-values is cached (90s TTL)
        // server-side so follow-up loads are cheap.
        //
        // A family "exists" iff *any* of its probes returns a non-empty label
        // set — that's what the detectors in suggest_engine.ts check too.
        const OTEL_PROBES: Array<{ metric: string; labels: string[] }> = [
          { metric: 'http_server_request_duration_seconds_count', labels: ['service_name', 'job'] },
          {
            metric: 'http_server_request_duration_seconds_bucket',
            labels: ['service_name', 'job'],
          },
          { metric: 'rpc_server_duration_seconds_count', labels: ['rpc_service'] },
          { metric: 'rpc_server_duration_seconds_bucket', labels: ['rpc_service'] },
          {
            metric: 'db_client_operation_duration_seconds_bucket',
            labels: ['service_name', 'job'],
          },
          {
            metric: 'messaging_process_duration_seconds_bucket',
            labels: ['service_name', 'job'],
          },
          {
            metric: 'gen_ai_client_operation_duration_seconds_count',
            labels: ['service_name', 'job'],
          },
        ];
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
            } catch {
              return { metric: probe.metric, label, values: [] as string[] };
            }
          })
        );
        const rulerPromise = http
          .get<{ data?: { groups?: PromRuleGroup[] } }>(
            `/api/alerting/prometheus/${encodeURIComponent(datasourceId)}/rules`
          )
          .catch(() => ({ data: { groups: [] as PromRuleGroup[] } }));

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
        setExistingRuleGroups(rulerRes?.data?.groups ?? []);
      } finally {
        if (!cancelled) setDiscoveryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [datasourceId, http, discoveryEpoch]);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!datasourceId || !services || services.length === 0) return [];
    const discovered: DiscoveredService[] = services.map((s) => ({
      serviceName: s.serviceName,
      environment: s.environment,
    }));
    return generateSuggestionsForServices({
      datasourceId,
      services: discovered,
      metricNames,
      labelValuesByMetric,
      existingRuleGroups,
    });
  }, [datasourceId, services, metricNames, labelValuesByMetric, existingRuleGroups]);

  // Default every suggestion to "selected" when the list changes — EXCEPT
  // those already covered by an existing Prometheus rule. Users can re-check
  // covered drafts explicitly if they want a duplicate, but the common case
  // is "leave them unchecked so we don't dual-write".
  useEffect(() => {
    setSelected(new Set(suggestions.filter((s) => !s.existingRuleMatch).map((s) => s.key)));
  }, [suggestions]);

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const setOverride = useCallback((key: string, patch: Partial<typeof overrides[string]>) => {
    setOverrides((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  const applyOverrides = useCallback(
    (s: Suggestion): Suggestion => {
      const o = overrides[s.key] ?? {};
      // Stamp canonicalKind from the suggestion so readers can classify
      // without re-running the heuristic. M5A: tag wins, heuristic fallback.
      const spec = { ...s.input.spec, canonicalKind: s.kindId };
      if (o.ownerTeam && o.ownerTeam.trim()) {
        spec.owner = { ...spec.owner, teams: [o.ownerTeam.trim()] };
      }
      if (o.tier && o.tier.trim()) {
        spec.tier = o.tier.trim();
      }
      if (o.target) {
        // Override is stored as the raw percentage string the user typed
        // (e.g. "99.9"); convert to the spec's decimal-fraction form here.
        // Storing the raw string avoids the React-controlled-input feedback
        // loop where dividing by 100 on every keystroke clobbers the
        // mid-edit value (e.g. typing "9" → store "0.09" → re-render the
        // field as 0.09, losing the user's input).
        const pct = Number(o.target);
        if (Number.isFinite(pct) && pct > 50 && pct < 100) {
          const t = pct / 100;
          spec.objectives = spec.objectives.map((obj, i) =>
            i === 0 ? { ...obj, target: t } : obj
          );
        }
      }
      if (o.latencyThreshold && spec.objectives[0]?.latencyThreshold !== undefined) {
        const lt = Number(o.latencyThreshold);
        if (Number.isFinite(lt) && lt > 0) {
          spec.objectives = spec.objectives.map((obj, i) =>
            i === 0 ? { ...obj, latencyThreshold: lt } : obj
          );
        }
      }
      return { ...s, input: { ...s.input, spec } };
    },
    [overrides]
  );

  /**
   * Per-draft status for the in-flight batch create. Renders inside each
   * inline row (spinner while creating, check on success, alert on error)
   * and gates the progress strip at the top of the page.
   */
  const [rowStatusMap, setRowStatusMap] = useState<
    Record<string, { status: 'pending' | 'creating' | 'success' | 'error'; message?: string }>
  >({});
  /** Cumulative counters while the bounded-concurrency loop runs. */
  const [progress, setProgress] = useState<{ done: number; failed: number; total: number } | null>(
    null
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  const runCreateSelected = useCallback(async () => {
    const picks = suggestions.filter((s) => selected.has(s.key)).map(applyOverrides);
    if (picks.length === 0) return;
    setCreating(true);
    // Seed row status so each inline row renders a pending spinner slot
    // immediately — the user can see which rows are in the work queue.
    setRowStatusMap((prev) => {
      const next = { ...prev };
      for (const p of picks) next[p.key] = { status: 'pending' };
      return next;
    });
    setProgress({ done: 0, failed: 0, total: picks.length });

    const results: Array<{ key: string; ok: boolean; message?: string }> = [];
    let done = 0;
    let failed = 0;
    // Bounded concurrency: ruler writes are safe concurrent, but four
    // in-flight at a time keeps server load sensible and preserves per-row
    // error isolation.
    await withConcurrency(4, picks, async (s) => {
      setRowStatusMap((prev) => ({ ...prev, [s.key]: { status: 'creating' } }));
      try {
        await apiClient.create(s.input);
        results.push({ key: s.key, ok: true });
        setRowStatusMap((prev) => ({ ...prev, [s.key]: { status: 'success' } }));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        results.push({ key: s.key, ok: false, message });
        setRowStatusMap((prev) => ({ ...prev, [s.key]: { status: 'error', message } }));
        failed += 1;
      } finally {
        done += 1;
        setProgress({ done, failed, total: picks.length });
      }
    });

    setCreating(false);
    setProgress(null);
    const failures = results.filter((r) => !r.ok);
    if (failures.length === 0) {
      notifications.toasts.addSuccess({
        title: `Created ${results.length} SLO${results.length === 1 ? '' : 's'}`,
        // A mount-point so the "View in listing" action stays clickable;
        // auto-redirect is removed so the user keeps the row feedback they
        // just earned and can inspect any partial failure before leaving.
        text: toMountPoint(
          <EuiText size="s">
            <p>Alerting rules are provisioned and will begin evaluating on the next ruler cycle.</p>
            <EuiLink
              onClick={() => history.push('/slos')}
              data-test-subj="slosSuggestCreateViewListing"
            >
              View in listing
            </EuiLink>
          </EuiText>
        ),
      });
    } else {
      notifications.toasts.addDanger({
        title: `${failures.length} of ${results.length} failed`,
        text: failures.map((f) => `• ${f.key}: ${f.message ?? 'unknown error'}`).join('\n'),
      });
    }
  }, [apiClient, applyOverrides, history, notifications, selected, suggestions]);

  const createSelected = useCallback(() => {
    // Already-open preview means the user has seen the full rule/SLI
    // picture; skip the second confirmation. Otherwise gate behind the
    // modal so accidental clicks don't provision dozens of rules.
    if (showPreview) {
      runCreateSelected();
    } else {
      setConfirmOpen(true);
    }
  }, [runCreateSelected, showPreview]);

  // Memoize the override-decorated list. Without this, every parent render
  // creates a fresh array identity, busting every downstream `useMemo` whose
  // deps include it (uniqueServices, serviceRows, …). The result was a render
  // loop where typing in a draft override re-derived the entire row tree on
  // every keystroke for ~38 drafts.
  const decoratedSuggestions = useMemo(() => suggestions.map(applyOverrides), [
    suggestions,
    applyOverrides,
  ]);
  const selectedCount = decoratedSuggestions.filter((s) => selected.has(s.key)).length;
  const totalRules = decoratedSuggestions
    .filter((s) => selected.has(s.key))
    .reduce((acc, s) => acc + s.estimatedRuleCount, 0);
  const coveredCount = decoratedSuggestions.filter((s) => s.existingRuleMatch).length;
  // The service list comes from APM discovery but an OTel-only service (one
  // that emits direct metrics without span-derived RED) can still surface a
  // draft. Union both sources so every service that owns drafts gets a row.
  const uniqueServices = useMemo(() => {
    const set = new Set<string>();
    for (const s of services ?? []) {
      if (s.serviceName) set.add(s.serviceName);
    }
    for (const s of decoratedSuggestions) {
      if (s.input.spec.service) set.add(s.input.spec.service);
    }
    return Array.from(set);
  }, [services, decoratedSuggestions]);

  const serviceRows: ServiceRowShape[] = useMemo(() => {
    return uniqueServices
      .map<ServiceRowShape>((serviceName) => {
        const drafts = decoratedSuggestions.filter((s) => s.input.spec.service === serviceName);
        const kinds: string[] = [];
        for (const d of drafts) {
          if (!kinds.includes(d.kind)) kinds.push(d.kind);
        }
        return {
          serviceName,
          environment: drafts[0]?.detected.environment,
          drafts,
          selectedCount: drafts.filter((s) => selected.has(s.key)).length,
          totalRules: drafts.reduce((acc, s) => acc + s.estimatedRuleCount, 0),
          coveredCount: drafts.filter((s) => s.existingRuleMatch).length,
          kinds,
        };
      })
      .filter((row) => row.drafts.length > 0);
  }, [uniqueServices, decoratedSuggestions, selected]);

  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  /** Re-seed expansion to "all expanded" whenever the set of services changes. */
  useEffect(() => {
    setExpandedMap((prev) => {
      const next: Record<string, boolean> = {};
      for (const row of serviceRows) {
        // Preserve any explicit collapse the user performed.
        next[row.serviceName] = prev[row.serviceName] ?? true;
      }
      return next;
    });
  }, [serviceRows]);

  const toggleExpand = useCallback((serviceName: string) => {
    setExpandedMap((prev) => ({ ...prev, [serviceName]: !prev[serviceName] }));
  }, []);

  const toggleServiceSelection = useCallback(
    (row: ServiceRowShape) => {
      const allSelected = row.selectedCount === row.drafts.length;
      setSelected((prev) => {
        const next = new Set(prev);
        for (const d of row.drafts) {
          if (allSelected) next.delete(d.key);
          else next.add(d.key);
        }
        return next;
      });
    },
    [setSelected]
  );

  const loading = configLoading || servicesLoading || discoveryLoading;

  const headerActions = [
    <EuiButtonEmpty key="back" iconType="arrowLeft" href="#/slos" size="s">
      Back to SLOs
    </EuiButtonEmpty>,
    <EuiButton
      key="discover"
      size="s"
      iconType="refresh"
      onClick={() => {
        refetch();
        setDiscoveryEpoch((n) => n + 1);
      }}
      isLoading={loading}
      data-test-subj="slosSuggestDiscover"
    >
      Rediscover
    </EuiButton>,
    <EuiButton
      key="create"
      size="s"
      fill
      iconType="plusInCircle"
      color="primary"
      onClick={createSelected}
      isLoading={creating}
      isDisabled={selectedCount === 0 || loading}
      data-test-subj="slosSuggestCreate"
    >
      Create {selectedCount} selected
    </EuiButton>,
  ];

  return (
    <EuiPage data-test-subj="slosSuggestPage">
      <EuiPageBody component="main">
        <HeaderControlledComponentsWrapper components={headerActions} />
        <EuiPageContent color="transparent" hasBorder={false} paddingSize="none">
          <EuiPageContentBody>
            {/* Intro — one-line summary; the verbose copy belongs in docs. */}
            <EuiText size="m">
              <h4>Suggest SLOs from APM services</h4>
            </EuiText>
            <EuiSpacer size="xs" />
            <EuiText size="xs" color="subdued">
              Drafts availability + latency SLOs per service from span-derived RED metrics, plus
              OTel semconv add-ons where present.
            </EuiText>
            {scope.services && !scopeFellThrough && (
              <>
                <EuiSpacer size="xs" />
                <EuiFlexGroup
                  alignItems="center"
                  gutterSize="s"
                  responsive={false}
                  data-test-subj="slosSuggestScopeSubline"
                >
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs" color="subdued">
                      Scoped to {scope.services.length} service
                      {scope.services.length === 1 ? '' : 's'}: {scope.services.join(', ')}
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiButtonEmpty
                      size="xs"
                      onClick={() => history.push('#/slos/suggest')}
                      data-test-subj="slosSuggestClearScope"
                    >
                      Clear scope
                    </EuiButtonEmpty>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </>
            )}
            {scopeFellThrough && (
              <>
                <EuiSpacer size="s" />
                <EuiCallOut
                  size="s"
                  iconType="iInCircle"
                  color="warning"
                  title="Scoped services not found"
                  data-test-subj="slosSuggestScopeFellThrough"
                >
                  <EuiText size="s">
                    These services aren&apos;t in the current APM discovery result. Showing all
                    discovered services instead.
                  </EuiText>
                  <EuiSpacer size="xs" />
                  <EuiButtonEmpty
                    size="xs"
                    onClick={() => history.push('#/slos/suggest')}
                    data-test-subj="slosSuggestClearScope"
                  >
                    Clear scope
                  </EuiButtonEmpty>
                </EuiCallOut>
              </>
            )}
            <EuiSpacer size="m" />

            {servicesError && (
              <>
                <EuiCallOut
                  color="danger"
                  iconType="alert"
                  title="Failed to load services"
                  size="s"
                >
                  <EuiText size="s">{servicesError.message}</EuiText>
                </EuiCallOut>
                <EuiSpacer size="m" />
              </>
            )}

            {loading && (
              <EuiFlexGroup justifyContent="center" alignItems="center" style={{ minHeight: 200 }}>
                <EuiFlexItem grow={false}>
                  <EuiLoadingSpinner size="xl" />
                </EuiFlexItem>
              </EuiFlexGroup>
            )}

            {!loading && !datasourceId && (
              <EuiCallOut
                size="s"
                iconType="iInCircle"
                title="No Prometheus datasource configured"
                color="warning"
              >
                <EuiText size="s">
                  Configure a Prometheus datasource under APM configuration before suggesting SLOs.
                </EuiText>
              </EuiCallOut>
            )}

            {!loading && datasourceId && uniqueServices.length === 0 && !servicesError && (
              <EuiCallOut size="s" iconType="iInCircle" title="No APM services were discovered">
                <EuiText size="s">
                  No services appear to be sending OTel traces right now. If you expect services
                  here, verify the APM trace dataset and window duration under APM configuration.
                </EuiText>
              </EuiCallOut>
            )}

            {!loading && decoratedSuggestions.length > 0 && (
              <>
                <EuiPanel paddingSize="m" hasBorder data-test-subj="slosSuggestHeaderStrip">
                  <EuiFlexGroup alignItems="center" responsive={false} gutterSize="l">
                    <EuiFlexItem grow={false}>
                      <EuiStat
                        title={`${selectedCount}`}
                        description={`of ${decoratedSuggestions.length} SLOs`}
                        titleSize="m"
                        reverse
                        data-test-subj="slosSuggestStatSlos"
                      />
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiStat
                        title={`${uniqueServices.length}`}
                        description={`service${uniqueServices.length === 1 ? '' : 's'}`}
                        titleSize="m"
                        reverse
                        data-test-subj="slosSuggestStatServices"
                      />
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiStat
                        title={`${totalRules}`}
                        description="rules to provision"
                        titleSize="m"
                        titleColor="subdued"
                        reverse
                        data-test-subj="slosSuggestStatRules"
                      />
                    </EuiFlexItem>
                    <EuiFlexItem grow={true} />
                    <EuiFlexItem grow={false}>
                      <EuiFlexGroup gutterSize="s" responsive={false} alignItems="center">
                        <EuiFlexItem grow={false}>
                          <EuiButtonEmpty
                            size="s"
                            onClick={() =>
                              setSelected(new Set(decoratedSuggestions.map((s) => s.key)))
                            }
                          >
                            Select all
                          </EuiButtonEmpty>
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiButtonEmpty size="s" onClick={() => setSelected(new Set())}>
                            Clear
                          </EuiButtonEmpty>
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiButton
                            size="s"
                            iconType={showPreview ? 'eyeClosed' : 'eye'}
                            onClick={() => setShowPreview((v) => !v)}
                            isDisabled={selectedCount === 0}
                            data-test-subj="slosSuggestPreviewToggle"
                          >
                            {showPreview ? 'Hide preview' : `Preview ${selectedCount} selected`}
                          </EuiButton>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiPanel>
                <EuiSpacer size="xs" />
                <EuiText size="xs" color="subdued" data-test-subj="slosSuggestHeaderSubline">
                  {coveredCount > 0 ? (
                    <>
                      {coveredCount} draft{coveredCount === 1 ? '' : 's'} already covered by
                      existing rules · Namespace: <EuiCode>slo-generated</EuiCode>
                    </>
                  ) : (
                    <>
                      Namespace: <EuiCode>slo-generated</EuiCode>
                    </>
                  )}
                </EuiText>
                <EuiSpacer size="m" />

                {progress && (
                  <>
                    <EuiPanel paddingSize="s" hasBorder data-test-subj="slosSuggestProgressStrip">
                      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                        <EuiFlexItem grow={false}>
                          <EuiText size="xs">
                            Creating SLO {progress.done}/{progress.total} ·{' '}
                            <strong>{progress.failed}</strong> failed so far
                          </EuiText>
                        </EuiFlexItem>
                        <EuiFlexItem>
                          <EuiProgress
                            color={progress.failed > 0 ? 'warning' : 'primary'}
                            value={progress.done}
                            max={progress.total}
                            size="xs"
                          />
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiPanel>
                    <EuiSpacer size="s" />
                  </>
                )}

                <ServiceTreeTable
                  serviceRows={serviceRows}
                  expandedMap={expandedMap}
                  onToggleExpand={toggleExpand}
                  onToggleServiceSelection={toggleServiceSelection}
                  selected={selected}
                  overrides={overrides}
                  onToggleDraft={toggle}
                  onOverrideChange={setOverride}
                  rowStatusMap={rowStatusMap}
                />
              </>
            )}
          </EuiPageContentBody>
        </EuiPageContent>
      </EuiPageBody>
      {/* Persistent right-dock flyout. `type="push"` reflows the page; the
          flyout is only rendered when the preview toggle is on AND there
          are selected drafts, so `selectedCount === 0` auto-closes it.
          Keystrokes in override fields don't flip `showPreview`, so the
          subtree — and BatchPreviewSection's debounced effect — stays
          mounted across rapid edits. */}
      {showPreview && selectedCount > 0 && (
        <EuiFlyout
          onClose={() => setShowPreview(false)}
          ownFocus={false}
          type="push"
          size="m"
          side="right"
          pushMinBreakpoint="xs"
          data-test-subj="slosSuggestPreviewFlyout"
        >
          <EuiFlyoutHeader hasBorder data-test-subj="slosSuggestPreviewFlyoutHeader">
            <EuiTitle size="s">
              <h3>
                Rule preview · {selectedCount} SLO{selectedCount === 1 ? '' : 's'}
              </h3>
            </EuiTitle>
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            <BatchPreviewSection
              apiClient={apiClient}
              selectedSuggestions={decoratedSuggestions.filter((s) => selected.has(s.key))}
              prometheusConnectionId={config?.prometheusDataSource?.name}
              prometheusConnectionMeta={config?.prometheusDataSource?.meta}
            />
          </EuiFlyoutBody>
        </EuiFlyout>
      )}
      {confirmOpen && (
        <EuiConfirmModal
          title={`Create ${selectedCount} SLO${selectedCount === 1 ? '' : 's'}?`}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            runCreateSelected();
          }}
          cancelButtonText="Cancel"
          confirmButtonText="Create"
          defaultFocusedButton="confirm"
          data-test-subj="slosSuggestConfirmModal"
        >
          <EuiText size="s">
            <p>
              This provisions <strong>{totalRules}</strong> Prometheus rules in namespace{' '}
              <EuiCode>slo-generated</EuiCode>. Rules begin evaluating on the next ruler cycle;
              alerts do not fire until data accumulates.
            </p>
          </EuiText>
        </EuiConfirmModal>
      )}
    </EuiPage>
  );
};

// ============================================================================
// Bounded-concurrency helper — runs `worker(item)` over `items` with at most
// `n` in flight. Uses Promise.allSettled-style semantics: every item runs
// to completion; the caller captures per-item errors inside `worker`.
// ============================================================================

async function withConcurrency<T>(
  n: number,
  items: T[],
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  const limit = Math.max(1, n);
  let idx = 0;
  const runners: Array<Promise<void>> = [];
  const runNext = async (): Promise<void> => {
    while (idx < items.length) {
      const current = idx;
      idx += 1;
      await worker(items[current]);
    }
  };
  for (let i = 0; i < Math.min(limit, items.length); i += 1) {
    runners.push(runNext());
  }
  await Promise.all(runners);
}

// ============================================================================
// Inline suggestion row — a compact, single-line-ish layout used inside the
// service tree table's expanded-row area. Replaces the wider `SuggestionCard`
// for that context: checkbox · name · kind · rules · covered badge · inline
// owner/tier/target/p95 override fields. The long `reason` blurb and
// rule-match details move into tooltips so the row stays compact on a 19-
// services × N-drafts page.
// ============================================================================

interface OverrideValues {
  ownerTeam?: string;
  tier?: string;
  target?: string;
  latencyThreshold?: string;
}

type OverridePatch = Partial<{
  ownerTeam: string;
  tier: string;
  target: string;
  latencyThreshold: string;
}>;

/** Derive a listing-shaped projection so we can reuse `templateIconFor`. */
function suggestionIconType(s: Suggestion): string {
  const sli = s.input.spec.sli;
  const sliBackend = sli.type === 'single' ? sli.definition.backend : undefined;
  const sliLeafType =
    sli.type === 'single' ? (sli.definition as { type?: string }).type ?? undefined : undefined;
  const projection = {
    sliNodeType: sli.type === 'single' ? 'single' : 'composite',
    sliBackend,
    sliLeafType,
  } as Partial<SloSummary>;
  return templateIconFor(projection as SloSummary);
}

interface SuggestionInlineRowProps {
  suggestion: Suggestion;
  selected: boolean;
  onToggle: () => void;
  overrides: OverrideValues;
  onOverrideChange: (patch: OverridePatch) => void;
  /** Render status — used by the batch-create progress strip. */
  rowStatus?: 'pending' | 'creating' | 'success' | 'error';
  rowStatusMessage?: string;
}

const SuggestionInlineRow: React.FC<SuggestionInlineRowProps> = ({
  suggestion,
  selected,
  onToggle,
  overrides,
  onOverrideChange,
  rowStatus,
  rowStatusMessage,
}) => {
  const spec = suggestion.input.spec;
  const objective = spec.objectives[0];
  const isLatency = objective?.latencyThreshold !== undefined;
  const unit =
    spec.sli.type === 'single' &&
    spec.sli.definition.backend === 'prometheus' &&
    spec.sli.definition.type === 'latency_threshold'
      ? spec.sli.definition.latencyThresholdUnit ?? 'seconds'
      : 'seconds';
  const isCovered = Boolean(suggestion.existingRuleMatch);
  const fadedOut = isCovered && !selected;
  const disableCheckbox = rowStatus === 'creating' || rowStatus === 'success';

  const coveredTooltip = suggestion.existingRuleMatch
    ? `Matched: ${suggestion.existingRuleMatch.groupName} / ${
        suggestion.existingRuleMatch.ruleName
      }${
        suggestion.existingRuleMatch.sloId ? ` (SLO ${suggestion.existingRuleMatch.sloId})` : ''
      }. Unchecked to avoid dual-writing.`
    : '';

  return (
    <EuiPanel
      color={selected ? 'primary' : 'plain'}
      paddingSize="s"
      hasBorder
      style={{
        marginBottom: 8,
        opacity: fadedOut ? 0.75 : 1,
      }}
      data-test-subj={`slosSuggestInlineRow-${suggestion.key}`}
    >
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
        <EuiFlexItem grow={false}>
          {rowStatus === 'creating' ? (
            <EuiLoadingSpinner
              size="m"
              data-test-subj={`slosSuggestRowStatus-${suggestion.key}-creating`}
            />
          ) : rowStatus === 'success' ? (
            <EuiIcon
              type="check"
              color="success"
              data-test-subj={`slosSuggestRowStatus-${suggestion.key}-success`}
            />
          ) : rowStatus === 'error' ? (
            <EuiIconTip
              type="alert"
              color="danger"
              content={rowStatusMessage ?? 'Create failed.'}
              data-test-subj={`slosSuggestRowStatus-${suggestion.key}-error`}
            />
          ) : (
            <EuiCheckbox
              id={`slosSuggestSelect-${suggestion.key}`}
              checked={selected}
              onChange={onToggle}
              disabled={disableCheckbox}
              data-test-subj={`slosSuggestSelect-${suggestion.key}`}
            />
          )}
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiIcon type={suggestionIconType(suggestion)} color="subdued" />
        </EuiFlexItem>
        <EuiFlexItem grow={true}>
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false} wrap>
            <EuiFlexItem grow={false}>
              <EuiToolTip content={suggestion.reason} position="top">
                <EuiText size="s">
                  <strong>{spec.name}</strong>
                </EuiText>
              </EuiToolTip>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow">{suggestion.kind}</EuiBadge>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow">{suggestion.estimatedRuleCount} rules</EuiBadge>
            </EuiFlexItem>
            {isCovered && (
              <EuiFlexItem grow={false}>
                <EuiToolTip content={coveredTooltip} position="top">
                  <EuiBadge
                    color="warning"
                    iconType="check"
                    data-test-subj={`slosSuggestCovered-${suggestion.key}`}
                  >
                    covered by existing rule
                  </EuiBadge>
                </EuiToolTip>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="xs" />
      {/* Inline override strip — same field shapes as the card, just laid out
          in a single row instead of two. */}
      <EuiFlexGroup gutterSize="s" responsive={false} wrap>
        <EuiFlexItem style={{ minWidth: 160 }}>
          <EuiFieldText
            compressed
            prepend="Owner"
            value={overrides.ownerTeam ?? spec.owner.teams[0] ?? ''}
            onChange={(e) => onOverrideChange({ ownerTeam: e.target.value })}
            placeholder="team"
            aria-label="Owner team"
          />
        </EuiFlexItem>
        <EuiFlexItem style={{ minWidth: 120 }}>
          <EuiFieldText
            compressed
            prepend="Tier"
            value={overrides.tier ?? spec.tier ?? ''}
            onChange={(e) => onOverrideChange({ tier: e.target.value })}
            placeholder="tier-1"
            aria-label="Tier"
          />
        </EuiFlexItem>
        <EuiFlexItem style={{ minWidth: 120 }}>
          <EuiFieldNumber
            compressed
            prepend="Target"
            append="%"
            value={
              overrides.target ??
              (objective ? (objective.target * 100).toFixed(2).replace(/\.?0+$/, '') : '99')
            }
            onChange={(e) => onOverrideChange({ target: e.target.value })}
            min={50}
            max={99.999}
            step={0.01}
            aria-label="Target percentage"
          />
        </EuiFlexItem>
        {isLatency && (
          <EuiFlexItem style={{ minWidth: 120 }}>
            <EuiFieldNumber
              compressed
              prepend="p95 ≤"
              append={unit === 'milliseconds' ? 'ms' : 's'}
              value={overrides.latencyThreshold ?? String(objective.latencyThreshold)}
              onChange={(e) => onOverrideChange({ latencyThreshold: e.target.value })}
              min={0}
              step={unit === 'milliseconds' ? 10 : 0.01}
              aria-label="Latency threshold"
            />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    </EuiPanel>
  );
};

// ============================================================================
// Service tree table
//
// Replaces the previous per-service accordion list. Each row is a service;
// expanded rows render `SuggestionInlineRow` for every draft that service
// owns. Built on EuiBasicTable (no pagination / filtering needed at this
// scale — 19 services is the target) with `itemIdToExpandedRowMap`. Rows
// default to expanded so the user sees ~38 drafts on first paint.
// ============================================================================

const SLI_MIX_VISIBLE_CAP = 4;

interface ServiceRowShape {
  serviceName: string;
  environment?: string;
  drafts: Suggestion[];
  selectedCount: number;
  totalRules: number;
  coveredCount: number;
  kinds: string[];
}

interface ServiceTreeTableProps {
  serviceRows: ServiceRowShape[];
  expandedMap: Record<string, boolean>;
  onToggleExpand: (serviceName: string) => void;
  onToggleServiceSelection: (row: ServiceRowShape) => void;
  selected: Set<string>;
  overrides: Record<string, OverrideValues>;
  onToggleDraft: (key: string) => void;
  onOverrideChange: (key: string, patch: OverridePatch) => void;
  /** Optional per-draft status for the in-flight batch create. */
  rowStatusMap?: Record<
    string,
    { status: 'pending' | 'creating' | 'success' | 'error'; message?: string }
  >;
}

const ServiceTreeTable: React.FC<ServiceTreeTableProps> = ({
  serviceRows,
  expandedMap,
  onToggleExpand,
  onToggleServiceSelection,
  selected,
  overrides,
  onToggleDraft,
  onOverrideChange,
  rowStatusMap,
}) => {
  const itemIdToExpandedRowMap = useMemo(() => {
    const map: Record<string, React.ReactNode> = {};
    for (const row of serviceRows) {
      if (!expandedMap[row.serviceName]) continue;
      map[row.serviceName] = (
        <EuiPanel
          color="subdued"
          paddingSize="s"
          hasShadow={false}
          data-test-subj={`slosSuggestServiceExpanded-${row.serviceName}`}
        >
          {row.drafts.map((draft) => (
            <SuggestionInlineRow
              key={draft.key}
              suggestion={draft}
              selected={selected.has(draft.key)}
              onToggle={() => onToggleDraft(draft.key)}
              overrides={overrides[draft.key] ?? {}}
              onOverrideChange={(patch) => onOverrideChange(draft.key, patch)}
              rowStatus={rowStatusMap?.[draft.key]?.status}
              rowStatusMessage={rowStatusMap?.[draft.key]?.message}
            />
          ))}
        </EuiPanel>
      );
    }
    return map;
  }, [
    serviceRows,
    expandedMap,
    selected,
    overrides,
    onToggleDraft,
    onOverrideChange,
    rowStatusMap,
  ]);

  const columns: Array<EuiBasicTableColumn<ServiceRowShape>> = useMemo(
    () => [
      {
        width: '40px',
        isExpander: true,
        render: (row: ServiceRowShape) => (
          <EuiButtonIcon
            aria-label={
              expandedMap[row.serviceName]
                ? `Collapse ${row.serviceName}`
                : `Expand ${row.serviceName}`
            }
            iconType={expandedMap[row.serviceName] ? 'arrowDown' : 'arrowRight'}
            onClick={() => onToggleExpand(row.serviceName)}
            data-test-subj={`slosSuggestServiceExpand-${row.serviceName}`}
          />
        ),
      },
      {
        width: '36px',
        render: (row: ServiceRowShape) => {
          const allSelected = row.selectedCount === row.drafts.length && row.drafts.length > 0;
          const someSelected = row.selectedCount > 0 && !allSelected;
          return (
            <EuiCheckbox
              id={`slosSuggestServiceSelect-${row.serviceName}`}
              data-test-subj={`slosSuggestServiceSelect-${row.serviceName}`}
              checked={allSelected}
              indeterminate={someSelected}
              onChange={() => onToggleServiceSelection(row)}
              aria-label={`Select all drafts for ${row.serviceName}`}
            />
          );
        },
      },
      {
        name: 'Service',
        field: 'serviceName',
        render: (_value: string, row: ServiceRowShape) => {
          const allSelected = row.selectedCount === row.drafts.length && row.drafts.length > 0;
          const selectionColor = allSelected
            ? 'primary'
            : row.selectedCount === 0
            ? 'hollow'
            : 'accent';
          return (
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
              <EuiFlexItem grow={false}>
                <EuiText size="s">
                  <strong>{row.serviceName}</strong>
                </EuiText>
              </EuiFlexItem>
              {row.environment && (
                <EuiFlexItem grow={false}>
                  <EuiBadge color="hollow">{row.environment}</EuiBadge>
                </EuiFlexItem>
              )}
              <EuiFlexItem grow={false}>
                <EuiBadge
                  color={selectionColor}
                  data-test-subj={`slosSuggestSelectionBadge-${row.serviceName}`}
                >
                  {row.selectedCount} / {row.drafts.length} selected
                </EuiBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
          );
        },
      },
      {
        name: 'SLI mix',
        render: (row: ServiceRowShape) => {
          const visible = row.kinds.slice(0, SLI_MIX_VISIBLE_CAP);
          const overflow = row.kinds.length - visible.length;
          const iconByKind = new Map<string, string>();
          for (const draft of row.drafts) {
            if (!iconByKind.has(draft.kind)) iconByKind.set(draft.kind, suggestionIconType(draft));
          }
          return (
            <EuiFlexGroup gutterSize="xs" responsive={false} wrap>
              {visible.map((kind) => (
                <EuiFlexItem grow={false} key={kind}>
                  <EuiBadge color="hollow" iconType={iconByKind.get(kind) ?? 'bullseye'}>
                    {kind}
                  </EuiBadge>
                </EuiFlexItem>
              ))}
              {overflow > 0 && (
                <EuiFlexItem grow={false}>
                  <EuiToolTip
                    content={row.kinds.slice(SLI_MIX_VISIBLE_CAP).join(', ')}
                    position="top"
                  >
                    <EuiBadge color="hollow">+{overflow} more</EuiBadge>
                  </EuiToolTip>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          );
        },
      },
      {
        name: 'Drafts',
        render: (row: ServiceRowShape) => (
          <EuiText size="xs" color="subdued">
            {row.drafts.length} draft{row.drafts.length === 1 ? '' : 's'} · ~{row.totalRules} rules
          </EuiText>
        ),
      },
      {
        name: 'Covered',
        render: (row: ServiceRowShape) =>
          row.coveredCount > 0 ? (
            <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="danger">
                  {row.coveredCount}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiIconTip
                  type="questionInCircle"
                  color="subdued"
                  position="top"
                  content={`${row.coveredCount} draft${
                    row.coveredCount === 1 ? '' : 's'
                  } for this service ${
                    row.coveredCount === 1 ? 'is' : 'are'
                  } already provisioned by existing recording rules. They're unchecked by default to avoid dual-writing.`}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          ) : null,
      },
    ],
    [expandedMap, onToggleExpand, onToggleServiceSelection]
  );

  return (
    <EuiBasicTable<ServiceRowShape>
      data-test-subj="slosSuggestTable"
      items={serviceRows}
      itemId="serviceName"
      columns={columns}
      isExpandable
      hasActions={false}
      itemIdToExpandedRowMap={itemIdToExpandedRowMap}
      rowProps={(row) => ({ 'data-test-subj': `slosSuggestServiceRow-${row.serviceName}` })}
    />
  );
};

// ============================================================================
// Batch preview — renders the Prometheus rule group each selected draft would
// deploy. Calls `apiClient.preview` in parallel per draft so failures are
// per-SLO rather than aggregate. The server runs the same generator the
// Create path uses, so what appears here is exactly what will land in the
// ruler.
// ============================================================================

interface PerPreview {
  key: string;
  suggestion: Suggestion;
  status: 'loading' | 'success' | 'error';
  group?: GeneratedRuleGroup;
  error?: string;
}

/** Live SLI signal computed against the current Prometheus datasource. */
interface LiveSli {
  /** current SLI value in [0, 1] (availability fraction or fraction-under-threshold). */
  sliRatio?: number;
  /** total samples / requests observed in the window. */
  totalSamples?: number;
  /** observed p99 in milliseconds, only for latency_seconds_bucket-backed drafts. */
  p99Ms?: number;
  status: 'loading' | 'success' | 'error' | 'skipped';
  error?: string;
}

const WINDOW_OPTIONS = [
  { id: '1h', label: '1h' },
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
] as const;

const BatchPreviewSection: React.FC<{
  apiClient: Pick<SloApiClient, 'preview'>;
  selectedSuggestions: Suggestion[];
  prometheusConnectionId?: string;
  prometheusConnectionMeta?: Record<string, unknown>;
}> = ({ apiClient, selectedSuggestions, prometheusConnectionId, prometheusConnectionMeta }) => {
  const [windowChoice, setWindowChoice] = useState<WindowOption>('24h');

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
    Promise.all(
      serializedInputs.map(async (r) => {
        try {
          const group = await apiClient.preview(JSON.parse(r.body) as SloCreateInput);
          return {
            key: r.key,
            suggestion: r.suggestion,
            status: 'success' as const,
            group,
          };
        } catch (e) {
          return {
            key: r.key,
            suggestion: r.suggestion,
            status: 'error' as const,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      })
    ).then((results) => {
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
    serializedInputs.forEach((r) => {
      const kind = liveKindFor(r.suggestion);
      if (!kind) {
        setLiveByKey((prev) => ({ ...prev, [r.key]: { status: 'skipped' } }));
        return;
      }
      const queries = buildLiveQueries(kind, r.suggestion, windowChoice);
      Promise.all(
        queries.map((q) =>
          promqlService
            .executeInstantQuery({ query: q, time: evalTime })
            .then((resp) => extractScalar(resp))
            .catch(() => undefined)
        )
      ).then((values) => {
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
    });
    return () => {
      cancelled = true;
    };
    // serializedKey/windowChoice gate re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promqlService, serializedKey, windowChoice]);

  const totalRuleCount = previews
    .filter((p) => p.status === 'success')
    .reduce((acc, p) => acc + (p.group?.rules.length ?? 0), 0);
  const successCount = previews.filter((p) => p.status === 'success').length;
  const errorCount = previews.filter((p) => p.status === 'error').length;
  const loadingCount = previews.filter((p) => p.status === 'loading').length;
  const breachCount = previews.reduce((acc, p) => {
    const live = liveByKey[p.key];
    if (live?.status !== 'success') return acc;
    if (!(typeof live.totalSamples === 'number' && live.totalSamples > 0)) return acc;
    const obj = p.suggestion.input.spec.objectives[0];
    // Latency objectives: compare observed p99 to the bound.
    if (typeof obj?.latencyThreshold === 'number') {
      return typeof live.p99Ms === 'number' && live.p99Ms > obj.latencyThreshold * 1000
        ? acc + 1
        : acc;
    }
    // Availability objectives: compare SLI to target fraction.
    return typeof live.sliRatio === 'number' &&
      typeof obj?.target === 'number' &&
      live.sliRatio < obj.target
      ? acc + 1
      : acc;
  }, 0);

  return (
    <div data-test-subj="slosSuggestPreview">
      <EuiText size="s" color="subdued">
        Rule groups that will be deployed on Create — plus the current SLI evaluated against the APM
        Prometheus datasource. A red <strong>breaching</strong> badge means the draft would already
        be firing, making it a good candidate to create and investigate.
      </EuiText>
      <EuiSpacer size="s" />
      <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            Evaluate over
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonGroup
            legend="SLI evaluation window"
            idSelected={windowChoice}
            onChange={(id) => setWindowChoice(id as WindowOption)}
            options={[...WINDOW_OPTIONS]}
            buttonSize="compressed"
            data-test-subj="slosSuggestPreviewWindow"
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="xs" />
      <EuiFlexGroup gutterSize="xs" responsive={false} wrap>
        {loadingCount > 0 && (
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow">{loadingCount} loading</EuiBadge>
          </EuiFlexItem>
        )}
        <EuiFlexItem grow={false}>
          <EuiBadge color="primary">{successCount} previewed</EuiBadge>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge color="primary">{totalRuleCount} rules total</EuiBadge>
        </EuiFlexItem>
        {breachCount > 0 && (
          <EuiFlexItem grow={false}>
            <EuiBadge color="danger">{breachCount} breaching</EuiBadge>
          </EuiFlexItem>
        )}
        {errorCount > 0 && (
          <EuiFlexItem grow={false}>
            <EuiBadge color="danger">{errorCount} failed</EuiBadge>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      {previews.length === 0 ? (
        <EuiText size="s" color="subdued">
          Select at least one draft to preview.
        </EuiText>
      ) : (
        previews.map((p) => (
          <PreviewRow
            key={p.key}
            preview={p}
            live={liveByKey[p.key] ?? { status: 'loading' }}
            windowChoice={windowChoice}
          />
        ))
      )}
    </div>
  );
};

const PreviewRow: React.FC<{
  preview: PerPreview;
  live: LiveSli;
  windowChoice: WindowOption;
}> = ({ preview, live, windowChoice }) => {
  const { suggestion, status, group, error } = preview;
  const spec = suggestion.input.spec;
  const target = spec.objectives[0]?.target;
  const latencyBoundSec = spec.objectives[0]?.latencyThreshold;
  const isLatencyObjective = typeof latencyBoundSec === 'number';
  const hasSli = typeof live.sliRatio === 'number';
  // Only flag breaching when we actually observed traffic in the window;
  // zero samples means "no data yet", not "the SLO is firing".
  const hasTraffic = typeof live.totalSamples === 'number' && live.totalSamples > 0;
  // For latency objectives, span-derived histogram buckets aren't cumulative,
  // so the fraction-under-threshold SLI is unreliable. Flag breaching when the
  // observed p99 exceeds the template's latency bound instead.
  const breaching = isLatencyObjective
    ? live.status === 'success' &&
      hasTraffic &&
      typeof live.p99Ms === 'number' &&
      live.p99Ms > latencyBoundSec! * 1000
    : live.status === 'success' &&
      hasSli &&
      hasTraffic &&
      typeof target === 'number' &&
      live.sliRatio! < target;
  return (
    <EuiPanel
      color="subdued"
      paddingSize="s"
      hasBorder
      style={{ marginBottom: 8 }}
      data-test-subj={`slosSuggestPreviewRow-${suggestion.key}`}
    >
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
        <EuiFlexItem grow={true}>
          <EuiText size="s">
            <strong>{spec.name}</strong>
          </EuiText>
          <EuiFlexGroup gutterSize="xs" responsive={false} wrap>
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow">{suggestion.kind}</EuiBadge>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {spec.objectives[0]?.name} · target{' '}
                {(spec.objectives[0]?.target * 100).toFixed(2).replace(/\.?0+$/, '')}%
                {spec.objectives[0]?.latencyThreshold !== undefined
                  ? ` · ≤ ${spec.objectives[0].latencyThreshold}s`
                  : ''}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          {status === 'loading' && <EuiLoadingSpinner size="m" />}
          {status === 'success' && group && (
            <EuiBadge color="primary">
              {group.rules.length} {group.rules.length === 1 ? 'rule' : 'rules'}
            </EuiBadge>
          )}
          {status === 'error' && <EuiBadge color="danger">preview failed</EuiBadge>}
        </EuiFlexItem>
      </EuiFlexGroup>

      {/* Live signal row — always visible when we have (or are fetching) live data. */}
      {live.status !== 'skipped' && (
        <>
          <EuiSpacer size="xs" />
          <EuiFlexGroup
            gutterSize="xs"
            alignItems="center"
            responsive={false}
            wrap
            data-test-subj={`slosSuggestPreviewLive-${suggestion.key}`}
          >
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                Over last {windowChoice}:
              </EuiText>
            </EuiFlexItem>
            {live.status === 'loading' && (
              <EuiFlexItem grow={false}>
                <EuiLoadingSpinner size="s" />
              </EuiFlexItem>
            )}
            {live.status === 'success' && (
              <>
                {/* Availability templates: show the observed SLI fraction.
                    Latency templates skip this — Data Prepper span-derived
                    buckets aren't cumulative so the ratio isn't reliable. */}
                {!isLatencyObjective && hasSli && (
                  <EuiFlexItem grow={false}>
                    <EuiBadge color={breaching ? 'danger' : 'success'}>
                      SLI {(live.sliRatio! * 100).toFixed(2).replace(/\.?0+$/, '')}%
                    </EuiBadge>
                  </EuiFlexItem>
                )}
                {typeof live.p99Ms === 'number' && (
                  <EuiFlexItem grow={false}>
                    <EuiBadge
                      color={isLatencyObjective ? (breaching ? 'danger' : 'success') : 'hollow'}
                    >
                      p99 {live.p99Ms.toFixed(0)} ms
                      {isLatencyObjective
                        ? ` vs ${((latencyBoundSec as number) * 1000).toFixed(0)} ms`
                        : ''}
                    </EuiBadge>
                  </EuiFlexItem>
                )}
                {breaching && (
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="danger" iconType="alert">
                      breaching
                    </EuiBadge>
                  </EuiFlexItem>
                )}
                {typeof live.totalSamples === 'number' && (
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="hollow">{formatSamples(live.totalSamples)} samples</EuiBadge>
                  </EuiFlexItem>
                )}
                {!hasSli &&
                  typeof live.p99Ms !== 'number' &&
                  typeof live.totalSamples !== 'number' && (
                    <EuiFlexItem grow={false}>
                      <EuiText size="xs" color="subdued">
                        no data in window
                      </EuiText>
                    </EuiFlexItem>
                  )}
              </>
            )}
            {live.status === 'error' && (
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued">
                  live metrics unavailable
                </EuiText>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </>
      )}

      {status === 'error' && (
        <>
          <EuiSpacer size="xs" />
          <EuiCallOut
            size="s"
            color="warning"
            iconType="alert"
            title="Preview unavailable"
            data-test-subj={`slosSuggestPreviewError-${suggestion.key}`}
          >
            <EuiText size="xs">{error ?? 'Unable to generate preview.'}</EuiText>
          </EuiCallOut>
        </>
      )}
      {status === 'success' && group && (
        <>
          <EuiSpacer size="xs" />
          <EuiAccordion
            id={`slosSuggestPreviewYaml-${suggestion.key}`}
            buttonContent={
              <EuiText size="xs">
                Show rule group <EuiCode>{group.groupName}</EuiCode> (eval interval {group.interval}
                s)
              </EuiText>
            }
            paddingSize="s"
            data-test-subj={`slosSuggestPreviewYamlToggle-${suggestion.key}`}
          >
            <EuiCodeBlock
              language="yaml"
              paddingSize="s"
              isCopyable
              overflowHeight={320}
              data-test-subj={`slosSuggestPreviewYaml-${suggestion.key}`}
            >
              {group.yaml}
            </EuiCodeBlock>
          </EuiAccordion>
        </>
      )}
    </EuiPanel>
  );
};
