/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alert Manager UI — top-level container.
 *
 * Owns:
 *   - Datasource selection (persisted per-tab in `localStorage` by name).
 *   - Time-range picker state (persisted per-tab in `sessionStorage` as
 *     date-math strings, defaulting to `now-24h` → `now`). Pagination of the
 *     in-memory alerts list stays local.
 *   - `refreshToken` state bumped by the refresh button next to the picker;
 *     `useAlerts` treats it as an effect dependency so bumping it refetches
 *     without changing the range.
 *
 * Alerts data flows via `useAlerts` — the hook wraps the APM-pattern
 * `AlertingOpenSearchService.listAlerts` transport (no `alarms_client.ts`).
 * Rules data flows via `useRulesData` — the hook owns the rules array,
 * total, loading state, error, and per-datasource warnings.
 *
 * sessionStorage keys:
 *   - `AlertManagerStartTime` — date-math string for picker start.
 *   - `AlertManagerEndTime`   — date-math string for picker end.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { EuiCallOut, EuiLink, EuiTab, EuiTabs } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';
import { toMountPoint } from '../../../../../src/plugins/opensearch_dashboards_react/public';
import { useToast } from '../common/toast';
import {
  Datasource,
  UnifiedAlertSummary,
  UnifiedRule,
  UnifiedRuleSummary,
} from '../../../common/types/alerting';
import { MonitorsTable } from './monitors_table';
import { CreateMonitor, MonitorFormState } from './create_monitor';
import { EditMonitor } from './create_monitor/edit_monitor';
import { AlertsDashboard } from './alerts_dashboard';
import { AlertDetailFlyout } from './alert_detail_flyout';
import { AnomalyDetailFlyout } from './anomaly_detail_flyout';
import { NotificationRoutingPanel } from './notification_routing_panel';
import type { MonitorBackendType } from './monitor_form_components';
import { useAlerts } from './hooks/use_alerts';
import { useAlertingPluginAvailability } from './hooks/use_alerting_plugin_availability';
import { useDatasourceSelection } from './hooks/use_datasource_selection';
import { useMonitorMutations } from './hooks/use_monitor_mutations';
import { useRulesData } from './hooks/use_rules_data';
import { AlertingOpenSearchService } from './query_services/alerting_opensearch_service';
import { useTimeRange } from './hooks/use_time_range';
import { AlarmsPageCallouts } from './alarms_page_callouts';
import { coreRefs } from '../../framework/core_refs';
import { setNavBreadCrumbs } from '../../../common/utils/set_nav_bread_crumbs';
import { observabilityID, observabilityTitle } from '../../../common/constants/shared';
import { ALERT_MANAGER_MAX_DATASOURCES_SETTING } from '../../../common/constants/alerting_settings';
import { transformPplFormToPayload } from '../../../common/services/alerting/form_transforms';
import { PPL_MONITOR_NAME_MAX } from '../../../common/services/alerting/validators';
import { showMonitorCreatedToast } from './toast_helpers';
import './alerting.scss';
import type { OpenSearchFormState } from './create_monitor/create_monitor_types';
import {
  extractPplValidationError,
  extractServerErrorMessage,
  formStateToRule,
  resolveDatasourceTokens,
} from './alarms_page_helpers';

/**
 * App id of the legacy (pre-unified) alerting experience, served by the
 * standalone `alerts` plugin. The "old experience" link in the new-experience
 * callout deep-links to its `#/dashboard` route.
 */
const OLD_ALERTING_APP_ID = 'alerts';

/** localStorage key persisting dismissal of the new-experience intro callout. */
const NEW_EXPERIENCE_CALLOUT_DISMISSED_KEY = 'observability.alerting.newExperienceCalloutDismissed';

// ============================================================================
// Main Page Component
// ============================================================================
interface AlarmsPageProps {
  /** Datasources sourced from saved-object types (data-source + data-connection). */
  datasources: Datasource[];
  /** True while the initial datasource discovery is pending. */
  datasourcesLoading: boolean;
  /** Datasource names/ids to pre-select on first mount (from uiSettings). */
  defaultDatasources: string[];
  /** Cap on concurrently selected datasources (from uiSettings). */
  maxDatasources: number;
}

type TabId = 'alerts' | 'rules' | 'routing';

/**
 * Parse a hash-route deep link of the form `#/rules?q=<query>&ds=<dsId>`
 * into the tab to land on, an optional initial search query, and an
 * optional datasource id to add to the selection on mount. Returns an
 * empty object on any unknown shape so the caller keeps its default
 * state (Alerts tab, empty search, persisted DS selection). Tested
 * through `<AlarmsPage>` mount tests.
 *
 * The `ds` param exists because deep-links from SLO detail (BUG-12) and
 * any future cross-app entry point need to land the user on a filter
 * selection that *includes* the rules they came to look at — without
 * `ds`, the persisted last-used selection wins and an SLO whose rules
 * live on a Prometheus datasource the user just unchecked silently
 * shows zero matches.
 */
