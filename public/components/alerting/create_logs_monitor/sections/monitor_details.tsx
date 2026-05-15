/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Monitor Details section — monitor name and optional description fields.
 * Section 1 of the Create Logs Monitor flyout.
 */
import React from 'react';
import { EuiAccordion, EuiFieldText, EuiFormRow, EuiSpacer, EuiTextArea } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { LogsMonitorFormState } from '../create_logs_monitor_types';

/** Section 1: Monitor Details */
export const MonitorDetailsSection = React.memo<{
  form: LogsMonitorFormState;
  onUpdate: (patch: Partial<LogsMonitorFormState>) => void;
}>(({ form, onUpdate }) => (
  <EuiAccordion
    id="logs-monitor-details"
    buttonContent={
      <strong>
        {i18n.translate('observability.alerting.createLogsMonitor.monitorDetails.sectionTitle', {
          defaultMessage: 'Monitor Details',
        })}
      </strong>
    }
    initialIsOpen
    paddingSize="m"
  >
    <EuiFormRow
      label={i18n.translate(
        'observability.alerting.createLogsMonitor.monitorDetails.monitorNameLabel',
        { defaultMessage: 'Monitor name' }
      )}
      fullWidth
    >
      <EuiFieldText
        placeholder={i18n.translate(
          'observability.alerting.createLogsMonitor.monitorDetails.monitorNamePlaceholder',
          { defaultMessage: 'Enter a monitor name' }
        )}
        value={form.monitorName}
        onChange={(e) => onUpdate({ monitorName: e.target.value })}
        fullWidth
        compressed
        aria-label={i18n.translate(
          'observability.alerting.createLogsMonitor.monitorDetails.monitorNameAriaLabel',
          { defaultMessage: 'Monitor name' }
        )}
      />
    </EuiFormRow>
    <EuiSpacer size="m" />
    <EuiFormRow
      label={
        <span>
          {i18n.translate(
            'observability.alerting.createLogsMonitor.monitorDetails.descriptionLabel',
            { defaultMessage: 'Description' }
          )}{' '}
          <span
            style={{ fontSize: 12, color: '#98A2B3', fontStyle: 'italic', fontWeight: 'normal' }}
          >
            {i18n.translate(
              'observability.alerting.createLogsMonitor.monitorDetails.descriptionOptional',
              { defaultMessage: '— optional' }
            )}
          </span>
        </span>
      }
      fullWidth
    >
      <EuiTextArea
        placeholder={i18n.translate(
          'observability.alerting.createLogsMonitor.monitorDetails.descriptionPlaceholder',
          { defaultMessage: 'Describe this monitor' }
        )}
        value={form.description}
        onChange={(e) => onUpdate({ description: e.target.value })}
        rows={3}
        fullWidth
        compressed
        aria-label={i18n.translate(
          'observability.alerting.createLogsMonitor.monitorDetails.descriptionAriaLabel',
          { defaultMessage: 'Monitor description' }
        )}
      />
    </EuiFormRow>
  </EuiAccordion>
));
