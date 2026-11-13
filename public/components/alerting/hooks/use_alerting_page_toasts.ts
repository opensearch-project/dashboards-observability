/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Alert Manager page toasts — replaces the page-top and inline callout strip.
 *
 * The AlarmsPage used to render banners (`AlarmsPageCallouts` + two inline
 * `EuiCallOut`s in `AlertsDashboard`). These conditions are surfaced as toasts:
 *   - "Error loading alerts" (Alerts tab hook error)
 *   - "Error loading data"   (Rules tab hook error)
 *   - "Alerting plugin not detected"
 *   - "Search incomplete — too many alerts"  (OS post-filter cap)
 *   - "Not all rules are listed"             (per-datasource rules cap)
 *
 * Per-datasource connection failures and the Prometheus empty-matrix
 * fallback raise no toast: they fire on their own (on load, refresh and
 * background polls), so they popped up without any user action. Connection
 * failures of OpenSearch / Prometheus datasources stay visible next to the
 * datasource in the filter facet; a failing CloudWatch scope or region just
 * contributes no rows.
 *
 * Because toasts are event-driven (fire once per new occurrence) rather than
 * declarative (visible while the condition holds), this hook diff-tracks the
 * incoming props against a ref and only fires toasts on transitions — this
 * prevents the toast list from growing every render, or firing a duplicate
 * "plugin not detected" toast on every keystroke elsewhere on the page.
 *
 * Tab gating: the alerts-derived conditions (alerts fetch error, result
 * truncation) only fire while the Alerts tab is active, matching the
 * pre-toast behavior where those callouts lived inside `AlertsDashboard` /
 * were gated on `activeTab === 'alerts'`. If the condition is still active
 * when the user switches TO the Alerts tab, the toast fires then (the ref is
 * only advanced once a toast actually fires, so a wrong-tab render does not
 * "consume" the transition). The plugin-missing and rules-fetch error toasts
 * are cross-cutting and fire regardless of tab.
 */
import { useEffect, useRef } from 'react';
import { i18n } from '@osd/i18n';
import { useToast } from '../../common/toast';

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
  /** True when a backend reported a hard cap on returned alerts. */
  alertsTruncated: boolean;
  /** Datasources whose rule listing was capped (e.g. a large CloudWatch account). */
  rulesTruncatedDatasources?: string[];
}

export function useAlertingPageToasts({
  activeTab,
  alertsErrorMessage,
  rulesErrorMessage,
  alertingPluginMissing,
  alertingProbeLoading,
  alertsTruncated,
  rulesTruncatedDatasources = [],
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
  const lastTruncatedRef = useRef<boolean>(false);
  const lastRulesTruncatedKeyRef = useRef<string>('');

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

  // Rules listing capped by a datasource — rules-tab only.
  const rulesTruncatedKey = [...rulesTruncatedDatasources].sort().join('||');
  useEffect(() => {
    if (!rulesTruncatedKey) {
      lastRulesTruncatedKeyRef.current = '';
      return;
    }
    if (activeTab === 'rules' && rulesTruncatedKey !== lastRulesTruncatedKeyRef.current) {
      setToast(
        i18n.translate('observability.alerting.alarmsPage.toast.rulesTruncated.title', {
          defaultMessage: 'Not all rules are listed',
        }),
        'warning',
        i18n.translate('observability.alerting.alarmsPage.toast.rulesTruncated.body', {
          defaultMessage:
            '{names} returned more rules than this page loads. Search or filter to find a specific one.',
          values: { names: rulesTruncatedKey.split('||').join(', ') },
        })
      );
      lastRulesTruncatedKeyRef.current = rulesTruncatedKey;
    }
  }, [rulesTruncatedKey, activeTab, setToast]);
}
