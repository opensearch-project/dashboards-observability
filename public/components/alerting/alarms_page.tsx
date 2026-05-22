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
 * Rules data still uses the inline `fetchRules` callback; migrating Rules
 * onto `useRules` is tracked as a follow-up.
 *
 * sessionStorage keys:
 *   - `AlertManagerStartTime` — date-math string for picker start.
 *   - `AlertManagerEndTime`   — date-math string for picker end.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { NotificationRoutingPanel } from './notification_routing_panel';
import type { MonitorBackendType } from './monitor_form_components';
import { AlertingOpenSearchService } from './query_services/alerting_opensearch_service';
import { useAlerts } from './hooks/use_alerts';
import { useMonitorMutations } from './hooks/use_monitor_mutations';
import { coreRefs } from '../../framework/core_refs';
import { setNavBreadCrumbs } from '../../../common/utils/set_nav_bread_crumbs';
import { observabilityID, observabilityTitle } from '../../../common/constants/shared';
import {
  ALERT_MANAGER_MAX_DATASOURCES_SETTING,
  ALERT_MANAGER_SELECTED_DS_STORAGE_KEY,
} from '../../../common/constants/alerting_settings';
import { transformPplFormToPayload } from '../../../common/services/alerting/form_transforms';
import { PPL_MONITOR_NAME_MAX } from '../../../common/services/alerting/validators';
import { parseDateMathMs } from '../../../common/services/alerting/time_range';
import './alerting.scss';
import type { OpenSearchFormState } from './create_monitor/create_monitor_types';

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

