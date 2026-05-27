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
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { EuiLink, EuiTab, EuiTabs } from '@elastic/eui';
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
import { useAlerts } from './hooks/use_alerts';
import { useAlertingPluginAvailability } from './hooks/use_alerting_plugin_availability';
import { useDatasourceSelection } from './hooks/use_datasource_selection';
import { useMonitorMutations } from './hooks/use_monitor_mutations';
import { useRulesData } from './hooks/use_rules_data';
import { useTimeRange } from './hooks/use_time_range';
import { AlarmsPageCallouts } from './alarms_page_callouts';
import { coreRefs } from '../../framework/core_refs';
import { setNavBreadCrumbs } from '../../../common/utils/set_nav_bread_crumbs';
import { observabilityID, observabilityTitle } from '../../../common/constants/shared';
import { ALERT_MANAGER_MAX_DATASOURCES_SETTING } from '../../../common/constants/alerting_settings';
import { transformPplFormToPayload } from '../../../common/services/alerting/form_transforms';
import { PPL_MONITOR_NAME_MAX } from '../../../common/services/alerting/validators';
import './alerting.scss';
import type { OpenSearchFormState } from './create_monitor/create_monitor_types';
import { formStateToRule, resolveDatasourceTokens } from './alarms_page_helpers';

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
 * Parse a hash-route deep link of the form `#/rules?q=<query>` into the
 * tab to land on plus an optional initial search query. Returns
 * `{ tab: undefined, q: undefined }` on any unknown shape so the caller
 * keeps its default state (Alerts tab, empty search). Tested implicitly
 * through `<AlarmsPage>` mount tests.
 */
export function parseAlarmsHashRoute(hash: string): { tab?: TabId; q?: string } {
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
  if (queryPart) {
    try {
      const params = new URLSearchParams(queryPart);
      const raw = params.get('q');
      if (raw && raw.trim()) q = raw;
    } catch {
      // Malformed query string — treat as no params rather than throwing.
    }
  }
  return { tab, q };
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

export const AlarmsPage: React.FC<AlarmsPageProps> = ({
  datasources,
  datasourcesLoading,
  defaultDatasources,
  maxDatasources,
}) => {
  const mutations = useMonitorMutations();

  // Deep-link parsing — when SLO detail (or any other surface) navigates to
  // `#/rules?q=<rulename>` we want to land on the Rules tab with the search
  // box pre-filled. Read once on mount via `useMemo` with empty deps so we
  // don't re-trigger the tab switch every time the user types in the search
  // box. The hash-router lives at
  // `/<basepath>/app/observability-alerting#/rules?q=…`, so the `?q=…` is a
  // tail of `location.hash`, not `location.search`.
  const initialDeepLink = useMemo(() => parseAlarmsHashRoute(window.location.hash), []);
  const [activeTab, setActiveTab] = useState<TabId>(initialDeepLink.tab ?? 'alerts');

  // ---- Datasource selection (priority order + persistence) ----
  const { selectedDsIds, setSelectedDsIds } = useDatasourceSelection({
    datasources,
    datasourcesLoading,
    defaultDatasources,
    maxDatasources,
  });

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
          defaultMessage: 'Monitor cloned',
        })
      );
      refetchRules();
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

  const buildOptimisticRule = (formState: MonitorFormState, index = 0): UnifiedRule =>
    formStateToRule(formState, selectedDsIds[0], index);

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
    const newRule = buildOptimisticRule(formState);
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
      refetchRules();
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
      refetchRules();
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
        succeededRules.push(buildOptimisticRule(forms[i], i));
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
          initialSearchQuery={initialDeepLink.q}
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
      <EuiTabs data-test-subj="alertManagerTabs">
        {tabs.map((t) => (
          <EuiTab
            key={t.id}
            isSelected={activeTab === t.id}
            onClick={() => setActiveTab(t.id)}
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
