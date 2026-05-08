/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Schedule section — frequency type + run-every interval pickers. Section 3
 * of the Create Logs Monitor flyout.
 */
import React from 'react';
import {
  EuiAccordion,
  EuiFieldNumber,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiSelect,
} from '@elastic/eui';
import { LogsMonitorFormState } from '../create_logs_monitor_types';
import { FREQUENCY_OPTIONS, TIME_UNIT_OPTIONS } from '../create_logs_monitor_constants';

/** Section 3: Schedule */
export const ScheduleSection = React.memo<{
  form: LogsMonitorFormState;
  onUpdate: (patch: Partial<LogsMonitorFormState>) => void;
}>(({ form, onUpdate }) => (
  <EuiAccordion
    id="logs-schedule-section"
    buttonContent={<strong>Schedule</strong>}
    initialIsOpen
    paddingSize="m"
  >
    <EuiFlexGroup gutterSize="m">
      <EuiFlexItem>
        <EuiFormRow label="Frequency" display="rowCompressed">
          <EuiSelect
            options={FREQUENCY_OPTIONS}
            value={form.frequencyType}
            onChange={(e) => onUpdate({ frequencyType: e.target.value })}
            compressed
            aria-label="Frequency"
          />
        </EuiFormRow>
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiFormRow label="Run every" display="rowCompressed">
          <EuiFlexGroup gutterSize="s" responsive={false}>
            <EuiFlexItem>
              <EuiFieldNumber
                value={form.runEveryValue}
                onChange={(e) => onUpdate({ runEveryValue: parseInt(e.target.value, 10) || 1 })}
                min={1}
                compressed
                aria-label="Run every value"
              />
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiSelect
                options={TIME_UNIT_OPTIONS}
                value={form.runEveryUnit}
                onChange={(e) => onUpdate({ runEveryUnit: e.target.value })}
                compressed
                aria-label="Run every unit"
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFormRow>
      </EuiFlexItem>
    </EuiFlexGroup>
  </EuiAccordion>
));
