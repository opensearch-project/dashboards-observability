/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alert Manager page toasts — replaces the page-top and inline callout strip.
 *
 * The AlarmsPage used to render banners (`AlarmsPageCallouts` + two inline
 * `EuiCallOut`s in `AlertsDashboard`) for the following conditions:
 *   - "Error loading alerts" (Alerts tab hook error)
 *   - "Error loading data"   (Rules tab hook error)
 *   - "Alerting plugin not detected"
 *   - "Some datasources could not be reached"
 *   - "Search incomplete — too many alerts"  (OS post-filter cap)
 *   - "Showing current alerts only"          (Prom empty-matrix fallback)
 *
 * Each of these is now surfaced as a toast. Because toasts are event-driven
 * (fire once per new occurrence) rather than declarative (visible while the
 * condition holds), this hook diff-tracks the incoming props against a ref
 * and only fires toasts on transitions — this prevents the toast list from
 * growing every render while a datasource is down, or firing a duplicate
 * "plugin not detected" toast on every keystroke elsewhere on the page.
 *
 * Tab gating: the three alerts-derived conditions (alerts fetch error, result
 * truncation, Prometheus legacy-fallback) only fire while the Alerts tab is
 * active, matching the pre-toast behavior where those callouts lived inside
 * `AlertsDashboard` / were gated on `activeTab === 'alerts'`. If the condition
 * is still active when the user switches TO the Alerts tab, the toast fires
 * then (the ref is only advanced once a toast actually fires, so a wrong-tab
 * render does not "consume" the transition). The plugin-missing, rules-fetch
 * error, and per-datasource connection toasts are cross-cutting and fire
 * regardless of tab.
 *
 * The datasource-connection failures are ALSO surfaced next to the affected
 * datasource in the filter facet (via `FacetFilterGroup`'s `errorMap` prop).
 * Firing a toast in addition to the indicator is intentional: the filter
 * panel can be collapsed or scrolled off, and users need to know something
 * changed. The toast is a one-shot notification; the indicator is the
 * persistent home for the details.
 */
import { useEffect, useRef } from 'react';
import { i18n } from '@osd/i18n';
import type { DatasourceFetchFallback } from '../../../../common/types/alerting';
import { useToast } from '../../common/toast';

export interface DatasourceIssue {
  datasourceId: string;
  datasourceName: string;
  error: string;
}

export interface FallbackHint {
  datasourceName: string;
  fallback: DatasourceFetchFallback;
}

export interface UseAlertingPageToastsParams {
  /** Active tab — alerts-derived toasts only fire on the 'alerts' tab. */
  activeTab: 'alerts' | 'rules' | 'routing';
  /** Alerts fetch hook error message; null when healthy. */
  alertsErrorMessage: string | null;
  /** Rules fetch hook error message; null when healthy. */
  rulesErrorMessage: string | null;
  /** True when every selected OS datasource failed the alerting-plugin probe. */
  alertingPluginMissing: boolean;
  /** Loading flag from the probe — suppresses the plugin-missing toast during the probe. */
  alertingProbeLoading: boolean;
  /** Per-datasource fetch failures (already merged from alerts + rules paths). */
  datasourceIssues: DatasourceIssue[];
  /** True when a backend reported a hard cap on returned alerts. */
  alertsTruncated: boolean;
  /** Per-datasource legacy-fallback hints (Prom empty-matrix → active-only /alerts). */
  fallbackHints: FallbackHint[];
}

/**
 * Build a stable key for the datasource-issues set so we only toast when the
 * set changes (new datasource fails, existing one recovers, or the error text
 * changes). Keyed by datasource NAME rather than id: the id is derived as
 * `ds?.id ?? name` at the call site and therefore flips from name→id the
 * moment the datasource list hydrates. Keying on the always-present name keeps
 * the key stable across that hydration and avoids a spurious second toast for
 * the same failure. Sorted to be order-agnostic.
 */
function datasourceIssuesKey(issues: DatasourceIssue[]): string {
  return issues
    .map((i) => `${i.datasourceName}|${i.error}`)
    .sort()
    .join('||');
}

function fallbackHintsKey(hints: FallbackHint[]): string {
  return hints
    .map((h) => `${h.datasourceName}|${h.fallback}`)
    .sort()
    .join('||');
}

export function useAlertingPageToasts({
  activeTab,
  alertsErrorMessage,
  rulesErrorMessage,
  alertingPluginMissing,
  alertingProbeLoading,
  datasourceIssues,
  alertsTruncated,
  fallbackHints,
}: UseAlertingPageToastsParams): void {
  const { setToast } = useToast();

  // Track the last-seen "key" for each toast so we only fire on transitions.
  // For gated toasts the ref is advanced ONLY when a toast actually fires, so
  // a render on the wrong tab does not consume the transition — switching to
  // the Alerts tab later still fires. When the condition clears, the ref is
  // reset so a later recurrence re-fires.
  const lastAlertsErrorRef = useRef<string | null>(null);
  const lastRulesErrorRef = useRef<string | null>(null);
  const lastPluginMissingRef = useRef<boolean>(false);
  const lastDsIssuesKeyRef = useRef<string>('');
  const lastTruncatedRef = useRef<boolean>(false);
  const lastFallbackKeyRef = useRef<string>('');

  const onAlertsTab = activeTab === 'alerts';

  // Alerts fetch error — alerts-tab only.
  useEffect(() => {
    if (!alertsErrorMessage) {
      lastAlertsErrorRef.current = null;
      return;
    }
    if (onAlertsTab && alertsErrorMessage !== lastAlertsErrorRef.current) {
      setToast(
        i18n.translate('observability.alerting.alarmsPage.toast.alertsError.title', {
          defaultMessage: 'Error loading alerts',
        }),
        'danger',
        alertsErrorMessage
      );
      lastAlertsErrorRef.current = alertsErrorMessage;
    }
  }, [alertsErrorMessage, onAlertsTab, setToast]);

  // Rules fetch error — cross-cutting (the old banner rendered on every tab).
  useEffect(() => {
    if (rulesErrorMessage && rulesErrorMessage !== lastRulesErrorRef.current) {
      setToast(
        i18n.translate('observability.alerting.alarmsPage.toast.rulesError.title', {
          defaultMessage: 'Error loading data',
        }),
        'danger',
        rulesErrorMessage
      );
    }
    lastRulesErrorRef.current = rulesErrorMessage;
  }, [rulesErrorMessage, setToast]);

  // Alerting plugin not detected (suppress while the probe is still running).
  // Cross-cutting: the old callout rendered above the tab bar.
  useEffect(() => {
    const active = alertingPluginMissing && !alertingProbeLoading;
    if (active && !lastPluginMissingRef.current) {
      setToast(
        i18n.translate('observability.alerting.alarmsPage.toast.alertingPluginMissing.title', {
          defaultMessage: 'Alerting plugin not detected',
        }),
        'warning',
        i18n.translate('observability.alerting.alarmsPage.toast.alertingPluginMissing.body', {
          defaultMessage:
            'None of the selected OpenSearch clusters returned a successful response from the alerting API. Install the opensearch-alerting plugin on each cluster to use Alert Manager features.',
        })
      );
    }
    lastPluginMissingRef.current = active;
  }, [alertingPluginMissing, alertingProbeLoading, setToast]);

  // Datasource-connection issues. Fire a single toast per transition; the
  // persistent home for the details is the filter facet's error indicator.
  // Cross-cutting — both tabs carry the datasource facet + its indicator.
  useEffect(() => {
    const key = datasourceIssuesKey(datasourceIssues);
    if (key && key !== lastDsIssuesKeyRef.current) {
      const names = datasourceIssues.map((i) => i.datasourceName);
      const title =
        names.length === 1
          ? i18n.translate('observability.alerting.alarmsPage.toast.datasourceUnreachable.single', {
              defaultMessage: 'Could not connect to {datasourceName}',
              values: { datasourceName: names[0] },
            })
          : i18n.translate('observability.alerting.alarmsPage.toast.datasourceUnreachable.multi', {
              defaultMessage: '{count} datasources could not be reached',
              values: { count: names.length },
            });
      const body =
        names.length === 1
          ? datasourceIssues[0].error
          : i18n.translate('observability.alerting.alarmsPage.toast.datasourceUnreachable.body', {
              defaultMessage:
                'Affected: {names}. See the error indicator next to each datasource in the filter panel for details.',
              values: { names: names.join(', ') },
            });
      setToast(title, 'warning', body);
    }
    lastDsIssuesKeyRef.current = key;
  }, [datasourceIssues, setToast]);

  // Alerts result truncated (OS post-filter 1000-alert cap) — alerts-tab only.
  useEffect(() => {
    if (!alertsTruncated) {
      lastTruncatedRef.current = false;
      return;
    }
    if (onAlertsTab && !lastTruncatedRef.current) {
      setToast(
        i18n.translate('observability.alerting.alarmsPage.toast.alertsTruncated.title', {
          defaultMessage: 'Search incomplete — too many alerts to scan',
        }),
        'warning',
        i18n.translate('observability.alerting.alarmsPage.toast.alertsTruncated.body', {
          defaultMessage: 'Narrow the time range or refine your filters and try again.',
        })
      );
      lastTruncatedRef.current = true;
    }
  }, [alertsTruncated, onAlertsTab, setToast]);

  // Legacy-fallback hints (Prometheus empty-matrix → active-only) — alerts-tab only.
  useEffect(() => {
    const key = fallbackHintsKey(fallbackHints);
    if (!key) {
      lastFallbackKeyRef.current = '';
      return;
    }
    if (onAlertsTab && key !== lastFallbackKeyRef.current) {
      const names = fallbackHints.map((h) => h.datasourceName).join(', ');
      setToast(
        i18n.translate('observability.alerting.alarmsPage.toast.fallback.title', {
          defaultMessage: 'Showing current alerts only',
        }),
        'warning',
        i18n.translate('observability.alerting.alarmsPage.toast.fallback.body', {
          defaultMessage:
            '{names}: historical alert data unavailable; showing currently active alerts instead.',
          values: { names },
        })
      );
      lastFallbackKeyRef.current = key;
    }
  }, [fallbackHints, onAlertsTab, setToast]);
}