// Persist selection by datasource NAME. The alerting plugin reassigns `ds-N`
// ids to Prometheus datasources on every discovery pass, so caching by id
// goes stale on every server restart. Names are stable across restarts and
// match how the Routing tab's source selector resolves its stored choice.
function loadPersistedSelection(): string[] {
  try {
    const raw = window.localStorage.getItem(ALERT_MANAGER_SELECTED_DS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch (_e) {
    return [];
  }
}

function persistSelection(names: string[]) {
  try {
    window.localStorage.setItem(ALERT_MANAGER_SELECTED_DS_STORAGE_KEY, JSON.stringify(names));
  } catch (_e) {
    // localStorage can be unavailable (private mode / quota). Not fatal.
  }
}

// ---- Time-range persistence ----
//
// Keyed in sessionStorage (not localStorage) so each tab keeps its own
// picked range — mirrors APM's precedent. Falls back to the default
// (`now-24h` → `now`) when the key is absent or the underlying storage
// throws (SSR, private mode, quota exceeded).
const ALERT_MANAGER_START_TIME_KEY = 'AlertManagerStartTime';
const ALERT_MANAGER_END_TIME_KEY = 'AlertManagerEndTime';
const DEFAULT_START_TIME = 'now-24h';
const DEFAULT_END_TIME = 'now';

function loadPersistedStartTime(): string {
  try {
    return window.sessionStorage.getItem(ALERT_MANAGER_START_TIME_KEY) || DEFAULT_START_TIME;
  } catch (_e) {
    return DEFAULT_START_TIME;
  }
}

function loadPersistedEndTime(): string {
  try {
    return window.sessionStorage.getItem(ALERT_MANAGER_END_TIME_KEY) || DEFAULT_END_TIME;
  } catch (_e) {
    return DEFAULT_END_TIME;
  }
}

function persistTimeRange(start: string, end: string) {
  try {
    window.sessionStorage.setItem(ALERT_MANAGER_START_TIME_KEY, start);
    window.sessionStorage.setItem(ALERT_MANAGER_END_TIME_KEY, end);
  } catch (_e) {
    // sessionStorage can be unavailable (SSR / private mode / quota). Not fatal.
  }
}

// Resolve an array of user-supplied tokens (names or ids) against the loaded
// datasource list, returning the matched datasource ids in input order, with
// duplicates removed. Unknown tokens are dropped silently — the setting
// accepts free strings, so typos shouldn't block the page.
//
// Matching is case-insensitive and probes every stable handle we expose
// on a Datasource: id (ds-N, churns across discovery passes — accepted
// for in-session compatibility but not reliable across restarts), name,
// directQueryName (stable SQL-plugin connection name for Prom), and
// mdsId (stable saved-object id for MDS OpenSearch datasources).
function resolveDatasourceTokens(tokens: string[], datasources: Datasource[]): string[] {
  const lookup = new Map<string, string>();
  const add = (key: string | undefined, id: string) => {
    if (!key) return;
    const k = key.toLowerCase();
    if (!lookup.has(k)) lookup.set(k, id);
  };
  for (const d of datasources) {
    add(d.id, d.id);
    add(d.name, d.id);
    add(d.directQueryName, d.id);
    add(d.mdsId, d.id);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    if (typeof t !== 'string') continue;
    const id = lookup.get(t.trim().toLowerCase());
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

type TabId = 'alerts' | 'rules' | 'routing';

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

// Fetch a large page from the server so child tables can paginate client-side.
// The child components (AlertsDashboard, MonitorsTable) handle their own
// page-size controls (10/20/50/100 rows per page) over this full dataset.
const DEFAULT_PAGE_SIZE = 1000;

// The OpenSearch Alerting plugin creates the `.opendistro-alerting-config`
// index lazily, on first monitor/destination creation. Until then, list calls
// return a 404 `alerting_exception` / `IndexNotFoundException`. That's the same
// signal our "No rules have been created" empty state already conveys, so we
// suppress the warning banner for this specific case — the user is about to
// see the CTA to create their first rule, which will auto-create the index.
const isAlertingConfigMissingError = (err: string | undefined): boolean => {
  if (!err) return false;
  return (
    err.includes('.opendistro-alerting-config') &&
    (err.includes('index_not_found') ||
      err.includes('IndexNotFoundException') ||
      err.includes('alerting_exception'))
  );
};

export const AlarmsPage: React.FC<AlarmsPageProps> = ({
  datasources,
  datasourcesLoading,
  defaultDatasources,
  maxDatasources,
}) => {
  const osService = useMemo(() => new AlertingOpenSearchService(), []);
  const mutations = useMonitorMutations();
  const [activeTab, setActiveTab] = useState<TabId>('alerts');
  const [selectedDsIds, setSelectedDsIds] = useState<string[]>([]);
  // `dataLoading` / `error` / `rulesWarnings` only drive the Rules flow now —
  // the Alerts path reads loading/error/warnings from `useAlerts` below.
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rulesWarnings, setRulesWarnings] = useState<
    Array<{ datasourceName: string; error: string }>
  >([]);

  // ---- Time-range state ----
  //
  // Initialized lazily from sessionStorage so SSR / JSDOM first-render is
  // still stable when storage access throws. Writes happen eagerly via
  // `onTimeChange` (picker) and `onRefresh` (refresh button).
  const [startTime, setStartTime] = useState<string>(loadPersistedStartTime);
  const [endTime, setEndTime] = useState<string>(loadPersistedEndTime);
  const [refreshToken, setRefreshToken] = useState(0);

  // Resolve once per render, guarded.
  //
  // `parseDateMathMs` throws on malformed input (invalid date-math). If a
  // user or a browser extension corrupts the sessionStorage-hydrated
  // `startTime`/`endTime`, resolving at module top-level would crash the
  // page on mount. `useMemo` lets us swallow the error and fall back to
  // the known-good defaults (`now-24h` -> `now`), which ALSO parse through
  // `parseDateMathMs` so we never ship hard-coded epoch numbers. The
  // recovery is self-healing: the effect below resets state and
  // sessionStorage to the defaults so the hook stops forwarding garbage.
  //
  // `refreshToken` is in the deps so that clicking Refresh while the range
  // is relative-to-`now` (e.g. `now-24h` → `now`) re-resolves `now` to the
  // current wall clock. Without it the chart window would stay pinned to
  // the mount-time snapshot even though the hook refetches new data, which
  // would misalign bars at the right edge of the chart.
  const [startMs, endMs, rangeParseFailed] = useMemo(() => {
    try {
      return [parseDateMathMs(startTime, false), parseDateMathMs(endTime, true), false];
    } catch {
      return [
        parseDateMathMs(DEFAULT_START_TIME, false),
        parseDateMathMs(DEFAULT_END_TIME, true),
        true,
      ];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startTime, endTime, refreshToken]);

  // When parse failed (corrupted sessionStorage, manual DevTools edit),
  // heal the stored values back to defaults. Without this, `startTime` /
  // `endTime` keep leaking garbage into `useAlerts` → the backend route,
  // which rejects it with a 400 and surfaces as `alertsError`. Resetting
  // state + persistence both (a) stops the 400 loop and (b) means the
  // next render sees a clean, good range.
  useEffect(() => {
    if (!rangeParseFailed) return;
    setStartTime(DEFAULT_START_TIME);
    setEndTime(DEFAULT_END_TIME);
    persistTimeRange(DEFAULT_START_TIME, DEFAULT_END_TIME);
  }, [rangeParseFailed]);

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
    const failed = (alertsData?.datasourceStatus || []).filter((s) => s.status === 'error');
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

  const [rules, setRules] = useState<UnifiedRuleSummary[]>([]);
  const [rulesTotal, setRulesTotal] = useState(-1); // -1 = not yet loaded
  const [rulesPage, setRulesPage] = useState(1);
  const [rulesPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [deletedRuleIds, setDeletedRuleIds] = useState<Set<string>>(new Set());
  const [showCreateMonitor, setShowCreateMonitor] = useState(false);
  // The popover's "Logs" entry maps to an OpenSearch monitor; "Metrics" toasts
  // "coming soon" until PR 2 lights up the Prom create flyout. When the user
  // picks Logs the flyout is forced to the OS variant via this override even
  // if the parent-page selected datasource happens to be Prometheus.
  const [createBackendType, setCreateBackendType] = useState<MonitorBackendType | null>(null);
  const [editTarget, setEditTarget] = useState<{ dsId: string; ruleId: string } | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<UnifiedAlertSummary | null>(null);
  const { setToast: addToast } = useToast();

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

  // ---- Resolve initial selection once datasources are available ----
  //
  // Datasources now come from the `useDatasources` hook (parent `home.tsx`),
  // which reads them from the `data-source` + `data-connection` saved-object
  // types. This effect runs the selection-priority logic as soon as the hook
  // reports a non-loading state — initial selection must still honor the
  // same priority order as before:
  //   1. Previously-persisted names from localStorage (user's last
  //      explicit choice — wins over the admin default so refresh
  //      doesn't stomp their selection).
  //   2. `observability:alertManagerSelectedDatasources` setting
  //      (names / ids / directQueryName / mdsId). Also used as a
  //      fallthrough when localStorage exists but none of its entries
  //      resolve — e.g., the user's cached datasources were deleted.
  //   3. First discovered datasource (original behavior).
  // Always clamp to the current `maxDatasources` — so if the admin
  // lowers the cap after the user stored 5 names, we drop the overflow.
  useEffect(() => {
    if (datasourcesLoading) return;
    setSelectedDsIds((prev) => {
      if (prev.length > 0) return prev.slice(0, maxDatasources);

      const persistedNames = loadPersistedSelection();
      if (persistedNames.length > 0) {
        const resolved = resolveDatasourceTokens(persistedNames, datasources);
        if (resolved.length > 0) return resolved.slice(0, maxDatasources);
        // All cached entries were stale (datasources removed). Fall
        // through to the admin-curated setting below rather than
        // jumping straight to "first datasource" — the setting is a
        // better backup than an arbitrary pick.
      }

      if (defaultDatasources.length > 0) {
        const resolved = resolveDatasourceTokens(defaultDatasources, datasources);
        if (resolved.length > 0) return resolved.slice(0, maxDatasources);
      }

      const first = datasources[0]?.id;
      return first ? [first] : [];
    });
  }, [datasources, datasourcesLoading, defaultDatasources, maxDatasources]);

  // Persist the selection (by name) whenever it changes and we know the
  // datasource list. Names survive server restarts; ids don't.
  useEffect(() => {
    if (datasources.length === 0) return;
    const names = selectedDsIds
      .map((id) => datasources.find((d) => d.id === id)?.name)
      .filter((n): n is string => typeof n === 'string');
    persistSelection(names);
  }, [selectedDsIds, datasources]);

  // ---- Fetch data when datasource selection or page changes ----
  //
  // Alerts: now driven by `useAlerts` above — no inline callback needed.
  // Changing `selectedDsIds`, `startTime`, `endTime`, or `refreshToken`
  // triggers a refetch through the hook's effect.

  const fetchRules = useCallback(
    async (dsIds: string[], _page: number, _pageSize: number) => {
      if (dsIds.length === 0) {
        setRules([]);
        setRulesTotal(0);
        return;
      }
      setDataLoading(true);
      setError(null);
      setRulesWarnings([]);
      try {
        const res = await osService.listRules({ dsIds });
        setRules(res.results || []);
        setRulesTotal((res.results || []).length);
        const failedStatuses = (res.datasourceStatus || [])
          .filter((s) => s.status === 'error')
          .filter((s) => !isAlertingConfigMissingError(s.error));
        if (failedStatuses.length > 0) {
          setRulesWarnings(
            failedStatuses.map((s) => ({
              datasourceName: s.datasourceName,
              error:
                s.error ||
                i18n.translate('observability.alerting.alarmsPage.unknownError', {
                  defaultMessage: 'Unknown error',
                }),
            }))
          );
        }
      } catch (e: unknown) {
        setError(
          e instanceof Error
            ? e.message
            : i18n.translate('observability.alerting.alarmsPage.fetchRulesError', {
                defaultMessage: 'Failed to fetch rules',
              })
        );
      } finally {
        setDataLoading(false);
      }
    },
    [osService]
  );

  // Rules fetch effect (alerts effect removed — `useAlerts` hook drives that flow).
  useEffect(() => {
    if (selectedDsIds.length === 0) {
      setRules([]);
      setRulesTotal(0);
      return;
    }
    // Fetch rules regardless of active tab so the "Rules (N)" tab label
    // populates on initial load without requiring the user to click the tab.
    fetchRules(selectedDsIds, rulesPage, rulesPageSize);
  }, [selectedDsIds, rulesPage, rulesPageSize, fetchRules]);

  // Reset pages when datasource selection changes. `useAlerts` refetches
  // automatically on `selectedDsIds` change, so no alerts-page reset here.
  const handleDatasourceChange = useCallback((ids: string[]) => {
    setSelectedDsIds(ids);
    setRulesPage(1);
    setDeletedRuleIds(new Set());
  }, []);

  // ---- Time-picker callbacks ----
  //
  // Stable identities (`useCallback`) so passing them down to `AlertsDashboard`
  // doesn't invalidate that subtree's React.memo / dependent memos on every
  // page-level re-render. Logic is identical to the previous inline handlers.
  const handleTimeChange = useCallback(
    ({ start, end }: { start: string; end: string }) => {
      if (start === startTime && end === endTime) return;
      setStartTime(start);
      setEndTime(end);
      persistTimeRange(start, end);
    },
    [startTime, endTime]
  );

  const handleRefreshTime = useCallback(
    ({ start, end }: { start: string; end: string }) => {
      if (start !== startTime || end !== endTime) {
        setStartTime(start);
        setEndTime(end);
        persistTimeRange(start, end);
      }
      setRefreshToken((t) => t + 1);
    },
    [startTime, endTime]
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
      setRefreshToken((t) => t + 1);
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
        e instanceof Error ? e.message : String(e)
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
            defaultMessage: 'Failed to delete monitor',
          }),
          'danger',
          i18n.translate('observability.alerting.alarmsPage.toast.monitorNotFoundInCache', {
            defaultMessage: 'Monitor {id} not found in cache',
            values: { id },
          })
        );
        continue;
      }
      try {
        await mutations.deleteMonitor(id, rule.datasourceId);
      } catch (e: unknown) {
        failed.push(id);
        addToast(
          i18n.translate('observability.alerting.alarmsPage.toast.deleteMonitorFailed', {
            defaultMessage: 'Failed to delete monitor',
          }),
          'danger',
          e instanceof Error ? e.message : String(e)
        );
      }
    }
    const succeeded = ids.filter((id) => !failed.includes(id));
    if (succeeded.length > 0) {
      addToast(
        i18n.translate('observability.alerting.alarmsPage.toast.monitorsDeleted', {
          defaultMessage: '{count} monitor(s) deleted',
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

  const handleCloneRule = async (monitor: UnifiedRuleSummary) => {
    try {
      // Fetch the full rule detail to get the raw backend payload — the
      // summary shape doesn't carry the wire format needed for re-creation.
      const detail = await osService.getRuleDetail(monitor.datasourceId, monitor.id);
      const raw = (detail.raw ?? {}) as Record<string, unknown>;
      // Strip server-assigned fields that aren't valid on create.
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
      // inside wrapper keys like `ppl_trigger`, `query_level_trigger`, etc.
      const triggers = (rest.triggers as Array<Record<string, unknown>> | undefined) ?? [];
      const cleanTriggers = triggers.map((t) => {
        const cleaned: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(t)) {
          if (val && typeof val === 'object' && !Array.isArray(val)) {
            const { id: _tid, ...trigBody } = val as Record<string, unknown>;
            cleaned[key] = trigBody;
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
          defaultMessage: 'Monitor cloned',
        })
      );
      fetchRules(selectedDsIds, rulesPage, rulesPageSize);
    } catch (e: unknown) {
      addToast(
        i18n.translate('observability.alerting.alarmsPage.toast.cloneMonitorFailed', {
          defaultMessage: 'Failed to clone monitor',
        }),
        'danger',
        e instanceof Error ? e.message : String(e)
      );
    }
  };

  const formStateToRule = (formState: MonitorFormState, index = 0): UnifiedRule => {
    const now = new Date().toISOString();

    if (formState.datasourceType === 'prometheus') {
      const labelsObj: Record<string, string> = {};
      for (const l of formState.labels) {
        if (l.key && l.value) labelsObj[l.key] = l.value;
      }
      const annotationsObj: Record<string, string> = {};
      for (const a of formState.annotations) {
        if (a.key && a.value) annotationsObj[a.key] = a.value;
      }
      return {
        id: `new-${Date.now()}-${index}`,
        datasourceId: formState.datasourceId || selectedDsIds[0],
        datasourceType: 'prometheus',
        name: formState.name,
        enabled: formState.enabled,
        severity: formState.severity,
        query: formState.query,
        condition: `${formState.threshold.operator} ${formState.threshold.value}${formState.threshold.unit}`,
        labels: labelsObj,
        annotations: annotationsObj,
        monitorType: 'metric',
        status: formState.enabled ? 'active' : 'disabled',
        healthStatus: 'healthy',
        createdBy: 'current-user',
        createdAt: now,
        lastModified: now,
        notificationDestinations: [],
        description: annotationsObj.description || '',
        evaluationInterval: formState.evaluationInterval,
        pendingPeriod: formState.pendingPeriod,
        firingPeriod: formState.firingPeriod,
        threshold: {
          operator: formState.threshold.operator,
          value: formState.threshold.value,
          unit: formState.threshold.unit,
        },
        alertHistory: [],
        conditionPreviewData: [],
        notificationRouting: [],
        suppressionRules: [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw field is empty for new monitors
        raw: {} as any,
      };
    } else {
      // OpenSearch PPL monitor — DSL/cluster-metrics aren't authored in this UI.
      const indices = formState.indices.map((s) => s.trim()).filter(Boolean);

      const labelsObj: Record<string, string> = {};
      const annotationsObj: Record<string, string> = {};
      for (const l of formState.labels) {
        if (l.key && l.value) labelsObj[l.key] = l.value;
      }
      for (const a of formState.annotations) {
        if (a.key && a.value) annotationsObj[a.key] = a.value;
      }
      if (indices.length > 0) labelsObj.indices = indices.join(', ');
      // monitorType already lives on UnifiedRule as a top-level field — emitting
      // it as a label too would leak into the Labels facet.

      return {
        id: `new-${Date.now()}-${index}`,
        datasourceId: formState.datasourceId || selectedDsIds[0],
        datasourceType: 'opensearch',
        name: formState.name,
        enabled: formState.enabled,
        severity: formState.severity,
        query: formState.query,
        condition: `${formState.threshold.operator} ${formState.threshold.value}${formState.threshold.unit}`,
        labels: labelsObj,
        annotations: annotationsObj,
        monitorType: 'ppl',
        status: formState.enabled ? 'active' : 'disabled',
        healthStatus: 'healthy',
        createdBy: 'current-user',
        createdAt: now,
        lastModified: now,
        notificationDestinations: [],
        description: `OpenSearch PPL monitor${
          indices.length > 0 ? ` on ${indices.join(', ')}` : ''
        }`,
        evaluationInterval: formState.evaluationInterval,
        pendingPeriod: formState.pendingPeriod,
        threshold: {
          operator: formState.threshold.operator,
          value: formState.threshold.value,
          unit: formState.threshold.unit,
        },
        alertHistory: [],
        conditionPreviewData: [],
        notificationRouting: [],
        suppressionRules: [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw field is empty for new monitors
        raw: {} as any,
      };
    }
  };

  const resolveDatasourceId = (formState: MonitorFormState): string | null => {
    const dsId = formState.datasourceId || selectedDsIds[0];
    if (!dsId) {
      addToast(
        i18n.translate('observability.alerting.alarmsPage.toast.selectDatasourceForCreate', {
          defaultMessage: 'Select a datasource before creating a monitor',
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
    const newRule = formStateToRule(formState);
    try {
      await mutations.createMonitor(buildPayload(formState), dsId);
      addToast(
        i18n.translate('observability.alerting.alarmsPage.toast.monitorCreated', {
          defaultMessage: 'Monitor created successfully',
        })
      );
      setShowCreateMonitor(false);
      setCreateBackendType(null);
      // Refetch rules so the new monitor (with backend-assigned id /
      // last_update_time) shows up in the list. Optimistic insert is kept
      // for the UI to feel instant; the refetch reconciles.
      setRules((prev) => [newRule, ...prev]);
      setRulesTotal((prev) => prev + 1);
      fetchRules(selectedDsIds, rulesPage, rulesPageSize);
    } catch (e: unknown) {
      addToast(
        i18n.translate('observability.alerting.alarmsPage.toast.createMonitorFailed', {
          defaultMessage: 'Failed to create monitor',
        }),
        'danger',
        e instanceof Error ? e.message : String(e)
      );
    }
  };

  const handleEditMonitor = async (formState: MonitorFormState, ruleId: string) => {
    const dsId = resolveDatasourceId(formState);
    if (!dsId) return;
    try {
      await mutations.updateMonitor(ruleId, buildPayload(formState), dsId);
      addToast(
        i18n.translate('observability.alerting.alarmsPage.toast.monitorUpdated', {
          defaultMessage: 'Monitor updated successfully',
        })
      );
      setEditTarget(null);
      fetchRules(selectedDsIds, rulesPage, rulesPageSize);
    } catch (e: unknown) {
      addToast(
        i18n.translate('observability.alerting.alarmsPage.toast.updateMonitorFailed', {
          defaultMessage: 'Failed to update monitor',
        }),
        'danger',
        e instanceof Error ? e.message : String(e)
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
        succeededRules.push(formStateToRule(forms[i], i));
      } catch (e: unknown) {
        addToast(
          i18n.translate('observability.alerting.alarmsPage.toast.createMonitorFailed', {
            defaultMessage: 'Failed to create monitor',
          }),
          'danger',
          e instanceof Error ? e.message : String(e)
        );
      }
    }
    if (succeededRules.length > 0) {
      addToast(
        i18n.translate('observability.alerting.alarmsPage.toast.monitorsCreated', {
          defaultMessage: '{count} monitor(s) created successfully',
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
            onGoToRules={() => setActiveTab('rules')}
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
          onCreateMonitor={(type) => {
            if (type === 'logs') {
              setCreateBackendType('opensearch');
              setShowCreateMonitor(true);
            } else if (type === 'metrics') {
              addToast(
                i18n.translate('observability.alerting.alarmsPage.toast.metricsMonitorComingSoon', {
                  defaultMessage:
                    'Metrics monitor creation will be available in a follow-up release.',
                }),
                'primary'
              );
            }
          }}
          selectedDsIds={selectedDsIds}
          onDatasourceChange={handleDatasourceChange}
          maxDatasources={maxDatasources}
          onDatasourceCapReached={handleDatasourceCapReached}
        />
      );
    }
    if (activeTab === 'routing') {
      return <NotificationRoutingPanel datasources={datasources} />;
    }
    return null;
  };

  return (
    <div data-test-subj="alertManager-page" className="altPageRoot">
      {/* Tab bar — picker now lives inside the Alert Timeline panel header */}
      {/* so it's adjacent to the chart it controls.                       */}
      <EuiTabs data-test-subj="alertManager-tabs">
        {tabs.map((t) => (
          <EuiTab
            key={t.id}
            isSelected={activeTab === t.id}
            onClick={() => setActiveTab(t.id)}
            data-test-subj={`alertManager-tabs-${t.id}`}
          >
            {t.name}
          </EuiTab>
        ))}
      </EuiTabs>

      {/* Surface the hook's error if alerts fetch failed. Mirrors the       */}
      {/* existing `error` callout pattern used for the Rules path.          */}
      {alertsErrorMessage && activeTab === 'alerts' && (
        <EuiCallOut
          title={i18n.translate('observability.alerting.alarmsPage.alertsError.title', {
            defaultMessage: 'Error loading alerts',
          })}
          color="danger"
          iconType="alert"
          size="s"
          style={{ marginBottom: 12 }}
          data-test-subj="alertManager-alertsError"
        >
          <p>{alertsErrorMessage}</p>
        </EuiCallOut>
      )}

      {error && (
        <EuiCallOut
          title={i18n.translate('observability.alerting.alarmsPage.errorCallout.title', {
            defaultMessage: 'Error loading data',
          })}
          color="danger"
          iconType="alert"
          size="s"
          style={{ marginBottom: 12 }}
        >
          <p>{error}</p>
        </EuiCallOut>
      )}

      {(() => {
        // Merge Rules-path `rulesWarnings` with the hook-driven `alertsWarnings`
        // so we render a single callout regardless of which tab is active.
        // Keyed by datasource name to dedupe when both paths report the
        // same backend (possible if the user flips tabs rapidly while
        // a slow datasource is still timing out on both flows).
        const combined = activeTab === 'alerts' ? alertsWarnings : rulesWarnings;
        if (combined.length === 0) return null;
        return (
          <EuiCallOut
            title={i18n.translate('observability.alerting.alarmsPage.warningCallout.title', {
              defaultMessage: 'Some datasources could not be reached',
            })}
            color="warning"
            iconType="alert"
            size="s"
            style={{ marginBottom: 12 }}
          >
            {combined.map((w, i) => (
              <p key={i}>
                <strong>{w.datasourceName}</strong>: {w.error}
              </p>
            ))}
          </EuiCallOut>
        );
      })()}

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
          }}
          datasources={datasources}
          selectedDsIds={selectedDsIds}
          initialBackendType={createBackendType ?? undefined}
        />
      )}
      {editTarget && (
        <EditMonitor
          dsId={editTarget.dsId}
          ruleId={editTarget.ruleId}
          onCancel={() => setEditTarget(null)}
          onSave={handleEditMonitor}
          datasources={datasources}
          selectedDsIds={selectedDsIds}
        />
      )}
      {selectedAlert && (
        <AlertDetailFlyout
          alert={selectedAlert}
          datasources={datasources}
          onClose={() => setSelectedAlert(null)}
          onAcknowledge={(id) => {
            handleAcknowledgeAlert(id);
          }}
        />
      )}
    </div>
  );
};
