/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Monitor Type section — button-group selector for the four logs-monitor
 * variants plus a help call-out describing the currently-selected type.
 */
import React from 'react';
import { EuiAccordion, EuiButtonGroup, EuiCallOut, EuiSpacer, EuiText } from '@elastic/eui';
import { LogsMonitorType } from '../create_logs_monitor_types';
import { MONITOR_TYPE_DESCRIPTIONS, MONITOR_TYPE_OPTIONS } from '../create_logs_monitor_constants';

/** Section: Monitor Type Selection */
export const MonitorTypeSection = React.memo<{
  monitorType: LogsMonitorType;
  onUpdate: (type: LogsMonitorType) => void;
}>(({ monitorType, onUpdate }) => (
  <EuiAccordion
    id="logs-monitor-type"
    buttonContent={<strong>Monitor type</strong>}
    initialIsOpen
    paddingSize="m"
  >
    <EuiButtonGroup
      legend="Select monitor type"
      options={MONITOR_TYPE_OPTIONS}
      idSelected={monitorType}
      onChange={(id) => onUpdate(id as LogsMonitorType)}
      buttonSize="compressed"
      isFullWidth
    />
    <EuiSpacer size="s" />
    <EuiCallOut size="s" color="primary" iconType="iInCircle">
      <EuiText size="xs">{MONITOR_TYPE_DESCRIPTIONS[monitorType]}</EuiText>
    </EuiCallOut>
  </EuiAccordion>
));
