/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Single trigger sub-section — one row of the triggers list. Renders name,
 * severity, type, condition, threshold chart, suppression controls, and the
 * list of notification actions with per-action subject/message editing.
 * Rendered once per trigger by `TriggersSection`.
 */
import React from 'react';
import {
  EuiAccordion,
  EuiButtonEmpty,
  EuiCallOut,
  EuiCheckbox,
  EuiFieldNumber,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTextArea,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { EchartsRender } from '../../echarts_render';
import { ActionState, LogsMonitorType, TriggerState } from '../create_logs_monitor_types';
import {
  buildTriggerChartOption,
  CONDITION_OPERATOR_OPTIONS,
  DEFAULT_ACTION_MESSAGE,
  NOTIFICATION_CHANNEL_OPTIONS,
  SEVERITY_OPTIONS,
  TIME_UNIT_OPTIONS,
  TRIGGER_TYPE_OPTIONS_BY_MONITOR,
} from '../create_logs_monitor_constants';

/** Single Trigger sub-section */
export const TriggerItem = React.memo<{
  trigger: TriggerState;
  index: number;
  monitorType: LogsMonitorType;
  totalTriggers: number;
  onUpdate: (id: string, patch: Partial<TriggerState>) => void;
  onDelete: (id: string) => void;
  onUpdateAction: (triggerId: string, actionId: string, patch: Partial<ActionState>) => void;
  onDeleteAction: (triggerId: string, actionId: string) => void;
  onAddAction: (triggerId: string) => void;
}>(
  ({
    trigger,
    index,
    monitorType,
    totalTriggers,
    onUpdate,
    onDelete,
    onUpdateAction,
    onDeleteAction,
    onAddAction,
  }) => {
    const triggerTypeOptions = TRIGGER_TYPE_OPTIONS_BY_MONITOR[monitorType];
    return (
      <EuiAccordion
        id={`trigger-${trigger.id}`}
        buttonContent={<strong>{trigger.name || `Trigger ${index + 1}`}</strong>}
        initialIsOpen
        paddingSize="m"
        extraAction={
          <EuiButtonEmpty
            size="xs"
            color="danger"
            onClick={() => onDelete(trigger.id)}
            isDisabled={totalTriggers <= 1}
            aria-label={`Delete ${trigger.name}`}
          >
            Delete
          </EuiButtonEmpty>
        }
      >
        <EuiFormRow label="Trigger name" fullWidth>
          <EuiFieldText
            value={trigger.name}
            onChange={(e) => onUpdate(trigger.id, { name: e.target.value })}
            fullWidth
            compressed
            aria-label="Trigger name"
          />
        </EuiFormRow>
        <EuiSpacer size="s" />

        <EuiFlexGroup gutterSize="m">
          <EuiFlexItem>
            <EuiFormRow label="Severity level" display="rowCompressed">
              <EuiSelect
                options={SEVERITY_OPTIONS}
                value={trigger.severityLevel}
                onChange={(e) => onUpdate(trigger.id, { severityLevel: e.target.value })}
                compressed
                aria-label="Severity level"
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFormRow label="Type" display="rowCompressed">
              <EuiSelect
                options={triggerTypeOptions}
                value={trigger.type}
                onChange={(e) => onUpdate(trigger.id, { type: e.target.value })}
                compressed
                aria-label="Trigger type"
              />
            </EuiFormRow>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />

        {/* Trigger condition */}
        <EuiFormRow label="Trigger condition">
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem>
              <EuiSelect
                options={CONDITION_OPERATOR_OPTIONS}
                value={trigger.conditionOperator}
                onChange={(e) => onUpdate(trigger.id, { conditionOperator: e.target.value })}
                compressed
                aria-label="Condition operator"
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false} style={{ minWidth: 100 }}>
              <EuiFieldNumber
                value={trigger.conditionValue}
                onChange={(e) =>
                  onUpdate(trigger.id, { conditionValue: parseFloat(e.target.value) || 0 })
                }
                compressed
                aria-label="Condition value"
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFormRow>
        <EuiSpacer size="m" />

        {/* Threshold visualization */}
        <EuiPanel paddingSize="s" color="subdued">
          <EuiCallOut size="s" color="warning" iconType="iInCircle">
            <EuiText size="xs">Sample data — run the monitor to see real results</EuiText>
          </EuiCallOut>
          <EuiSpacer size="xs" />
          <EuiText size="xs">
            <strong>Results</strong>
          </EuiText>
          <EuiText size="xs" color="subdued">
            EVENTS_LAST_HOUR_v2
          </EuiText>
          <EuiSpacer size="xs" />
          <EchartsRender spec={buildTriggerChartOption(trigger.conditionValue)} height={180} />
        </EuiPanel>
        <EuiSpacer size="m" />

        {/* Suppress */}
        <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiToolTip content="Suppress repeat notifications for this trigger for the specified duration after the first alert fires.">
              <EuiCheckbox
                id={`suppress-${trigger.id}`}
                label="Suppress"
                checked={trigger.suppressEnabled}
                onChange={(e) => onUpdate(trigger.id, { suppressEnabled: e.target.checked })}
              />
            </EuiToolTip>
          </EuiFlexItem>
          {trigger.suppressEnabled && (
            <>
              <EuiFlexItem grow={false}>
                <EuiFormRow label="Expires" display="rowCompressed">
                  <EuiFlexGroup gutterSize="xs" responsive={false}>
                    <EuiFlexItem style={{ minWidth: 60 }}>
                      <EuiFieldNumber
                        value={trigger.suppressExpiry}
                        onChange={(e) =>
                          onUpdate(trigger.id, {
                            suppressExpiry: parseInt(e.target.value, 10) || 1,
                          })
                        }
                        min={1}
                        compressed
                        aria-label="Suppress expiry value"
                      />
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <EuiSelect
                        options={TIME_UNIT_OPTIONS}
                        value={trigger.suppressExpiryUnit}
                        onChange={(e) =>
                          onUpdate(trigger.id, { suppressExpiryUnit: e.target.value })
                        }
                        compressed
                        aria-label="Suppress expiry unit"
                      />
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiFormRow>
              </EuiFlexItem>
            </>
          )}
        </EuiFlexGroup>
        <EuiSpacer size="m" />

        {/* Notification actions */}
        <EuiTitle size="xxs">
          <h4>Notification actions ({trigger.actions.length})</h4>
        </EuiTitle>
        <EuiSpacer size="s" />
        {trigger.actions.map((action, actionIdx) => (
          <React.Fragment key={action.id}>
            {actionIdx > 0 && <EuiSpacer size="xs" />}
            <EuiPanel paddingSize="s" hasBorder>
              <EuiAccordion
                id={`action-${action.id}`}
                buttonContent={<span>{action.name}</span>}
                paddingSize="s"
                extraAction={
                  <EuiButtonEmpty
                    size="xs"
                    color="danger"
                    onClick={() => onDeleteAction(trigger.id, action.id)}
                    aria-label={`Delete action ${action.name}`}
                  >
                    Delete
                  </EuiButtonEmpty>
                }
              >
                <EuiFormRow label="Notification channel" display="rowCompressed" fullWidth>
                  <EuiSelect
                    options={NOTIFICATION_CHANNEL_OPTIONS}
                    value={action.notificationChannel}
                    onChange={(e) =>
                      onUpdateAction(trigger.id, action.id, { notificationChannel: e.target.value })
                    }
                    compressed
                    fullWidth
                    aria-label="Notification channel"
                  />
                </EuiFormRow>
                <EuiSpacer size="s" />
                <EuiFormRow label="Subject" display="rowCompressed" fullWidth>
                  <EuiFieldText
                    placeholder="Enter a subject"
                    value={action.subject}
                    onChange={(e) =>
                      onUpdateAction(trigger.id, action.id, { subject: e.target.value })
                    }
                    compressed
                    fullWidth
                    aria-label="Action subject"
                  />
                </EuiFormRow>
                <EuiSpacer size="s" />
                <EuiFormRow
                  label="Message"
                  helpText="Embed variables in your message using Mustache templates. Learn more"
                  display="rowCompressed"
                  fullWidth
                >
                  <EuiTextArea
                    placeholder={DEFAULT_ACTION_MESSAGE}
                    value={action.message}
                    onChange={(e) =>
                      onUpdateAction(trigger.id, action.id, { message: e.target.value })
                    }
                    rows={6}
                    fullWidth
                    compressed
                    aria-label="Action message"
                  />
                </EuiFormRow>
              </EuiAccordion>
            </EuiPanel>
          </React.Fragment>
        ))}
        <EuiSpacer size="s" />
        <EuiButtonEmpty
          size="s"
          iconType="plusInCircle"
          onClick={() => onAddAction(trigger.id)}
          aria-label="Add another action"
        >
          Add another action
        </EuiButtonEmpty>
      </EuiAccordion>
    );
  }
);
