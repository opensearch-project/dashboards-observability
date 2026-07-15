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
 *
 * Decomposition:
 *   - useDiscoveryProbes: OTel probe fan-out + ruler-rules fetch.
 *   - useBatchCreate: per-row create state + bounded-concurrency runner.
 *   - useLivePreview (inside SuggestBatchPreview): rule-group preview + live SLI.
 *   - SuggestionInlineRow / ServiceTreeTable / SuggestBatchPreview / SuggestPreviewRow:
 *     siblings under this directory. The page itself is pure composition.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiCode,
  EuiConfirmModal,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiLoadingSpinner,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPageContentBody,
  EuiPanel,
  EuiPopover,
  EuiProgress,
  EuiSpacer,
  EuiStat,
  EuiTitle,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { useHistory, useLocation } from 'react-router-dom';
import { ChromeStart, HttpStart, NotificationsStart } from '../../../../../../../src/core/public';
import { HeaderControlledComponentsWrapper } from '../../../../plugin_helpers/plugin_headerControl';
import { useApmConfig } from '../../config/apm_config_context';
import { useServices } from '../../shared/hooks/use_services';
import { parseTimeRange } from '../../shared/utils/time_utils';
import { DEFAULT_APM_TIME_RANGE } from '../../common/constants';
import type { TimeRange } from '../../common/types/service_types';
import type { SloApiClient } from './slo_api_client';
import { DiscoveredService, Suggestion, generateSuggestionsForServices } from './suggest_engine';
import { buildSuggestSearch, parseSuggestScopeFromSearch } from './slo_suggest_scope';
import { OverridePatch, OverrideValues } from './suggest_inline_row';
import { ServiceRowShape, ServiceTreeTable } from './suggest_service_tree_table';
import { SuggestBatchPreview } from './suggest_batch_preview';
import { useDiscoveryProbes } from './suggest_use_discovery_probes';
import { useBatchCreate } from './suggest_use_batch_create';
import { useServiceSloHealth } from './slo_health_summary';
import { ServiceFilterSelectable } from './service_filter_selectable';
import './slo_suggest_page.scss';

export interface SloSuggestPageProps {
  apiClient: SloApiClient;
  http: HttpStart;
  chrome: ChromeStart;
  notifications: NotificationsStart;
  parentBreadcrumb: { text: string; href: string };
}

const FLYOUT_MIN_WIDTH = 300;
const FLYOUT_MAX_WIDTH_PCT = 0.45;
const FLYOUT_INITIAL_WIDTH_PCT = 0.3;

const ResizableFlyout: React.FC<{
  width: number;
  onResize: (w: number) => void;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ width, onResize, onClose, children }) => {
  // Track the active drag's teardown so a mid-drag unmount (e.g. the last draft
  // gets deselected and the flyout closes while the mouse is still down) can
  // still detach the document listeners and restore the global cursor.
  const teardownRef = useRef<(() => void) | null>(null);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;
      const maxWidth = window.innerWidth * FLYOUT_MAX_WIDTH_PCT;

      const onMouseMove = (ev: MouseEvent) => {
        const delta = startX - ev.clientX;
        const next = Math.min(maxWidth, Math.max(FLYOUT_MIN_WIDTH, startWidth + delta));
        onResize(next);
      };
      const teardown = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        teardownRef.current = null;
      };
      function onMouseUp() {
        teardown();
      }
      teardownRef.current = teardown;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [width, onResize]
  );

  // Safety net: if the component unmounts mid-drag, run the pending teardown so
  // we never leak a document listener or leave the body cursor/user-select stuck.
  useEffect(() => {
    return () => {
      teardownRef.current?.();
    };
  }, []);

  return (
    <EuiFlyout
      onClose={onClose}
      ownFocus={false}
      type="push"
      size={width}
      side="right"
      pushMinBreakpoint="xs"
      data-test-subj="slosSuggestPreviewFlyout"
    >
      <div
        onMouseDown={onMouseDown}
        className="slo-suggest-flyout__resize-handle"
        data-test-subj="slosSuggestPreviewFlyoutResizeHandle"
      >
        <div className="slo-suggest-flyout__resize-grip" />
      </div>
      {children}
    </EuiFlyout>
  );
};

