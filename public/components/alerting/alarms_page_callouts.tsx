/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Callout strip rendered above the tab bar on the Alerts page. Aggregates
 * three banners that previously lived inline in `alarms_page.tsx`:
 *   - "Alerting plugin not detected" — fired when the
 *     `opensearch-alerting` backend probe fails for every selected OS
 *     datasource (F25).
 *   - "Error loading alerts" — surfaces hook-driven fetch errors on the
 *     Alerts tab.
 *   - "Error loading data" — generic Rules-tab fetch error, unchanged
 *     from the inline version.
 *   - "Some datasources could not be reached" — combined warning list
 *     (Alerts hook + Rules fetch), keyed by datasource name.
 *
 * Pure presentational; the page owns the underlying state.
 */
import React from 'react';
import { EuiCallOut } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';

export interface DatasourceWarning {
  datasourceName: string;
  error: string;
}

export interface AlarmsPageCalloutsProps {
  /** True when no OS datasource responded to the alerting probe. */
  alertingPluginMissing: boolean;
  /** Loading flag from the probe — suppresses the banner during initial probe. */
  alertingProbeLoading: boolean;
  /** Hook-driven Alerts fetch error message, or null. Only rendered on Alerts tab. */
  alertsErrorMessage: string | null;
  activeTab: 'alerts' | 'rules' | 'routing';
  /** Generic page-level error (Rules fetch + others). */
  generalError: string | null;
  /** Pre-merged warning list (alerts vs rules — caller picks the right one). */
  warnings: DatasourceWarning[];
}

export const AlarmsPageCallouts: React.FC<AlarmsPageCalloutsProps> = ({
  alertingPluginMissing,
  alertingProbeLoading,
  alertsErrorMessage,
  activeTab,
  generalError,
  warnings,
}) => {
  return (
    <>
      {alertingPluginMissing && !alertingProbeLoading && (
        <EuiCallOut
          title={i18n.translate('observability.alerting.alarmsPage.alertingPluginMissing.title', {
            defaultMessage: 'Alerting plugin not detected',
          })}
          color="warning"
          iconType="alert"
          size="s"
          className="altCalloutSpaced"
          data-test-subj="alertManagerAlertingPluginMissing"
        >
          <p>
            <FormattedMessage
              id="observability.alerting.alarmsPage.alertingPluginMissing.body"
              defaultMessage="None of the selected OpenSearch clusters returned a successful response from the alerting API. Install the {pluginName} plugin on each cluster to use Alert Manager features."
              values={{ pluginName: <code>opensearch-alerting</code> }}
            />
          </p>
        </EuiCallOut>
      )}

      {alertsErrorMessage && activeTab === 'alerts' && (
        <EuiCallOut
          title={i18n.translate('observability.alerting.alarmsPage.alertsError.title', {
            defaultMessage: 'Error loading alerts',
          })}
          color="danger"
          iconType="alert"
          size="s"
          className="altCalloutSpaced"
          data-test-subj="alertManagerAlertsError"
        >
          <p>{alertsErrorMessage}</p>
        </EuiCallOut>
      )}

      {generalError && (
        <EuiCallOut
          title={i18n.translate('observability.alerting.alarmsPage.errorCallout.title', {
            defaultMessage: 'Error loading data',
          })}
          color="danger"
          iconType="alert"
          size="s"
          className="altCalloutSpaced"
        >
          <p>{generalError}</p>
        </EuiCallOut>
      )}

      {warnings.length > 0 && (
        <EuiCallOut
          title={i18n.translate('observability.alerting.alarmsPage.warningCallout.title', {
            defaultMessage: 'Some datasources could not be reached',
          })}
          color="warning"
          iconType="alert"
          size="s"
          className="altCalloutSpaced"
        >
          {warnings.map((w, i) => (
            <p key={i}>
              <strong>{w.datasourceName}</strong>: {w.error}
            </p>
          ))}
        </EuiCallOut>
      )}
    </>
  );
};
