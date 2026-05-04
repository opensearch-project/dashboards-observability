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
import { LogsMonitorFormState } from '../create_logs_monitor_types';

/** Section 1: Monitor Details */
export const MonitorDetailsSection = React.memo<{
  form: LogsMonitorFormState;
  onUpdate: (patch: Partial<LogsMonitorFormState>) => void;
}>(({ form, onUpdate }) => (
  <EuiAccordion
    id="logs-monitor-details"
    buttonContent={<strong>Monitor Details</strong>}
    initialIsOpen
    paddingSize="m"
  >
    <EuiFormRow label="Monitor name" fullWidth>
      <EuiFieldText
        placeholder="Enter a monitor name"
        value={form.monitorName}
        onChange={(e) => onUpdate({ monitorName: e.target.value })}
        fullWidth
        compressed
        aria-label="Monitor name"
      />
    </EuiFormRow>
    <EuiSpacer size="m" />
    <EuiFormRow
      label={
        <span>
          Description{' '}
          <span
            style={{ fontSize: 12, color: '#98A2B3', fontStyle: 'italic', fontWeight: 'normal' }}
          >
            — optional
          </span>
        </span>
      }
      fullWidth
    >
      <EuiTextArea
        placeholder="Describe this monitor"
        value={form.description}
        onChange={(e) => onUpdate({ description: e.target.value })}
        rows={3}
        fullWidth
        compressed
        aria-label="Monitor description"
      />
    </EuiFormRow>
  </EuiAccordion>
));