const SuggestServiceFilter: React.FC<{
  allServices: Array<{ serviceName: string }>;
  coveredSet: Set<string>;
  scopedServices: string[] | undefined;
  timeRange: TimeRange | undefined;
  history: ReturnType<typeof useHistory>;
}> = ({ allServices, coveredSet, scopedServices, timeRange, history }) => {
  const [isOpen, setIsOpen] = useState(false);
  const scopeSet = useMemo(() => new Set(scopedServices ?? []), [scopedServices]);

  const allServiceNames = useMemo(() => {
    const set = new Set<string>();
    for (const s of allServices) {
      if (s.serviceName) set.add(s.serviceName);
    }
    return Array.from(set);
  }, [allServices]);

  // Build the target URL, always carrying the discovery time range (`from`/`to`)
  // so changing the service scope never resets the window the user launched with.
  const buildScopeUrl = useCallback(
    (sel: string[]) => `/slos/suggest?${buildSuggestSearch(sel, timeRange)}`,
    [timeRange]
  );

  // The suggest page commits selection live to the URL scope — no staged
  // "confirm" step — so every toggle rewrites the query string. An empty
  // selection drops the `services` param, which renders the "pick services"
  // empty state rather than drafting everything.
  const onSelectionChange = useCallback(
    (sel: string[]) => {
      history.replace(buildScopeUrl(sel));
    },
    [history, buildScopeUrl]
  );

  const clearScope = useCallback(() => {
    setIsOpen(false);
    history.replace(buildScopeUrl([]));
  }, [history, buildScopeUrl]);

  const scopedCount = scopedServices?.length ?? 0;
  const buttonLabel =
    scopedCount === 0
      ? i18n.translate('observability.apm.slo.suggest.serviceFilter.empty', {
          defaultMessage: 'Select services',
        })
      : i18n.translate('observability.apm.slo.suggest.serviceFilter', {
          defaultMessage: 'Suggest SLOs for {count, plural, one {# service} other {# services}}',
          values: { count: scopedCount },
        });

  return (
    <EuiFlexGroup gutterSize="s" responsive={false} alignItems="center" justifyContent="flexEnd">
      <EuiFlexItem grow={false}>
        <EuiPopover
          isOpen={isOpen}
          closePopover={() => setIsOpen(false)}
          panelPaddingSize="none"
          anchorPosition="downRight"
          button={
            <EuiButton
              size="s"
              iconType="arrowDown"
              iconSide="right"
              onClick={() => setIsOpen((prev) => !prev)}
              data-test-subj="slosSuggestServiceFilter"
            >
              {buttonLabel}
            </EuiButton>
          }
        >
          <div className="slo-service-filter__panel">
            <ServiceFilterSelectable
              serviceNames={allServiceNames}
              selectedSet={scopeSet}
              coveredSet={coveredSet}
              onSelectionChange={onSelectionChange}
            />
            <EuiPanel color="transparent" paddingSize="s">
              <EuiButtonEmpty
                size="s"
                onClick={clearScope}
                isDisabled={scopedCount === 0}
                data-test-subj="slosSuggestServiceFilterClear"
              >
                {i18n.translate('observability.apm.slo.suggest.clearSelection', {
                  defaultMessage: 'Clear',
                })}
              </EuiButtonEmpty>
            </EuiPanel>
          </div>
        </EuiPopover>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

export const SloSuggestPage: React.FC<SloSuggestPageProps> = ({
  apiClient,
  chrome,
  http,
  notifications,
  parentBreadcrumb: _parentBreadcrumb,
}) => {
  const history = useHistory();
  const location = useLocation();
  const scope = useMemo(() => parseSuggestScopeFromSearch(location.search), [location.search]);
  const { config, loading: configLoading } = useApmConfig();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Per-suggestion overrides users type into the card. */
  const [overrides, setOverrides] = useState<Record<string, OverrideValues>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [flyoutWidth, setFlyoutWidth] = useState(() =>
    // Clamp the seed to the same [min, max] band the drag handler enforces, so a
    // narrow viewport can't open the flyout below FLYOUT_MIN_WIDTH.
    Math.round(
      Math.min(
        window.innerWidth * FLYOUT_MAX_WIDTH_PCT,
        Math.max(FLYOUT_MIN_WIDTH, window.innerWidth * FLYOUT_INITIAL_WIDTH_PCT)
      )
    )
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  /** Bumping this re-runs the discovery probes + ruler fetch (the "Rediscover"
   *  button), giving the user a way to recover from a transient ruler outage
   *  without a full page reload. */
  const [discoveryEpoch, setDiscoveryEpoch] = useState(0);

  useEffect(() => {
    chrome.setBreadcrumbs([
      {
        text: i18n.translate('observability.apm.slo.suggest.breadcrumb.slos', {
          defaultMessage: 'SLO/SLI',
        }),
        href: '#/slos',
      },
      {
        text: i18n.translate('observability.apm.slo.suggest.breadcrumb.suggest', {
          defaultMessage: 'Suggest',
        }),
      },
    ]);
  }, [chrome]);

  // Use the Prometheus datasource the APM config points at — same one the SLO
  // wizard writes SLOs against. Users who want a different datasource edit the
  // APM config rather than picking here.
  const datasourceId = config?.prometheusDataSource?.name ?? '';

  // Discovery window comes from the caller via the URL (`from`/`to`) so the
  // suggestion reflects the range the user was looking at on the services /
  // service-details page they launched from. Falls back to the 15m default
  // when the page is opened without an explicit range (e.g. a bare deep link).
  // Key off the `from`/`to` strings, not the `scope.timeRange` object: `scope`
  // is re-parsed into a fresh object on every `location.search` change (e.g.
  // toggling a service in the filter), so depending on its identity would remint
  // the parsed `Date`s each time — churning `useServices`' fetch params and
  // flashing the loading spinner on every click. The strings only change when
  // the window actually changes.
  const from = scope.timeRange?.from ?? DEFAULT_APM_TIME_RANGE.from;
  const to = scope.timeRange?.to ?? DEFAULT_APM_TIME_RANGE.to;
  const timeRange = useMemo(() => ({ from, to }), [from, to]);
  // `parseTimeRange` throws on bounds that pass the URL charset check but aren't
  // parseable datemath (e.g. a stale/crafted `?from=now/&to=now`). Since this
  // runs at render time with no error boundary, fall back to the default range
  // instead of crashing the page.
  const parsedTimeRange = useMemo(() => {
    try {
      return parseTimeRange({ from, to });
    } catch {
      return parseTimeRange(DEFAULT_APM_TIME_RANGE);
    }
  }, [from, to]);

  const {
    data: allDiscoveredServices,
    isLoading: servicesLoading,
    error: servicesError,
    refetch: refetchServices,
  } = useServices({
    startTime: parsedTimeRange.startTime,
    endTime: parsedTimeRange.endTime,
  });

  // Apply URL scope before the `services.length === 0` guard in `suggestions`.
  // Unscoped (no `?services=`) drafts nothing: the user picks services from the
  // filter popover, which writes the scope to the URL. A stale deep link that
  // names services discovery doesn't see resolves to an empty list, which the
  // "pick services" empty state handles the same as the initial landing.
  //
  // A deep link to an already-covered service still renders its drafts (so the
  // user sees them), but they default unchecked via the selection effect below,
  // consistent with how the picker disables covered services.
  const scopedServices = useMemo(() => {
    if (!scope.services) return [];
    const allow = new Set(scope.services);
    return allDiscoveredServices.filter((s) => allow.has(s.serviceName));
  }, [allDiscoveredServices, scope.services]);

  const services = scopedServices;

  // The URL named a scope, discovery returned services, but none of them match
  // — a stale/bookmarked deep link (e.g. `?services=cart` after the service
  // stopped emitting). Warn the user rather than silently showing the generic
  // "pick services" empty state, and offer a one-click way to clear the scope.
  const scopeFellThrough =
    scope.services !== undefined && allDiscoveredServices.length > 0 && scopedServices.length === 0;

  const {
    metricNames,
    labelValuesByMetric,
    existingRuleGroups,
    rulerFetchFailed,
    loading: discoveryLoading,
  } = useDiscoveryProbes({ http, datasourceId, epoch: discoveryEpoch });

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

  const allServiceNames = useMemo(
    () => (allDiscoveredServices ?? []).map((s) => s.serviceName).filter(Boolean),
    [allDiscoveredServices]
  );

  const { bySvc: healthBySvc, isLoading: healthLoading } = useServiceSloHealth({
    serviceNames: allServiceNames,
    datasourceId,
    apiClient,
  });

  const allServicesCoverage = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    for (const [svc, bucket] of healthBySvc) {
      if (!bucket.missingCanonicalPair) set.add(svc);
    }
    return set;
  }, [healthBySvc]);

  // Whether a draft is "covered" (and so defaults unchecked, to avoid a
  // dual-write). Unions both signals: a matching Prometheus recording rule
  // (`existingRuleMatch`, per-draft) OR the service already owning its canonical
  // availability+latency SLO pair (`allServicesCoverage`, from the health
  // rollup, which resolves asynchronously).
  const isDraftCovered = useCallback(
    (s: Suggestion) => !!s.existingRuleMatch || allServicesCoverage.has(s.input.spec.service),
    [allServicesCoverage]
  );

  // Keys the user has explicitly toggled. Re-seeding preserves the user's choice
  // for these while still letting the defaults (and a late-arriving coverage
  // signal) drive every untouched draft — so touching one draft never freezes
  // coverage-deselection for the others, and changing scope never discards
  // curation for services that remain.
  const touchedKeysRef = useRef<Set<string>>(new Set());

  // Default drafts to "selected" EXCEPT covered ones, but keep whatever the user
  // did to any draft they've touched. Runs whenever the draft set or the
  // coverage signal changes; prunes touched keys that are no longer present.
  useEffect(() => {
    const presentKeys = new Set(suggestions.map((s) => s.key));
    for (const k of touchedKeysRef.current) {
      if (!presentKeys.has(k)) touchedKeysRef.current.delete(k);
    }
    setSelected((prev) => {
      const next = new Set<string>();
      for (const s of suggestions) {
        const keep = touchedKeysRef.current.has(s.key) ? prev.has(s.key) : !isDraftCovered(s);
        if (keep) next.add(s.key);
      }
      return next;
    });
  }, [suggestions, isDraftCovered]);

  const toggle = useCallback((key: string) => {
    touchedKeysRef.current.add(key);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const setOverride = useCallback((key: string, patch: OverridePatch) => {
    setOverrides((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  const applyOverrides = useCallback(
    (s: Suggestion): Suggestion => {
      const o = overrides[s.key] ?? {};
      // Stamp canonicalKind from the suggestion so readers can classify
      // without re-running the heuristic (the explicit tag wins over the
      // heuristic fallback downstream).
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

  const { isCreating, rowStatusMap, progress, runCreate } = useBatchCreate({
    apiClient,
    notifications,
    history,
  });

  const runCreateSelected = useCallback(() => {
    // Backstop against dual-writes: never provision a draft whose service is
    // already covered, even if it stayed checked through a selection-state race
    // (e.g. the master checkbox marked it touched before the async coverage
    // signal resolved, so the seeding effect could no longer auto-deselect it).
    const picks = suggestions
      .filter((s) => selected.has(s.key) && !isDraftCovered(s))
      .map(applyOverrides);
    return runCreate(picks);
  }, [applyOverrides, isDraftCovered, runCreate, selected, suggestions]);

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
  const decoratedSuggestions = useMemo(
    () => suggestions.map(applyOverrides),
    [suggestions, applyOverrides]
  );
  const selectedCount = decoratedSuggestions.filter((s) => selected.has(s.key)).length;
  const totalRules = decoratedSuggestions
    .filter((s) => selected.has(s.key))
    .reduce((acc, s) => acc + s.estimatedRuleCount, 0);
  // Count with the same `isDraftCovered` union that drives default-unchecking,
  // not just `existingRuleMatch` — otherwise a service covered via the health
  // rollup (no matching recording rule) gets its drafts unchecked while the
  // "N drafts already covered" subline never renders, leaving the user with a
  // disabled Create and no explanation.
  const coveredCount = decoratedSuggestions.filter((s) => isDraftCovered(s)).length;
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
          // Union recording-rule + health-rollup coverage, matching the
          // page-level `coveredCount` and the default-unchecking in the seeding
          // effect (see `isDraftCovered`).
          coveredCount: drafts.filter((s) => isDraftCovered(s)).length,
          kinds,
        };
      })
      .filter((row) => row.drafts.length > 0);
  }, [uniqueServices, decoratedSuggestions, selected, isDraftCovered]);

  // Re-seed expansion to "all collapsed" whenever the *set of services* changes.
  // Keyed on the joined service names (not `serviceRows`, whose identity changes
  // on every selection toggle) so toggling a draft doesn't churn this effect.
  const serviceNameSig = useMemo(() => uniqueServices.join('\n'), [uniqueServices]);
  useEffect(() => {
    const names = serviceNameSig ? serviceNameSig.split('\n') : [];
    setExpandedMap((prev) => {
      const next: Record<string, boolean> = {};
      for (const name of names) {
        next[name] = prev[name] ?? false;
      }
      return next;
    });
  }, [serviceNameSig]);

  const toggleExpand = useCallback((serviceName: string) => {
    setExpandedMap((prev) => ({ ...prev, [serviceName]: !prev[serviceName] }));
  }, []);

  const toggleServiceSelection = useCallback((row: ServiceRowShape) => {
    const allSelected = row.selectedCount === row.drafts.length;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const d of row.drafts) {
        touchedKeysRef.current.add(d.key);
        if (allSelected) next.delete(d.key);
        else next.add(d.key);
      }
      return next;
    });
  }, []);

  const loading = configLoading || servicesLoading || discoveryLoading;

  const headerActions = [
    // Navigate to the SLO listing rather than `history.goBack()`: the primary
    // entry to this page is a cross-app deep link (or a fresh/bookmarked URL),
    // so the router stack length is often 1 and `goBack()` is a no-op (or exits
    // the app). Pushing the listing route always lands somewhere useful.
    <EuiButtonEmpty key="back" iconType="arrowLeft" size="s" onClick={() => history.push('/slos')}>
      {i18n.translate('observability.apm.slo.suggest.backButton', {
        defaultMessage: 'Cancel',
      })}
    </EuiButtonEmpty>,
    // Re-run service discovery + the ruler/probe fetch. Recovers from a
    // transient ruler outage (the "could not verify existing recording rules"
    // warning) without forcing a full page reload.
    <EuiButton
      key="rediscover"
      size="s"
      iconType="refresh"
      onClick={() => {
        refetchServices();
        setDiscoveryEpoch((n) => n + 1);
      }}
      isLoading={loading}
      data-test-subj="slosSuggestDiscover"
    >
      {i18n.translate('observability.apm.slo.suggest.rediscoverButton', {
        defaultMessage: 'Rediscover',
      })}
    </EuiButton>,
    <EuiButton
      key="preview"
      size="s"
      iconType={showPreview ? 'eyeClosed' : 'eye'}
      onClick={() => setShowPreview((v) => !v)}
      isDisabled={selectedCount === 0}
      data-test-subj="slosSuggestPreviewToggle"
    >
      {i18n.translate('observability.apm.slo.suggest.previewToggle.label', {
        defaultMessage: 'Preview',
      })}
    </EuiButton>,
    <EuiButton
      key="create"
      size="s"
      fill
      iconType="plusInCircle"
      color="primary"
      onClick={createSelected}
      isLoading={isCreating}
      // Also gate on `healthLoading`: the coverage rollup resolves async and
      // drives which drafts default unchecked. Creating before it lands risks
      // dual-writing rules for a service that's already covered.
      isDisabled={selectedCount === 0 || loading || healthLoading}
      data-test-subj="slosSuggestCreate"
    >
      {i18n.translate('observability.apm.slo.suggest.createSelectedButton', {
        defaultMessage: 'Create {selectedCount} {selectedCount, plural, one {SLO} other {SLOs}}',
        values: { selectedCount },
      })}
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
              <h4>
                {i18n.translate('observability.apm.slo.suggest.heading', {
                  defaultMessage: 'Suggest SLOs from APM services',
                })}
              </h4>
            </EuiText>
            <EuiSpacer size="xs" />
            <EuiText size="xs" color="subdued">
              {i18n.translate('observability.apm.slo.suggest.subheading', {
                defaultMessage:
                  'Drafts availability + latency SLOs per service from span-derived RED metrics, plus OTel semconv add-ons where present.',
              })}
            </EuiText>
            <EuiSpacer size="xs" />
            <EuiText size="xs" color="subdued">
              {i18n.translate('observability.apm.slo.suggest.namespaceLabel', {
                defaultMessage: 'Namespace: ',
              })}
              <EuiCode>slo-generated</EuiCode>
            </EuiText>
            {servicesError && (
              <>
                <EuiCallOut
                  color="danger"
                  iconType="alert"
                  title={i18n.translate('observability.apm.slo.suggest.servicesErrorTitle', {
                    defaultMessage: 'Failed to load services',
                  })}
                  size="s"
                >
                  <EuiText size="s">{servicesError.message}</EuiText>
                </EuiCallOut>
                <EuiSpacer size="m" />
              </>
            )}

            {loading && (
              <EuiFlexGroup
                justifyContent="center"
                alignItems="center"
                className="slo-suggest-loading"
              >
                <EuiFlexItem grow={false}>
                  <EuiLoadingSpinner size="xl" />
                </EuiFlexItem>
              </EuiFlexGroup>
            )}

            {!loading && !datasourceId && (
              <EuiCallOut
                size="s"
                iconType="iInCircle"
                title={i18n.translate('observability.apm.slo.suggest.noDatasource.title', {
                  defaultMessage: 'No Prometheus datasource configured',
                })}
                color="warning"
              >
                <EuiText size="s">
                  {i18n.translate('observability.apm.slo.suggest.noDatasource.body', {
                    defaultMessage:
                      'Configure a Prometheus datasource under APM configuration before suggesting SLOs.',
                  })}
                </EuiText>
              </EuiCallOut>
            )}

            {!loading && datasourceId && allDiscoveredServices.length === 0 && !servicesError && (
              <EuiCallOut
                size="s"
                iconType="iInCircle"
                title={i18n.translate('observability.apm.slo.suggest.noServices.title', {
                  defaultMessage: 'No APM services were discovered',
                })}
              >
                <EuiText size="s">
                  {i18n.translate('observability.apm.slo.suggest.noServices.body', {
                    defaultMessage:
                      'No services appear to be sending OTel traces right now. If you expect services here, verify the APM trace dataset and window duration under APM configuration.',
                  })}
                </EuiText>
              </EuiCallOut>
            )}

            {!loading && datasourceId && rulerFetchFailed && (
              <>
                <EuiCallOut
                  size="s"
                  iconType="alert"
                  color="warning"
                  title={i18n.translate('observability.apm.slo.suggest.rulerFetchFailed.title', {
                    defaultMessage: 'Could not verify existing recording rules',
                  })}
                  data-test-subj="slosSuggestRulerFetchFailed"
                >
                  <EuiText size="s">
                    {i18n.translate('observability.apm.slo.suggest.rulerFetchFailed.body', {
                      defaultMessage:
                        'The Prometheus ruler did not respond when this page tried to list its current recording groups. Suggestions and bulk-create still work, but duplicate recording groups may be created if rules already exist for these SLIs.',
                    })}
                  </EuiText>
                </EuiCallOut>
                <EuiSpacer size="m" />
              </>
            )}

            {!loading && datasourceId && scopeFellThrough && (
              <>
                <EuiCallOut
                  size="s"
                  iconType="iInCircle"
                  color="warning"
                  title={i18n.translate('observability.apm.slo.suggest.scopeFellThrough.title', {
                    defaultMessage: 'Scoped services not found',
                  })}
                  data-test-subj="slosSuggestScopeFellThrough"
                >
                  <EuiText size="s">
                    {i18n.translate('observability.apm.slo.suggest.scopeFellThrough.body', {
                      defaultMessage:
                        "These services aren't in the current APM discovery result. Clear the scope to pick from all discovered services.",
                    })}
                  </EuiText>
                  <EuiSpacer size="xs" />
                  <EuiButtonEmpty
                    size="xs"
                    onClick={() => history.push('/slos/suggest')}
                    data-test-subj="slosSuggestClearScope"
                  >
                    {i18n.translate('observability.apm.slo.suggest.clearScope', {
                      defaultMessage: 'Clear scope',
                    })}
                  </EuiButtonEmpty>
                </EuiCallOut>
                <EuiSpacer size="m" />
              </>
            )}

            {!loading && datasourceId && allDiscoveredServices.length > 0 && !servicesError && (
              <>
                {decoratedSuggestions.length > 0 && (
                  <>
                    <EuiFlexGroup
                      alignItems="center"
                      responsive={false}
                      gutterSize="m"
                      data-test-subj="slosSuggestHeaderStrip"
                    >
                      <EuiFlexItem grow={false}>
                        <EuiPanel paddingSize="m" hasBorder>
                          <EuiStat
                            title={`${selectedCount}`}
                            description={i18n.translate(
                              'observability.apm.slo.suggest.stat.ofSlos',
                              {
                                defaultMessage: 'of {total} SLOs',
                                values: { total: decoratedSuggestions.length },
                              }
                            )}
                            titleSize="m"
                            reverse
                            data-test-subj="slosSuggestStatSlos"
                          />
                        </EuiPanel>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiPanel paddingSize="m" hasBorder>
                          <EuiStat
                            title={`${uniqueServices.length}`}
                            description={i18n.translate(
                              'observability.apm.slo.suggest.stat.services',
                              {
                                defaultMessage: '{count, plural, one {service} other {services}}',
                                values: { count: uniqueServices.length },
                              }
                            )}
                            titleSize="m"
                            reverse
                            data-test-subj="slosSuggestStatServices"
                          />
                        </EuiPanel>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiPanel paddingSize="m" hasBorder>
                          <EuiStat
                            title={`${totalRules}`}
                            description={i18n.translate(
                              'observability.apm.slo.suggest.stat.rulesToProvision',
                              { defaultMessage: 'rules to provision' }
                            )}
                            titleSize="m"
                            titleColor="subdued"
                            reverse
                            data-test-subj="slosSuggestStatRules"
                          />
                        </EuiPanel>
                      </EuiFlexItem>
                      <EuiFlexItem grow={true} />
                    </EuiFlexGroup>
                    {coveredCount > 0 && <EuiSpacer size="xs" />}
                    {coveredCount > 0 && (
                      <EuiText size="xs" color="subdued" data-test-subj="slosSuggestHeaderSubline">
                        {i18n.translate('observability.apm.slo.suggest.headerSubline.covered', {
                          defaultMessage:
                            '{count, plural, one {# draft} other {# drafts}} already covered by existing rules',
                          values: { count: coveredCount },
                        })}
                      </EuiText>
                    )}
                    {progress && (
                      <>
                        <EuiPanel
                          paddingSize="s"
                          hasBorder
                          data-test-subj="slosSuggestProgressStrip"
                        >
                          <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                            <EuiFlexItem grow={false}>
                              <EuiText size="xs">
                                {i18n.translate('observability.apm.slo.suggest.progressPrefix', {
                                  defaultMessage: 'Creating SLO {done}/{total} · ',
                                  values: { done: progress.done, total: progress.total },
                                })}
                                <strong>{progress.failed}</strong>
                                {i18n.translate('observability.apm.slo.suggest.progressSuffix', {
                                  defaultMessage: ' failed so far',
                                })}
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
                  </>
                )}

                {/* The service picker is always available once services are
                    discovered — it's how the user scopes drafts, including from
                    the empty initial state. */}
                <SuggestServiceFilter
                  allServices={allDiscoveredServices}
                  coveredSet={allServicesCoverage}
                  scopedServices={scope.services}
                  timeRange={timeRange}
                  history={history}
                />
                <EuiSpacer size="s" />

                {decoratedSuggestions.length > 0 ? (
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
                    coveredServices={allServicesCoverage}
                  />
                ) : (
                  <EuiPanel
                    color="subdued"
                    hasShadow={false}
                    paddingSize="l"
                    data-test-subj="slosSuggestPickServices"
                  >
                    <EuiText size="s" color="subdued" textAlign="center">
                      {i18n.translate('observability.apm.slo.suggest.pickServices.prompt', {
                        defaultMessage: 'Pick one or more services to suggest SLOs for.',
                      })}
                    </EuiText>
                  </EuiPanel>
                )}
              </>
            )}
          </EuiPageContentBody>
        </EuiPageContent>
      </EuiPageBody>
      {/* Persistent right-dock flyout. `type="push"` reflows the page; the
          flyout is only rendered when the preview toggle is on AND there
          are selected drafts, so `selectedCount === 0` auto-closes it.
          Keystrokes in override fields don't flip `showPreview`, so the
          subtree — and SuggestBatchPreview's debounced effect — stays
          mounted across rapid edits. */}
      {showPreview && selectedCount > 0 && (
        <ResizableFlyout
          width={flyoutWidth}
          onResize={setFlyoutWidth}
          onClose={() => setShowPreview(false)}
        >
          <EuiFlyoutHeader hasBorder data-test-subj="slosSuggestPreviewFlyoutHeader">
            <EuiTitle size="s">
              <h3>
                {i18n.translate('observability.apm.slo.suggest.flyoutTitle', {
                  defaultMessage: 'Rule preview · {count, plural, one {# SLO} other {# SLOs}}',
                  values: { count: selectedCount },
                })}
              </h3>
            </EuiTitle>
          </EuiFlyoutHeader>
          <EuiFlyoutBody className="slo-suggest-flyout__body">
            <SuggestBatchPreview
              apiClient={apiClient}
              selectedSuggestions={decoratedSuggestions.filter((s) => selected.has(s.key))}
              prometheusConnectionId={config?.prometheusDataSource?.name}
              prometheusConnectionMeta={config?.prometheusDataSource?.meta}
            />
          </EuiFlyoutBody>
        </ResizableFlyout>
      )}
      {confirmOpen && (
        <EuiConfirmModal
          title={i18n.translate('observability.apm.slo.suggest.confirmModal.title', {
            defaultMessage: 'Create {count, plural, one {# SLO} other {# SLOs}}?',
            values: { count: selectedCount },
          })}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            runCreateSelected();
          }}
          cancelButtonText={i18n.translate('observability.apm.slo.suggest.confirmModal.cancel', {
            defaultMessage: 'Cancel',
          })}
          confirmButtonText={i18n.translate('observability.apm.slo.suggest.confirmModal.confirm', {
            defaultMessage: 'Create',
          })}
          defaultFocusedButton="confirm"
          data-test-subj="slosSuggestConfirmModal"
        >
          <EuiText size="s">
            <p>
              {i18n.translate('observability.apm.slo.suggest.confirmModal.bodyPrefix', {
                defaultMessage: 'This provisions ',
              })}
              <strong>{totalRules}</strong>
              {i18n.translate('observability.apm.slo.suggest.confirmModal.bodyMiddle', {
                defaultMessage: ' Prometheus rules in namespace ',
              })}
              <EuiCode>slo-generated</EuiCode>
              {i18n.translate('observability.apm.slo.suggest.confirmModal.bodySuffix', {
                defaultMessage:
                  '. Rules begin evaluating on the next ruler cycle; alerts do not fire until data accumulates.',
              })}
            </p>
          </EuiText>
        </EuiConfirmModal>
      )}
    </EuiPage>
  );
};
