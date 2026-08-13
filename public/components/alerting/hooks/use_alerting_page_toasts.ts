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
 * Build a stable key for the datasource-issues set so we only toast when
 * the set changes (new datasource fails, existing one recovers, or the
 * error text changes). Sort by id to make order-agnostic.
 */
function datasourceIssuesKey(issues: DatasourceIssue[]): string {
  return issues
    .map((i) => `${i.datasourceId}|${i.error}`)
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
  // A key of `null` means "not currently active" — a subsequent activation
  // fires a new toast; sustained state does not.
  const lastAlertsErrorRef = useRef<string | null>(null);
  const lastRulesErrorRef = useRef<string | null>(null);
  const lastPluginMissingRef = useRef<boolean>(false);
  const lastDsIssuesKeyRef = useRef<string>('');
  const lastTruncatedRef = useRef<boolean>(false);
  const lastFallbackKeyRef = useRef<string>('');

  // Alerts fetch error
  useEffect(() => {
    if (alertsErrorMessage && alertsErrorMessage !== lastAlertsErrorRef.current) {
      setToast(
        i18n.translate('observability.alerting.alarmsPage.toast.alertsError.title', {
          defaultMessage: 'Error loading alerts',
        }),
        'danger',
        alertsErrorMessage
      );
    }
    lastAlertsErrorRef.current = alertsErrorMessage;
  }, [alertsErrorMessage, setToast]);

  // Rules fetch error
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

  // Alerting plugin not detected (suppress while the probe is still running)
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

  // Alerts result truncated (OS post-filter 1000-alert cap)
  useEffect(() => {
    if (alertsTruncated && !lastTruncatedRef.current) {
      setToast(
        i18n.translate('observability.alerting.alarmsPage.toast.alertsTruncated.title', {
          defaultMessage: 'Search incomplete — too many alerts to scan',
        }),
        'warning',
        i18n.translate('observability.alerting.alarmsPage.toast.alertsTruncated.body', {
          defaultMessage: 'Narrow the time range or refine your filters and try again.',
        })
      );
    }
    lastTruncatedRef.current = alertsTruncated;
  }, [alertsTruncated, setToast]);

  // Legacy-fallback hints (Prometheus empty-matrix → active-only)
  useEffect(() => {
    const key = fallbackHintsKey(fallbackHints);
    if (key && key !== lastFallbackKeyRef.current) {
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
    }
    lastFallbackKeyRef.current = key;
  }, [fallbackHints, setToast]);
}