export function parseAlarmsHashRoute(hash: string): { tab?: TabId; q?: string; ds?: string } {
  if (!hash) return {};
  // Strip leading `#` then `/`. The hash router's URLs are
  // `#/rules?q=…` or `#/routing` etc.
  const stripped = hash.replace(/^#\/?/, '');
  if (stripped.length === 0) return {};
  const [pathPart, queryPart = ''] = stripped.split('?', 2);
  const segment = pathPart.split('/')[0];
  const tab: TabId | undefined =
    segment === 'rules' || segment === 'alerts' || segment === 'routing' ? segment : undefined;
  let q: string | undefined;
  let ds: string | undefined;
  if (queryPart) {
    try {
      const params = new URLSearchParams(queryPart);
      const rawQ = params.get('q');
      if (rawQ && rawQ.trim()) q = rawQ;
      const rawDs = params.get('ds');
      if (rawDs && rawDs.trim()) ds = rawDs;
    } catch {
      // Malformed query string — treat as no params rather than throwing.
    }
  }
  return { tab, q, ds };
}

const TAB_LABELS: Record<TabId, string> = {
  alerts: i18n.translate('observability.alerting.alarmsPage.tabLabel.alerts', {
    defaultMessage: 'Alerts',
  }),
  rules: i18n.translate('observability.alerting.alarmsPage.tabLabel.rules', {
    defaultMessage: 'Rules',
  }),
  routing: i18n.translate('observability.alerting.alarmsPage.tabLabel.routing', {
    defaultMessage: 'Routing',
  }),
};

/** Build the payload for Prometheus rule create/edit/clone operations. */
function buildPrometheusRulePayload(opts: {
  name: string;
  query: string;
  operator: string;
  threshold: number;
  forDuration: string;
  evaluationInterval: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  enabled: boolean;
  groupName?: string;
}) {
  return {
    name: opts.name,
    query: opts.query,
    operator: opts.operator,
    threshold: opts.threshold,
    forDuration: opts.forDuration,
    evaluationInterval: opts.evaluationInterval,
    labels: opts.labels,
    annotations: opts.annotations,
    enabled: opts.enabled,
    ...(opts.groupName ? { groupName: opts.groupName } : {}),
  };
}

export const AlarmsPage: React.FC<AlarmsPageProps> = ({
  datasources,
  datasourcesLoading,
  defaultDatasources,
  maxDatasources,
}) => {
  const mutations = useMonitorMutations();
  const osService = useMemo(() => new AlertingOpenSearchService(), []);

  // Deep-link parsing — when SLO detail (or any other surface) navigates to
  // `#/rules?q=<rulename>&ds=<dsId>` we want to land on the Rules tab with
  // the search box pre-filled and the right datasource selected. Tracked as
  // state with a `hashchange` listener so cross-tab deep-links from inside
  // the alerting app itself (e.g. the alert-detail flyout's "Open monitor"
  // button — BUG-14) re-apply the params; otherwise `navigateToApp` within
  // the same app would change `window.location.hash` without re-mounting
  // this component, and the static one-shot read would miss the update.
  // The hash-router lives at
  // `/<basepath>/app/observability-alerting#/rules?q=…`, so the `?q=…` is a
  // tail of `location.hash`, not `location.search`.
  const [deepLink, setDeepLink] = useState(() => parseAlarmsHashRoute(window.location.hash));
  useEffect(() => {
    const onHashChange = () => setDeepLink(parseAlarmsHashRoute(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  const [activeTab, setActiveTab] = useState<TabId>(deepLink.tab ?? 'alerts');
  // Switch tab whenever the deep-link updates with a valid tab. Uses the
  // full `deepLink` object as the dependency (not just `.tab`) so that
  // repeated navigations to the same tab (e.g. #/rules?q=A then #/rules?q=B)
  // still re-apply the tab switch even when the user has manually clicked
  // away to a different tab in between.
  useEffect(() => {
    if (deepLink.tab) setActiveTab(deepLink.tab);
  }, [deepLink]);

  // Mirror the active tab into the URL hash so reload / bookmark / back-button
  // round-trip the user's selection. Skipped when the hash already matches
  // (avoids redundant history entries on same-tab clicks).
  //
  // Deep-link query params (`q=…&ds=…`) are intentionally not preserved on
  // user-initiated tab clicks — a stale filter from an inbound link
  // shouldn't follow the user into the Alerts / Routing tabs they navigate
  // to next.
  //
  // `replaceState` does NOT fire `hashchange`, which is exactly what we
  // want here: we've already updated `activeTab` directly, and firing the
  // event would round-trip back through the deep-link `useEffect` for no
  // benefit. `navigateToApp` would force a remount; `replaceState` is the
  // cheapest path that still updates the URL bar.
  const handleTabClick = useCallback((next: TabId) => {
    setActiveTab(next);
    const desiredHash = `#/${next}`;
    if (window.location.hash !== desiredHash) {
      window.history.replaceState(null, '', desiredHash);
    }
  }, []);

  // ---- Datasource selection (priority order + persistence) ----
  const { selectedDsIds, setSelectedDsIds } = useDatasourceSelection({
    datasources,
    datasourcesLoading,
    defaultDatasources,
    maxDatasources,
  });

  // Apply the deep-link `ds` once the datasource list is hydrated so the
  // landing tab actually has rows to show. Without this, a deep-link from
  // SLO detail (BUG-12) or the alert-detail flyout (BUG-14) lands on
  // Rules tab with the persisted DS selection — and if the linked DS
  // isn't in that selection the rules table renders zero matches even
  // though the rules exist. We *augment* (not replace) the persisted
  // selection so the user doesn't lose unrelated DS picks; if the cap
  // would be exceeded we slice off the oldest entries.
  //
  // Tracked via a ref so a single deep-link applies once even though the
  // effect's deps churn on every selection change. The ref is reset to
  // the latest `deepLink.ds` whenever a new hashchange brings a fresh
  // value — that way cross-tab deep-links inside the same app (alert
  // flyout's "Open monitor") still re-apply.
  const lastAppliedDsRef = useRef<string | undefined>(undefined);
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    };
  }, []);
  useEffect(() => {
    const dsId = deepLink.ds;
    if (!dsId) return;
    if (datasourcesLoading) return;
    if (lastAppliedDsRef.current === dsId) return;
    if (!datasources.some((d) => d.id === dsId)) return;
    if (selectedDsIds.includes(dsId)) {
      lastAppliedDsRef.current = dsId;
      return;
    }
    setSelectedDsIds([...selectedDsIds, dsId].slice(0, maxDatasources));
    lastAppliedDsRef.current = dsId;
  }, [
    deepLink.ds,
    datasources,
    datasourcesLoading,
    selectedDsIds,
    setSelectedDsIds,
    maxDatasources,
  ]);

  // Probe each OS datasource once on mount to confirm `opensearch-alerting`
  // is installed. Without this check, users with the OSD feature flag on
  // but a vanilla cluster see cryptic transport errors at every interaction.
  const alertingAvailability = useAlertingPluginAvailability(datasources);

  // ---- Time-range state ----
  const {
    startTime,
    endTime,
    startMs,
    endMs,
    refreshToken,
    onTimeChange: handleTimeChange,
    onRefresh: handleRefreshTime,
    bumpRefreshToken,
  } = useTimeRange();

  // ---- Alerts data (migrated off inline fetchAlerts onto useAlerts) ----
  const { data: alertsData, isLoading: alertsLoading, error: alertsError } = useAlerts({
    dsIds: selectedDsIds,
    startTime,
    endTime,
    refreshToken,
  });

  // Optimistic ack overrides — keyed by alertId. The hook owns the alerts
  // array (single source of truth), so we layer the user's pending acks
  // on top in render rather than mutating the hook's data. Cleared per-id
  // once a refetch confirms the ack landed (or the id disappears from the
  // list, e.g. retention drop). Without this, clicking Acknowledge feels
  // unresponsive because the Prometheus historical-reconstruction refetch
  // can take seconds before the row state visibly flips.
  const [ackOverrides, setAckOverrides] = useState<
    Record<string, { state: 'acknowledged'; lastUpdated: string }>
  >({});

  // Public-facing projections. Kept in the same shape the rest of this
  // component consumed before the migration so the downstream code didn't
  // have to change. Behaviorally identical to the old `alerts`/`alertsTotal`
  // state but now driven by the hook.
  const rawAlerts: UnifiedAlertSummary[] = useMemo(() => alertsData?.results || [], [alertsData]);
  const alerts: UnifiedAlertSummary[] = useMemo(() => {
    if (Object.keys(ackOverrides).length === 0) return rawAlerts;
    return rawAlerts.map((a) => {
      const ov = ackOverrides[a.id];
      return ov ? { ...a, state: ov.state, lastUpdated: ov.lastUpdated } : a;
    });
  }, [rawAlerts, ackOverrides]);
  const alertsTotal = alerts.length;

  // Drop overrides whose target alert is now acknowledged on the server
  // (or has fallen out of the result set entirely). Runs after every hook
  // refetch — keeps the override map from leaking memory across many acks.
  useEffect(() => {
    setAckOverrides((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      let changed = false;
      const next = { ...prev };
      const byId = new Map(rawAlerts.map((a) => [a.id, a]));
      for (const id of Object.keys(prev)) {
        const live = byId.get(id);
        if (!live || live.state === 'acknowledged') {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [rawAlerts]);
  const alertsWarnings = useMemo(() => {
    const failed = (alertsData?.datasourceStatus || []).filter(
      (s) => s.status === 'error' || !!s.error
    );
    return failed.map((s) => ({
      datasourceName: s.datasourceName,
      error:
        s.error ||
        i18n.translate('observability.alerting.alarmsPage.unknownError', {
          defaultMessage: 'Unknown error',
        }),
    }));
  }, [alertsData]);
  // Backend hints surfaced through the dashboard banner props.
  const alertsTruncated = (alertsData?.datasourceStatus || []).some((s) => s.truncated);
  const alertsFallbackHints = useMemo(
    () =>
      (alertsData?.datasourceStatus || [])
        .filter((s) => s.fallback)
        .map((s) => ({ datasourceName: s.datasourceName, fallback: s.fallback! })),
    [alertsData]
  );
  const alertsErrorMessage =
    alertsError instanceof Error ? alertsError.message : alertsError ? String(alertsError) : null;

  // Pagination state: previously `alertsPage` / `alertsPageSize` lived here
  // to feed the old inline `fetchAlerts` callback. `useAlerts` returns the
  // full dataset (server doesn't paginate the unified endpoint), so local
  // alerts pagination state is no longer needed — `AlertsDashboard` slices
  // the results client-side via `EuiInMemoryTable`.

  // ---- Rules data ----
  const {
    rules,
    rulesTotal,
    isLoading: dataLoading,
    error,
    warnings: rulesWarnings,
    setRules,
    setRulesTotal,
    refetch: refetchRules,
  } = useRulesData({ selectedDsIds });

  const [deletedRuleIds, setDeletedRuleIds] = useState<Set<string>>(new Set());
  const [showCreateMonitor, setShowCreateMonitor] = useState(false);

  // Inline error surface for the PPL editor — set when the most recent
  // create/update returns a `PPL Query validation failed: ...` 400 (BUG-4).
  // Cleared as soon as the user edits the query, the flyout closes, or a
  // subsequent save succeeds.
  const [pplSubmitError, setPplSubmitError] = useState<string | null>(null);

  // Build a (dsId, name) lookup over the currently-loaded rules, used by the
  // create/edit flyouts to flag duplicates inline before submit (BUG-1).
  // Comparison is case-insensitive against the trimmed candidate, matching
  // how a human reads alert lists. Note: this only knows about rules the
  // datasource filter has surfaced — saving against an unselected DS could
  // still create a same-name monitor on that DS, but that's a much narrower
  // footgun than the original "two identical names on the same cluster".
  const rulesByDsName = useMemo(() => {
    const map = new Map<string, Set<string>>();
    rules.forEach((r) => {
      if (deletedRuleIds.has(r.id)) return;
      const dsKey = r.datasourceId;
      const names = map.get(dsKey) ?? new Set<string>();
      names.add(r.name.trim().toLowerCase());
      map.set(dsKey, names);
    });
    return map;
  }, [rules, deletedRuleIds]);

  const isNameTakenForCreate = useCallback(
    (name: string, dsId: string) => {
      const set = rulesByDsName.get(dsId);
      return !!set?.has(name.trim().toLowerCase());
    },
    [rulesByDsName]
  );

  const buildIsNameTakenForEdit = useCallback(
    (excludeRuleId: string) => (name: string, dsId: string) => {
      const trimmed = name.trim().toLowerCase();
      // Walk the rule list directly so we can exclude the monitor being
      // edited; the cached map doesn't carry id information.
      return rules.some(
        (r) =>
          r.id !== excludeRuleId &&
          !deletedRuleIds.has(r.id) &&
          r.datasourceId === dsId &&
          r.name.trim().toLowerCase() === trimmed
      );
    },
    [rules, deletedRuleIds]
  );
  // The popover's "Logs" entry maps to an OpenSearch monitor; "Metrics" toasts
  // "coming soon" until PR 2 lights up the Prom create flyout. When the user
  // picks Logs the flyout is forced to the OS variant via this override even
  // if the parent-page selected datasource happens to be Prometheus.
  const [createBackendType, setCreateBackendType] = useState<MonitorBackendType | null>(null);
  const [editTarget, setEditTarget] = useState<{ dsId: string; ruleId: string } | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<UnifiedAlertSummary | null>(null);
  // Whether the "new alerting experience" intro callout has been dismissed.
  // Persisted in localStorage so it stays hidden across reloads once closed.
  const [newExperienceCalloutDismissed, setNewExperienceCalloutDismissed] = useState<boolean>(
    () => window.localStorage.getItem(NEW_EXPERIENCE_CALLOUT_DISMISSED_KEY) === 'true'
  );
  const dismissNewExperienceCallout = useCallback(() => {
    window.localStorage.setItem(NEW_EXPERIENCE_CALLOUT_DISMISSED_KEY, 'true');
    setNewExperienceCalloutDismissed(true);
  }, []);
  const { setToast: addToast } = useToast();

  const handleNavigateToDetectorResults = useCallback((href: string) => {
    if (coreRefs.application?.navigateToUrl) {
      coreRefs.application.navigateToUrl(href);
      return;
    }
    window.location.assign(href);
  }, []);

  const visibleRules = rules.filter((r) => !deletedRuleIds.has(r.id));

  // Fires when a user tries to select past `maxDatasources`. Pops a warning
  // toast with an in-toast link to the Advanced Settings entry so they can
  // raise the cap without hunting through Management. Uses the core toasts
  // API directly (not the shared `useToast` wrapper) because the wrapper
  // only accepts plain strings — we need a React body to render the link.
  //
  // Uses `window.location.assign('/app/settings#...')` instead of
  // `navigateToApp('management', ...)` because Advanced Settings doesn't
  // support SPA redirection in a workspace context — the workspace path
  // prefix strips the hash and lands on a broken URL. See the same
  // workaround in trace_analytics helper_functions.tsx (line 70).
  const handleDatasourceCapReached = useCallback(() => {
    const toasts = coreRefs.toasts;
    const http = coreRefs.http;
    if (!toasts) return;
    // Advanced Settings renders each row with DOM id `${setting.name}-group`
    // (src/plugins/advanced_settings/.../field.tsx) and its scroll-to-hash
    // handler calls getElementById(hash) — so the hash must include the
    // `-group` suffix to scroll / highlight the target row.
    const settingsHref = `${
      http?.basePath.get() ?? ''
    }/app/settings#${ALERT_MANAGER_MAX_DATASOURCES_SETTING}-group`;
    toasts.addWarning({
      title: i18n.translate('observability.alerting.alarmsPage.maxDatasourcesToast.title', {
        defaultMessage: 'Maximum {maxDatasources} datasources can be selected',
        values: { maxDatasources },
      }),
      text: toMountPoint(
        <FormattedMessage
          id="observability.alerting.alarmsPage.maxDatasourcesToast.text"
          defaultMessage="Adjust the {settingName} setting in Advanced Settings to raise this cap. {openLink}"
          values={{
            settingName: (
              <strong>
                <FormattedMessage
                  id="observability.alerting.alarmsPage.maxDatasourcesToast.settingName"
                  defaultMessage="Alerts maximum selected datasources"
                />
              </strong>
            ),
            openLink: (
              <EuiLink onClick={() => window.location.assign(settingsHref)}>
                {i18n.translate(
                  'observability.alerting.alarmsPage.maxDatasourcesToast.openSetting',
                  {
                    defaultMessage: 'Open setting',
                  }
                )}
              </EuiLink>
            ),
          }}
        />
      ),
    });
  }, [maxDatasources]);

  // ---- Breadcrumbs ----

  useEffect(() => {
    const pageLabel = i18n.translate('observability.alerting.alarmsPage.breadcrumb.alerts', {
      defaultMessage: 'Alerts',
    });
    const tabLabel = TAB_LABELS[activeTab];
    // Suppress the tab segment when it duplicates the page-level segment
    // (the "Alerts" tab and the page name are both "Alerts").
    const trail =
      tabLabel === pageLabel ? [{ text: pageLabel }] : [{ text: pageLabel }, { text: tabLabel }];
    setNavBreadCrumbs([{ text: observabilityTitle, href: `${observabilityID}#/` }], trail);
  }, [activeTab]);

  // Reset pages when datasource selection changes. `useAlerts` refetches
  // automatically on `selectedDsIds` change, so no alerts-page reset here.
  const handleDatasourceChange = useCallback(
    (ids: string[]) => {
      setSelectedDsIds(ids);
      setDeletedRuleIds(new Set());
    },
    [setSelectedDsIds]
  );

  // ---- Handlers ----

  const handleAcknowledgeAlert = async (alertId: string) => {
    const alert = alerts.find((a) => a.id === alertId);
    try {
      await mutations.acknowledgeAlert(alertId, alert?.datasourceId, alert?.labels?.monitor_id);
      addToast(
        i18n.translate('observability.alerting.alarmsPage.toast.alertAcknowledged', {
          defaultMessage: 'Alert acknowledged',
        })
      );
      // Layer an optimistic override so the row flips to "acknowledged"
      // immediately. The override is dropped once the refetch's response
      // either confirms the ack or removes the row.
      const lastUpdated = new Date().toISOString();
      setAckOverrides((prev) => ({ ...prev, [alertId]: { state: 'acknowledged', lastUpdated } }));
      // Bump the refresh token so the hook refetches and the override can
      // be reconciled / cleared once the backend agrees.
      bumpRefreshToken();
      // Update the flyout's selected alert inline so it stays open with fresh state
      setSelectedAlert((prev) =>
        prev && prev.id === alertId
          ? { ...prev, state: 'acknowledged' as const, lastUpdated }
          : prev
      );
    } catch (e: unknown) {
      addToast(
        i18n.translate('observability.alerting.alarmsPage.toast.acknowledgeAlertFailed', {
          defaultMessage: 'Failed to acknowledge alert',
        }),
        'danger',
        extractServerErrorMessage(e)
      );
    }
  };

  const handleDeleteRules = async (ids: string[]) => {
    const failed: string[] = [];
    for (const id of ids) {
      const rule = rules.find((r) => r.id === id);
      if (!rule) {
        failed.push(id);
        addToast(
          i18n.translate('observability.alerting.alarmsPage.toast.deleteMonitorFailed', {
            defaultMessage: 'Failed to delete alert rule',
          }),
          'danger',
          i18n.translate('observability.alerting.alarmsPage.toast.monitorNotFoundInCache', {
            defaultMessage: 'Alert rule {id} not found in cache',
            values: { id },
          })
        );
        continue;
      }
      try {
        if (rule.datasourceType === 'prometheus') {
          // Prometheus rules are deleted via the Cortex ruler API using
          // the group name. Since Cortex deletes the entire group, check
          // if other rules share this group — if so, warn that siblings
          // will also be removed. Our create flow uses one rule per group,
          // but externally-authored groups may contain multiple rules.
          const groupName = rule.group || rule.name;
          const siblingsInGroup = rules.filter(
            (r) =>
              r.id !== id &&
              r.datasourceId === rule.datasourceId &&
              r.datasourceType === 'prometheus' &&
              (r.group || r.name) === groupName
          );
          if (siblingsInGroup.length > 0) {
            // Multi-rule group: warn via toast but proceed (user already
            // confirmed via the delete modal). A future enhancement can
            // implement per-rule splice (read group → remove rule → upsert).
            addToast(
              i18n.translate('observability.alerting.alarmsPage.toast.groupDeleteWarning', {
                defaultMessage:
                  'Deleting rule group "{groupName}" which contains {count} other rule(s)',
                values: { groupName, count: siblingsInGroup.length },
              }),
              'warning'
            );
          }
          await mutations.deletePrometheusRule(rule.datasourceId, groupName);
        } else {
          await mutations.deleteMonitor(id, rule.datasourceId);
        }
      } catch (e: unknown) {
        failed.push(id);
        addToast(
          i18n.translate('observability.alerting.alarmsPage.toast.deleteMonitorFailed', {
            defaultMessage: 'Failed to delete alert rule',
          }),
          'danger',
          extractServerErrorMessage(e)
        );
      }
    }
    const succeeded = ids.filter((id) => !failed.includes(id));
    if (succeeded.length > 0) {
      addToast(
        i18n.translate('observability.alerting.alarmsPage.toast.monitorsDeleted', {
          defaultMessage: '{count} alert rule(s) deleted',
          values: { count: succeeded.length },
        })
      );
    }
    setDeletedRuleIds((prev) => {
      const next = new Set(prev);
      succeeded.forEach((id) => next.add(id));
      return next;
    });
    if (succeeded.length > 0) {
      setRulesTotal((prev) => Math.max(0, prev - succeeded.length));
    }
  };

  const handleToggleMonitorEnabled = async (monitor: UnifiedRuleSummary): Promise<void> => {
    // The detail flyout only renders this for PPL monitors today; defend at
    // the page boundary anyway so a wider rollout doesn't accidentally PUT
    // against an unsupported monitor type.
    if (monitor.monitorType !== 'ppl') {
      addToast(
        i18n.translate('observability.alerting.alarmsPage.toast.toggleEnabledUnsupported', {
          defaultMessage: 'Enabling/disabling is only supported for PPL alert rules.',
        }),
        'warning'
      );
      return;
    }
    const nextEnabled = !monitor.enabled;
    try {
      // Server-side `updateMonitor` runs a GET-merge-PUT against the upstream
      // alerting plugin and explicitly preserves plugin-owned keys against
      // client overwrites, so a minimal partial body is sufficient. `name` is
      // the only field the route schema requires; `enabled` is the only field
      // we actually want to change.
      await mutations.updateMonitor(
        monitor.id,
        { name: monitor.name, enabled: nextEnabled },
        monitor.datasourceId
      );
      // Optimistically reflect the new state in the loaded rules list so the
      // flyout footer button label / status badge flips immediately. The
      // refetch reconciles whatever the backend ultimately persisted.
      setRules((prev) =>
        prev.map((r) =>
          r.id === monitor.id
            ? { ...r, enabled: nextEnabled, status: nextEnabled ? 'active' : 'disabled' }
            : r
        )
      );
      addToast(
        nextEnabled
          ? i18n.translate('observability.alerting.alarmsPage.toast.monitorEnabled', {
              defaultMessage: 'Alert rule enabled',
            })
          : i18n.translate('observability.alerting.alarmsPage.toast.monitorDisabled', {
              defaultMessage: 'Alert rule disabled',
            })
      );
      refetchRules();
    } catch (e: unknown) {
      addToast(
        nextEnabled
          ? i18n.translate('observability.alerting.alarmsPage.toast.enableMonitorFailed', {
              defaultMessage: 'Failed to enable alert rule',
            })
          : i18n.translate('observability.alerting.alarmsPage.toast.disableMonitorFailed', {
              defaultMessage: 'Failed to disable alert rule',
            }),
        'danger',
        e instanceof Error ? e.message : String(e)
      );
    }
  };

  const handleCloneRule = async (monitor: UnifiedRuleSummary) => {
    try {
      // Fetch the full rule detail to get the raw backend payload — the
      // summary shape doesn't carry the wire format needed for re-creation.
      const detail = await osService.getRuleDetail(
        monitor.datasourceId,
        monitor.id,
        monitor.definitionType
      );

      // Prometheus rules must be cloned via the Cortex ruler API, not the
      // OpenSearch Alerting monitor API (which requires `schedule`).
      if (detail.datasourceType === 'prometheus') {
        // Use a suffix that's safe for the ruleId regex [A-Za-z0-9_-]+
        // (no spaces or parentheses).
        const suffix = '-copy';
        const baseName =
          monitor.name.length + suffix.length > PPL_MONITOR_NAME_MAX
            ? monitor.name.slice(0, PPL_MONITOR_NAME_MAX - suffix.length)
            : monitor.name;
        const clonedName = `${baseName}${suffix}`;

        // Extract rule details from the unified shape + raw
        const raw = ((detail.raw ?? {}) as unknown) as Record<string, unknown>;
        const expr = String(raw.query || raw.expr || detail.query || '');
        const rawLabels = (raw.labels || detail.labels || {}) as Record<string, string>;
        const rawAnnotations = (raw.annotations || detail.annotations || {}) as Record<
          string,
          string
        >;
        const duration =
          typeof raw.duration === 'number'
            ? `${raw.duration}s`
            : String(raw.for || detail.pendingPeriod || '5m');
        const evalInterval = detail.evaluationInterval || '1m';

        // Parse threshold from expression (e.g. "up == 0" → operator "==", threshold 0)
        const parsed = detail.threshold || { operator: '>', value: 0 };

        const payload = {
          name: clonedName,
          query:
            expr.replace(/\s*(>|>=|<|<=|==|!=)\s*[\d.]+(?:[eE][+-]?\d+)?\s*$/, '').trim() || expr,
          operator: parsed.operator || '>',
          threshold: parsed.value ?? 0,
          forDuration: duration,
          evaluationInterval: evalInterval,
          labels: rawLabels,
          annotations: rawAnnotations,
          enabled: true,
        };
        await mutations.createPrometheusRule(payload, monitor.datasourceId);
        // Optimistic insert — show the cloned rule immediately in the UI
        const optimisticClone: UnifiedRuleSummary = {
          ...monitor,
          id: `new-clone-${Date.now()}`,
          name: clonedName,
          group: clonedName,
          status: 'pending',
        };
        setRules((prev) => [optimisticClone, ...prev]);
        setRulesTotal((prev) => prev + 1);
        addToast(
          i18n.translate('observability.alerting.alarmsPage.toast.monitorCloned', {
            defaultMessage: 'Monitor cloned',
          })
        );
        // Background refetch to reconcile with Cortex once it propagates
        refetchTimerRef.current = setTimeout(() => refetchRules(), 15000);
        return;
      }

      const raw = ((detail.raw ?? {}) as unknown) as Record<string, unknown>;
      const {
        id: _id,
        last_update_time: _t,
        enabled_time: _et,
        schema_version: _sv,
        owner: _ow,
        data_sources: _ds,
        ...rest
      } = raw;
      // Strip trigger IDs so the backend assigns fresh ones. Triggers live
      // inside wrapper keys like `ppl_trigger`, `query_level_trigger`, etc.,
      // and EACH wrapper carries an `actions[]` whose entries also have ids
      // — the backend rejects duplicate action ids on create, so we have to
      // strip those nested ids too. (F13.)
      const triggers = (rest.triggers as Array<Record<string, unknown>> | undefined) ?? [];
      const cleanTriggers = triggers.map((t) => {
        const cleaned: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(t)) {
          if (val && typeof val === 'object' && !Array.isArray(val)) {
            const { id: _tid, actions: actionsRaw, ...trigBody } = val as Record<string, unknown>;
            const cleanedActions = Array.isArray(actionsRaw)
              ? (actionsRaw as Array<Record<string, unknown>>).map(
                  ({ id: _aid, ...actionBody }) => actionBody
                )
              : actionsRaw;
            cleaned[key] =
              cleanedActions !== undefined ? { ...trigBody, actions: cleanedActions } : trigBody;
          } else {
            cleaned[key] = val;
          }
        }
        return cleaned;
      });
      const suffix = ' (Copy)';
      const baseName =
        monitor.name.length + suffix.length > PPL_MONITOR_NAME_MAX
          ? monitor.name.slice(0, PPL_MONITOR_NAME_MAX - suffix.length)
          : monitor.name;
      const payload: Record<string, unknown> = {
        ...rest,
        triggers: cleanTriggers,
        name: `${baseName}${suffix}`,
        type: 'monitor',
      };
      await mutations.createMonitor(payload, monitor.datasourceId);
      addToast(
        i18n.translate('observability.alerting.alarmsPage.toast.monitorCloned', {
          defaultMessage: 'Alert rule cloned',
        })
      );
      refetchRules();
    } catch (e: unknown) {
      addToast(
        i18n.translate('observability.alerting.alarmsPage.toast.cloneMonitorFailed', {
          defaultMessage: 'Failed to clone alert rule',
        }),
        'danger',
        extractServerErrorMessage(e)
      );
    }
  };

  const buildOptimisticRule = (formState: MonitorFormState, index = 0): UnifiedRule =>
    formStateToRule(formState, selectedDsIds[0], index);

  const resolveDatasourceId = (formState: MonitorFormState): string | null => {
    const dsId = formState.datasourceId || selectedDsIds[0];
    if (!dsId) {
      addToast(
        i18n.translate('observability.alerting.alarmsPage.toast.selectDatasourceForCreate', {
          defaultMessage: 'Select a datasource before creating an alert rule',
        }),
        'warning'
      );
      return null;
    }
    return dsId;
  };

  // OS create flyout only authors PPL monitors; Prom rules pass raw form state
  // through (PR 2 will add the Prom transform).
  const buildPayload = (form: MonitorFormState): Record<string, unknown> => {
    if (form.datasourceType === 'opensearch') {
      const os = form as OpenSearchFormState;
      return transformPplFormToPayload({
        name: os.name,
        enabled: os.enabled,
        query: os.query,
        schedule: os.schedule,
        pplTriggers: os.pplTriggers,
      });
    }
    return (form as unknown) as Record<string, unknown>;
  };

  const handleCreateMonitor = async (formState: MonitorFormState) => {
    const dsId = resolveDatasourceId(formState);
    if (!dsId) return;
    const newRule = buildOptimisticRule(formState);
    try {
      if (formState.datasourceType === 'prometheus') {
        // Prometheus rules go to the Cortex ruler API
        const promForm = formState as import('./create_monitor/create_monitor_types').PrometheusFormState;
        // Use pendingPeriod from Eval Settings if edited; fall back to threshold.forDuration
        const resolvedForDuration = promForm.pendingPeriod || promForm.threshold.forDuration;
        const payload = buildPrometheusRulePayload({
          name: promForm.name,
          query: promForm.query,
          operator: promForm.threshold.operator,
          threshold: promForm.threshold.value,
          forDuration: resolvedForDuration,
          evaluationInterval: promForm.evaluationInterval,
          labels: Object.fromEntries(
            promForm.labels.filter((l) => l.key && l.value).map((l) => [l.key, l.value])
          ),
          annotations: Object.fromEntries(
            promForm.annotations.filter((a) => a.key && a.value).map((a) => [a.key, a.value])
          ),
          enabled: promForm.enabled,
        });
        await mutations.createPrometheusRule(payload, dsId);

        // Cortex has eventual consistency (~30-60s propagation). Use
        // optimistic pattern: close flyout immediately, show toast, and
        // schedule a background refetch after 15s to sync the list.
        refetchTimerRef.current = setTimeout(() => refetchRules(), 15000);
      } else {
        await mutations.createMonitor(buildPayload(formState), dsId);
      }
      showMonitorCreatedToast({ monitorName: formState.name, dsId });
      setShowCreateMonitor(false);
      setCreateBackendType(null);
      setPplSubmitError(null);
      // Refetch rules so the new monitor (with backend-assigned id /
      // last_update_time) shows up in the list. Optimistic insert is kept
      // for the UI to feel instant; the refetch reconciles.
      setRules((prev) => [newRule, ...prev]);
      setRulesTotal((prev) => prev + 1);
      refetchRules();
    } catch (e: unknown) {
      const message = extractServerErrorMessage(e);
      const pplError = extractPplValidationError(message);
      if (pplError) setPplSubmitError(pplError);
      addToast(
        i18n.translate('observability.alerting.alarmsPage.toast.createMonitorFailed', {
          defaultMessage: 'Failed to create alert rule',
        }),
        'danger',
        message
      );
    }
  };

  const handleEditMonitor = async (formState: MonitorFormState, ruleId: string) => {
    const dsId = resolveDatasourceId(formState);
    if (!dsId) return;
    try {
      if (formState.datasourceType === 'prometheus') {
        // Prometheus rules use upsert semantics — same endpoint as create
        const promForm = formState as import('./create_monitor/create_monitor_types').PrometheusFormState;

        // Detect if the rule was renamed. In our design groupName === ruleName
        // (1 rule per group). Look up the original rule in the current rules list
        // Use pendingPeriod from Eval Settings if edited; fall back to threshold.forDuration
        const resolvedForDuration = promForm.pendingPeriod || promForm.threshold.forDuration;
        const payload = buildPrometheusRulePayload({
          name: promForm.name,
          query: promForm.query,
          operator: promForm.threshold.operator,
          threshold: promForm.threshold.value,
          forDuration: resolvedForDuration,
          evaluationInterval: promForm.evaluationInterval,
          labels: Object.fromEntries(
            promForm.labels.filter((l) => l.key && l.value).map((l) => [l.key, l.value])
          ),
          annotations: Object.fromEntries(
            promForm.annotations.filter((a) => a.key && a.value).map((a) => [a.key, a.value])
          ),
          enabled: promForm.enabled,
          groupName: promForm.name,
        });
        // Create new rule first, then delete old on success (prevents data loss
        // if create fails — worst case is a harmless duplicate).
        await mutations.createPrometheusRule(payload, dsId);

        const originalRule = rules.find((r) => r.id === ruleId);
        const originalGroupName = originalRule?.group || originalRule?.name || promForm.name;
        if (originalGroupName && originalGroupName !== promForm.name) {
          try {
            await mutations.deletePrometheusRule(dsId, originalGroupName);
          } catch {
            // Orphaned old group — harmless, user can delete manually
          }
        }
        // Background refetch to reconcile with Cortex once it propagates
        refetchTimerRef.current = setTimeout(() => refetchRules(), 15000);
      } else {
        await mutations.updateMonitor(ruleId, buildPayload(formState), dsId);
        // Immediate refetch for OpenSearch monitors (no propagation delay)
        refetchRules();
      }
      addToast(
        i18n.translate('observability.alerting.alarmsPage.toast.monitorUpdated', {
          defaultMessage: 'Alert rule updated successfully',
        })
      );
      setEditTarget(null);
      setPplSubmitError(null);
    } catch (e: unknown) {
      const message = extractServerErrorMessage(e);
      const pplError = extractPplValidationError(message);
      if (pplError) setPplSubmitError(pplError);
      addToast(
        i18n.translate('observability.alerting.alarmsPage.toast.updateMonitorFailed', {
          defaultMessage: 'Failed to update alert rule',
        }),
        'danger',
        message
      );
    }
  };

  const handleBatchCreateMonitors = async (forms: MonitorFormState[]) => {
    const succeededRules: UnifiedRule[] = [];
    for (let i = 0; i < forms.length; i++) {
      const dsId = resolveDatasourceId(forms[i]);
      if (!dsId) continue;
      try {
        await mutations.createMonitor(buildPayload(forms[i]), dsId);
        succeededRules.push(buildOptimisticRule(forms[i], i));
      } catch (e: unknown) {
        addToast(
          i18n.translate('observability.alerting.alarmsPage.toast.createMonitorFailed', {
            defaultMessage: 'Failed to create alert rule',
          }),
          'danger',
          extractServerErrorMessage(e)
        );
      }
    }
    if (succeededRules.length > 0) {
      addToast(
        i18n.translate('observability.alerting.alarmsPage.toast.monitorsCreated', {
          defaultMessage: '{count} alert rule(s) created successfully',
          values: { count: succeededRules.length },
        })
      );
      setRules((prev) => [...succeededRules, ...prev]);
      setRulesTotal((prev) => prev + succeededRules.length);
    }
    // Don't close flyout — AI wizard shows its own summary step and "Done" button
  };

  // ---- Render ----

  const tabs = [
    {
      id: 'alerts' as TabId,
      name: i18n.translate('observability.alerting.alarmsPage.tabs.alertsCount', {
        defaultMessage: 'Alerts ({count})',
        values: { count: alertsTotal },
      }),
    },
    {
      id: 'rules' as TabId,
      name:
        rulesTotal >= 0
          ? i18n.translate('observability.alerting.alarmsPage.tabs.rulesCount', {
              defaultMessage: 'Rules ({count})',
              values: { count: rulesTotal },
            })
          : i18n.translate('observability.alerting.alarmsPage.tabs.rules', {
              defaultMessage: 'Rules',
            }),
    },
    {
      id: 'routing' as TabId,
      name: i18n.translate('observability.alerting.alarmsPage.tabs.routing', {
        defaultMessage: 'Routing',
      }),
    },
  ];

  const renderTable = () => {
    if (activeTab === 'alerts') {
      return (
        <>
          <AlertsDashboard
            alerts={alerts}
            datasources={datasources}
            loading={alertsLoading}
            onViewDetail={(alert) => setSelectedAlert(alert)}
            onAcknowledge={handleAcknowledgeAlert}
            selectedDsIds={selectedDsIds}
            onDatasourceChange={handleDatasourceChange}
            maxDatasources={maxDatasources}
            onDatasourceCapReached={handleDatasourceCapReached}
            rulesTotal={rulesTotal}
            defaultDatasources={resolveDatasourceTokens(defaultDatasources, datasources).slice(
              0,
              maxDatasources
            )}
            onGoToRules={() => handleTabClick('rules')}
            startMs={startMs}
            endMs={endMs}
            pickerStart={startTime}
            pickerEnd={endTime}
            onTimeChange={handleTimeChange}
            onRefresh={handleRefreshTime}
            truncated={alertsTruncated}
            fallbackHints={alertsFallbackHints}
          />
        </>
      );
    }
    if (activeTab === 'rules') {
      return (
        <MonitorsTable
          rules={visibleRules}
          datasources={datasources}
          loading={dataLoading}
          onDelete={handleDeleteRules}
          onClone={handleCloneRule}
          onEdit={(monitor) => setEditTarget({ dsId: monitor.datasourceId, ruleId: monitor.id })}
          onToggleEnabled={handleToggleMonitorEnabled}
          onCreateMonitor={(type) => {
            if (type === 'logs') {
              setCreateBackendType('opensearch');
              setShowCreateMonitor(true);
            } else if (type === 'metrics') {
              setCreateBackendType('prometheus');
              setShowCreateMonitor(true);
            }
          }}
          selectedDsIds={selectedDsIds}
          onDatasourceChange={handleDatasourceChange}
          maxDatasources={maxDatasources}
          onDatasourceCapReached={handleDatasourceCapReached}
          initialSearchQuery={deepLink.q}
        />
      );
    }
    if (activeTab === 'routing') {
      return <NotificationRoutingPanel datasources={datasources} />;
    }
    return null;
  };

  // Merge Rules-path `rulesWarnings` with the hook-driven `alertsWarnings`
  // so the callout block renders a single warning regardless of which tab
  // is active. Keyed by datasource name to dedupe when both paths report
  // the same backend (possible if the user flips tabs rapidly while a slow
  // datasource is still timing out on both flows).
  const activeWarnings = activeTab === 'alerts' ? alertsWarnings : rulesWarnings;

  // Link back to the legacy alerting dashboard (the standalone `alerts` app's
  // `#/dashboard` route). Built from `basePath.get()` (which carries any
  // workspace prefix) + the app path — same URL-building recipe as the
  // Advanced Settings link above. Rendered as a plain anchor since this crosses
  // into a different app, so browser navigation (open-in-new-tab / right-click)
  // is preferable to an `onClick` SPA hop.
  const oldExperienceHref = `${
    coreRefs.http?.basePath.get() ?? ''
  }/app/${OLD_ALERTING_APP_ID}#/dashboard`;

  return (
    <div data-test-subj="alertManagerPage" className="altPageRoot">
      <AlarmsPageCallouts
        alertingPluginMissing={alertingAvailability.unavailable}
        alertingProbeLoading={alertingAvailability.isLoading}
        alertsErrorMessage={alertsErrorMessage}
        activeTab={activeTab}
        generalError={error}
        warnings={activeWarnings}
      />
      {!newExperienceCalloutDismissed && (
        <EuiCallOut
          size="s"
          iconType="cheer"
          color="primary"
          data-test-subj="alertManagerNewExperienceCallout"
          onDismiss={dismissNewExperienceCallout}
          dismissible
          title={
            <FormattedMessage
              id="observability.alerting.alarmsPage.newExperienceCallout"
              defaultMessage="Welcome to the new alerting experience view your OpenSearch and Prometheus alerts together in one place. Prefer the previous view? {oldExperienceLink}"
              values={{
                oldExperienceLink: (
                  <EuiLink data-test-subj="alertManagerOldExperienceLink" href={oldExperienceHref}>
                    <FormattedMessage
                      id="observability.alerting.alarmsPage.newExperienceCallout.oldExperienceLink"
                      defaultMessage="Switch to the classic experience"
                    />
                  </EuiLink>
                ),
              }}
            />
          }
        />
      )}
      <EuiTabs data-test-subj="alertManagerTabs">
        {tabs.map((t) => (
          <EuiTab
            key={t.id}
            isSelected={activeTab === t.id}
            onClick={() => handleTabClick(t.id)}
            data-test-subj={`alertManagerTabs-${t.id}`}
          >
            {t.name}
          </EuiTab>
        ))}
      </EuiTabs>

      <div aria-live="polite" className="euiScreenReaderOnly">
        <FormattedMessage
          id="observability.alerting.alarmsPage.ariaLive.showingTab"
          defaultMessage="Showing {tabName} tab"
          values={{ tabName: tabs.find((t) => t.id === activeTab)?.name ?? activeTab }}
        />
      </div>
      {renderTable()}
      {showCreateMonitor && (
        <CreateMonitor
          onSave={handleCreateMonitor}
          onBatchSave={handleBatchCreateMonitors}
          onCancel={() => {
            setShowCreateMonitor(false);
            setCreateBackendType(null);
            setPplSubmitError(null);
          }}
          datasources={datasources}
          selectedDsIds={selectedDsIds}
          initialBackendType={createBackendType ?? undefined}
          isNameTaken={isNameTakenForCreate}
          submitError={pplSubmitError ? { pplMessage: pplSubmitError } : undefined}
          onClearPplSubmitError={() => setPplSubmitError(null)}
        />
      )}
      {editTarget && (
        <EditMonitor
          dsId={editTarget.dsId}
          ruleId={editTarget.ruleId}
          onCancel={() => {
            setEditTarget(null);
            setPplSubmitError(null);
          }}
          onSave={handleEditMonitor}
          datasources={datasources}
          selectedDsIds={selectedDsIds}
          isNameTaken={buildIsNameTakenForEdit(editTarget.ruleId)}
          submitError={pplSubmitError ? { pplMessage: pplSubmitError } : undefined}
          onClearPplSubmitError={() => setPplSubmitError(null)}
        />
      )}
      {selectedAlert && selectedAlert.alertKind === 'anomaly' && (
        <AnomalyDetailFlyout
          anomaly={selectedAlert}
          datasources={datasources}
          allAlerts={alerts}
          onClose={() => setSelectedAlert(null)}
          onNavigateToDetectorResults={handleNavigateToDetectorResults}
        />
      )}
      {selectedAlert && selectedAlert.alertKind !== 'anomaly' && (
        <AlertDetailFlyout
          alert={selectedAlert}
          datasources={datasources}
          allAlerts={alerts}
          onClose={() => setSelectedAlert(null)}
          onAcknowledge={(id) => {
            handleAcknowledgeAlert(id);
          }}
        />
      )}
    </div>
  );
};
