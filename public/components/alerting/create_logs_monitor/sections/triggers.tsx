/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Triggers section — wraps the list of `TriggerItem` components and renders
 * the "Add another trigger" affordance. Section 5 of the Create Logs Monitor
 * flyout.
 */
import React from 'react';
import { EuiButtonEmpty, EuiPanel, EuiSpacer, EuiTitle } from '@elastic/eui';
import { ActionState, LogsMonitorType, TriggerState } from '../create_logs_monitor_types';
import { TriggerItem } from './trigger_item';

export const TriggersSection = React.memo<{
  triggers: TriggerState[];
  monitorType: LogsMonitorType;
  onUpdateTrigger: (id: string, patch: Partial<TriggerState>) => void;
  onDeleteTrigger: (id: string) => void;
  onAddTrigger: () => void;
  onUpdateAction: (triggerId: string, actionId: string, patch: Partial<ActionState>) => void;
  onDeleteAction: (triggerId: string, actionId: string) => void;
  onAddAction: (triggerId: string) => void;
}>(
  ({
    triggers,
    monitorType,
    onUpdateTrigger,
    onDeleteTrigger,
    onAddTrigger,
    onUpdateAction,
    onDeleteAction,
    onAddAction,
  }) => (
    <section aria-label="Triggers">
      <EuiTitle size="xs">
        <h3>Triggers ({triggers.length})</h3>
      </EuiTitle>
      <EuiSpacer size="s" />
      {triggers.map((trigger, idx) => (
        <React.Fragment key={trigger.id}>
          {idx > 0 && <EuiSpacer size="m" />}
          <EuiPanel paddingSize="s" hasBorder>
            <TriggerItem
              trigger={trigger}
              index={idx}
              monitorType={monitorType}
              totalTriggers={triggers.length}
              onUpdate={onUpdateTrigger}
              onDelete={onDeleteTrigger}
              onUpdateAction={onUpdateAction}
              onDeleteAction={onDeleteAction}
              onAddAction={onAddAction}
            />
          </EuiPanel>
        </React.Fragment>
      ))}
      <EuiSpacer size="s" />
      <EuiButtonEmpty
        size="s"
        iconType="plusInCircle"
        onClick={onAddTrigger}
        aria-label="Add another trigger"
      >
        Add another trigger
      </EuiButtonEmpty>
    </section>
  )
);
