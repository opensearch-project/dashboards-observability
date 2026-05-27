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
import { i18n } from '@osd/i18n';
import { FormattedMessage } from '@osd/i18n/react';
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
    const fallbackName = i18n.translate(
      'observability.alerting.createLogsMonitor.triggerItem.fallbackName',
      { defaultMessage: 'Trigger {index}', values: { index: index + 1 } }
    );
    return (
      <EuiAccordion
        id={`trigger-${trigger.id}`}
        buttonContent={<strong>{trigger.name || fallbackName}</strong>}
        initialIsOpen
        paddingSize="m"
        extraAction={
          <EuiButtonEmpty
            size="xs"
            color="danger"
            onClick={() => onDelete(trigger.id)}
            isDisabled={totalTriggers <= 1}
            aria-label={i18n.translate(
              'observability.alerting.createLogsMonitor.triggerItem.deleteTriggerAriaLabel',
              { defaultMessage: 'Delete {name}', values: { name: trigger.name } }
            )}
          >
            {i18n.translate('observability.alerting.createLogsMonitor.triggerItem.deleteButton', {
              defaultMessage: 'Delete',
            })}
          </EuiButtonEmpty>
        }
      >
        <EuiFormRow
          label={i18n.translate(
            'observability.alerting.createLogsMonitor.triggerItem.triggerNameLabel',
            { defaultMessage: 'Trigger name' }
          )}
          fullWidth
        >
          <EuiFieldText
            value={trigger.name}
            onChange={(e) => onUpdate(trigger.id, { name: e.target.value })}
            fullWidth
            compressed
            aria-label={i18n.translate(
              'observability.alerting.createLogsMonitor.triggerItem.triggerNameAriaLabel',
              { defaultMessage: 'Trigger name' }
            )}
          />
        </EuiFormRow>
        <EuiSpacer size="s" />

        <EuiFlexGroup gutterSize="m">
          <EuiFlexItem>
            <EuiFormRow
              label={i18n.translate(
                'observability.alerting.createLogsMonitor.triggerItem.severityLevelLabel',
                { defaultMessage: 'Severity level' }
              )}
              display="rowCompressed"
            >
              <EuiSelect
                options={SEVERITY_OPTIONS}
                value={trigger.severityLevel}
                onChange={(e) => onUpdate(trigger.id, { severityLevel: e.target.value })}
                compressed
                aria-label={i18n.translate(
                  'observability.alerting.createLogsMonitor.triggerItem.severityLevelAriaLabel',
                  { defaultMessage: 'Severity level' }
                )}
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFormRow
              label={i18n.translate(
                'observability.alerting.createLogsMonitor.triggerItem.typeLabel',
                { defaultMessage: 'Type' }
              )}
              display="rowCompressed"
            >
              <EuiSelect
                options={triggerTypeOptions}
                value={trigger.type}
                onChange={(e) => onUpdate(trigger.id, { type: e.target.value })}
                compressed
                aria-label={i18n.translate(
                  'observability.alerting.createLogsMonitor.triggerItem.triggerTypeAriaLabel',
                  { defaultMessage: 'Trigger type' }
                )}
              />
            </EuiFormRow>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />

        {/* Trigger condition */}
        <EuiFormRow
          label={i18n.translate(
            'observability.alerting.createLogsMonitor.triggerItem.triggerConditionLabel',
            { defaultMessage: 'Trigger condition' }
          )}
        >
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem>
              <EuiSelect
                options={CONDITION_OPERATOR_OPTIONS}
                value={trigger.conditionOperator}
                onChange={(e) => onUpdate(trigger.id, { conditionOperator: e.target.value })}
                compressed
                aria-label={i18n.translate(
                  'observability.alerting.createLogsMonitor.triggerItem.conditionOperatorAriaLabel',
                  { defaultMessage: 'Condition operator' }
                )}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false} style={{ minWidth: 100 }}>
              <EuiFieldNumber
                value={trigger.conditionValue}
                onChange={(e) =>
                  onUpdate(trigger.id, { conditionValue: parseFloat(e.target.value) || 0 })
                }
                compressed
                aria-label={i18n.translate(
                  'observability.alerting.createLogsMonitor.triggerItem.conditionValueAriaLabel',
                  { defaultMessage: 'Condition value' }
                )}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFormRow>
        <EuiSpacer size="m" />

        {/* Threshold visualization */}
        <EuiPanel paddingSize="s" color="subdued">
          <EuiCallOut size="s" color="warning" iconType="iInCircle">
            <EuiText size="xs">
              {i18n.translate(
                'observability.alerting.createLogsMonitor.triggerItem.sampleDataCallout',
                { defaultMessage: 'Sample data — run the monitor to see real results' }
              )}
            </EuiText>
          </EuiCallOut>
          <EuiSpacer size="xs" />
          <EuiText size="xs">
            <strong>
              {i18n.translate('observability.alerting.createLogsMonitor.triggerItem.resultsLabel', {
                defaultMessage: 'Results',
              })}
            </strong>
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
            <EuiToolTip
              content={i18n.translate(
                'observability.alerting.createLogsMonitor.triggerItem.suppressTooltip',
                {
                  defaultMessage:
                    'Suppress repeat notifications for this trigger for the specified duration after the first alert fires.',
                }
              )}
            >
              <EuiCheckbox
                id={`suppress-${trigger.id}`}
                label={i18n.translate(
                  'observability.alerting.createLogsMonitor.triggerItem.suppressLabel',
                  { defaultMessage: 'Suppress' }
                )}
                checked={trigger.suppressEnabled}
                onChange={(e) => onUpdate(trigger.id, { suppressEnabled: e.target.checked })}
              />
            </EuiToolTip>
          </EuiFlexItem>
          {trigger.suppressEnabled && (
            <>
              <EuiFlexItem grow={false}>
                <EuiFormRow
                  label={i18n.translate(
                    'observability.alerting.createLogsMonitor.triggerItem.expiresLabel',
                    { defaultMessage: 'Expires' }
                  )}
                  display="rowCompressed"
                >
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
                        aria-label={i18n.translate(
                          'observability.alerting.createLogsMonitor.triggerItem.suppressExpiryValueAriaLabel',
                          { defaultMessage: 'Suppress expiry value' }
                        )}
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
                        aria-label={i18n.translate(
                          'observability.alerting.createLogsMonitor.triggerItem.suppressExpiryUnitAriaLabel',
                          { defaultMessage: 'Suppress expiry unit' }
                        )}
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
          <h4>
            <FormattedMessage
              id="observability.alerting.createLogsMonitor.triggerItem.notificationActionsTitle"
              defaultMessage="Notification actions ({count})"
              values={{ count: trigger.actions.length }}
            />
          </h4>
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
                    aria-label={i18n.translate(
                      'observability.alerting.createLogsMonitor.triggerItem.deleteActionAriaLabel',
                      { defaultMessage: 'Delete action {name}', values: { name: action.name } }
                    )}
                  >
                    {i18n.translate(
                      'observability.alerting.createLogsMonitor.triggerItem.deleteActionButton',
                      { defaultMessage: 'Delete' }
                    )}
                  </EuiButtonEmpty>
                }
              >
                <EuiFormRow
                  label={i18n.translate(
                    'observability.alerting.createLogsMonitor.triggerItem.notificationChannelLabel',
                    { defaultMessage: 'Notification channel' }
                  )}
                  display="rowCompressed"
                  fullWidth
                >
                  <EuiSelect
                    options={NOTIFICATION_CHANNEL_OPTIONS}
                    value={action.notificationChannel}
                    onChange={(e) =>
                      onUpdateAction(trigger.id, action.id, { notificationChannel: e.target.value })
                    }
                    compressed
                    fullWidth
                    aria-label={i18n.translate(
                      'observability.alerting.createLogsMonitor.triggerItem.notificationChannelAriaLabel',
                      { defaultMessage: 'Notification channel' }
                    )}
                  />
                </EuiFormRow>
                <EuiSpacer size="s" />
                <EuiFormRow
                  label={i18n.translate(
                    'observability.alerting.createLogsMonitor.triggerItem.subjectLabel',
                    { defaultMessage: 'Subject' }
                  )}
                  display="rowCompressed"
                  fullWidth
                >
                  <EuiFieldText
                    placeholder={i18n.translate(
                      'observability.alerting.createLogsMonitor.triggerItem.subjectPlaceholder',
                      { defaultMessage: 'Enter a subject' }
                    )}
                    value={action.subject}
                    onChange={(e) =>
                      onUpdateAction(trigger.id, action.id, { subject: e.target.value })
                    }
                    compressed
                    fullWidth
                    aria-label={i18n.translate(
                      'observability.alerting.createLogsMonitor.triggerItem.actionSubjectAriaLabel',
                      { defaultMessage: 'Action subject' }
                    )}
                  />
                </EuiFormRow>
                <EuiSpacer size="s" />
                <EuiFormRow
                  label={i18n.translate(
                    'observability.alerting.createLogsMonitor.triggerItem.messageLabel',
                    { defaultMessage: 'Message' }
                  )}
                  helpText={i18n.translate(
                    'observability.alerting.createLogsMonitor.triggerItem.messageHelpText',
                    {
                      defaultMessage:
                        'Embed variables in your message using Mustache templates. Learn more',
                    }
                  )}
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
                    aria-label={i18n.translate(
                      'observability.alerting.createLogsMonitor.triggerItem.actionMessageAriaLabel',
                      { defaultMessage: 'Action message' }
                    )}
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
          aria-label={i18n.translate(
            'observability.alerting.createLogsMonitor.triggerItem.addActionAriaLabel',
            { defaultMessage: 'Add another action' }
          )}
        >
          {i18n.translate('observability.alerting.createLogsMonitor.triggerItem.addActionButton', {
            defaultMessage: 'Add another action',
          })}
        </EuiButtonEmpty>
      </EuiAccordion>
    );
  }
);
