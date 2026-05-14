/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Trigger list for `monitor_type === 'ppl_monitor'`. Each trigger fires on
 * either a row-count threshold (`number_of_results`) or a custom PPL
 * `where ...` clause appended to the base query.
 */
import React, { useCallback } from 'react';
import {
  EuiAccordion,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFieldNumber,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiHorizontalRule,
  EuiPanel,
  EuiRadioGroup,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTextArea,
  EuiTitle,
} from '@elastic/eui';
import {
  PplActionForm,
  PplNumResultsOperator,
  PplTriggerForm,
  PplTriggerSeverity,
  PplTriggerType,
} from '../create_monitor_types';
import { DestinationPicker } from './destination_picker';

// Mirrors the alerting plugin's cluster-setting defaults
// (`plugins.alerting.ppl_query_results_max_datarows`,
// `plugins.alerting.notification_subject_source_max_length`,
// `plugins.alerting.notification_message_source_max_length`).
const NUM_RESULTS_MIN = 1;
const NUM_RESULTS_MAX = 10000;
const SUBJECT_MAX = 1000;
const MESSAGE_MAX = 5000;

const SEVERITY_OPTIONS: Array<{ value: PplTriggerSeverity; text: string }> = [
  { value: '1', text: '1 (highest)' },
  { value: '2', text: '2' },
  { value: '3', text: '3 (default)' },
  { value: '4', text: '4' },
  { value: '5', text: '5 (lowest)' },
];

const NUM_RESULTS_OPERATOR_OPTIONS: Array<{ value: PplNumResultsOperator; text: string }> = [
  { value: '>', text: '>' },
  { value: '>=', text: '>=' },
  { value: '<', text: '<' },
  { value: '<=', text: '<=' },
  { value: '==', text: '==' },
  { value: '!=', text: '!=' },
];

const TRIGGER_TYPE_RADIOS = [
  { id: 'number_of_results', label: 'Number of results' },
  { id: 'custom', label: 'Custom condition' },
];

const CUSTOM_CONDITION_REGEX = /^\s*where\s+.+/i;

interface PplTriggersSectionProps {
  /**
   * Datasource the trigger actions resolve destinations against. Empty
   * string disables the picker (the form already prompts the user to pick
   * a datasource before saving).
   */
  dsId: string;
  triggers: PplTriggerForm[];
  onChange: (triggers: PplTriggerForm[]) => void;
  /** True after the user has attempted to submit at least once. */
  hasSubmitted?: boolean;
}

const newActionId = () => `ppl-action-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const newTriggerId = () => `ppl-trigger-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

const createDefaultAction = (index: number): PplActionForm => ({
  id: newActionId(),
  name: `action_${index + 1}`,
  destinationId: '',
  subject: '',
  message: '',
});

const createDefaultTrigger = (index: number): PplTriggerForm => ({
  id: newTriggerId(),
  name: `trigger-${index + 1}`,
  severity: '3',
  type: 'number_of_results',
  numResultsCondition: '>',
  numResultsValue: 1,
  customCondition: 'where ',
  actions: [],
});

export const PplTriggersSection: React.FC<PplTriggersSectionProps> = ({
  dsId,
  triggers,
  onChange,
  hasSubmitted,
}) => {
  const updateTrigger = useCallback(
    (id: string, patch: Partial<PplTriggerForm>) => {
      onChange(triggers.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    },
    [triggers, onChange]
  );

  const removeTrigger = useCallback(
    (id: string) => {
      onChange(triggers.filter((t) => t.id !== id));
    },
    [triggers, onChange]
  );

  const addTrigger = useCallback(() => {
    onChange([...triggers, createDefaultTrigger(triggers.length)]);
  }, [triggers, onChange]);

  const updateAction = useCallback(
    (triggerId: string, actionId: string, patch: Partial<PplActionForm>) => {
      onChange(
        triggers.map((t) =>
          t.id === triggerId
            ? {
                ...t,
                actions: t.actions.map((a) => (a.id === actionId ? { ...a, ...patch } : a)),
              }
            : t
        )
      );
    },
    [triggers, onChange]
  );

  const removeAction = useCallback(
    (triggerId: string, actionId: string) => {
      onChange(
        triggers.map((t) =>
          t.id === triggerId ? { ...t, actions: t.actions.filter((a) => a.id !== actionId) } : t
        )
      );
    },
    [triggers, onChange]
  );

  const addAction = useCallback(
    (triggerId: string) => {
      onChange(
        triggers.map((t) =>
          t.id === triggerId
            ? { ...t, actions: [...t.actions, createDefaultAction(t.actions.length)] }
            : t
        )
      );
    },
    [triggers, onChange]
  );

  return (
    <section aria-label="PPL triggers" data-test-subj="alertManager-pplTriggersSection">
      <EuiTitle size="xs">
        <h3>Triggers ({triggers.length})</h3>
      </EuiTitle>
      <EuiText size="xs" color="subdued">
        Each trigger evaluates the monitor query and fires when its condition is met.
      </EuiText>
      <EuiSpacer size="s" />

      {triggers.map((trigger, idx) => {
        const isCustom = trigger.type === 'custom';
        const customConditionInvalid =
          isCustom && hasSubmitted && !CUSTOM_CONDITION_REGEX.test(trigger.customCondition);
        const numResultsInvalid =
          !isCustom &&
          hasSubmitted &&
          (!Number.isFinite(trigger.numResultsValue) ||
            trigger.numResultsValue < NUM_RESULTS_MIN ||
            trigger.numResultsValue > NUM_RESULTS_MAX);
        const nameInvalid = hasSubmitted && trigger.name.trim() === '';

        return (
          <React.Fragment key={trigger.id}>
            {idx > 0 && <EuiSpacer size="m" />}
            <EuiPanel paddingSize="s" hasBorder>
              <EuiAccordion
                id={`ppl-trigger-${trigger.id}`}
                buttonContent={<strong>{trigger.name || `Trigger ${idx + 1}`}</strong>}
                initialIsOpen
                paddingSize="s"
                extraAction={
                  <EuiButtonEmpty
                    size="xs"
                    color="danger"
                    isDisabled={triggers.length <= 1}
                    onClick={() => removeTrigger(trigger.id)}
                    aria-label={`Delete ${trigger.name}`}
                  >
                    Delete
                  </EuiButtonEmpty>
                }
              >
                <EuiFormRow
                  label="Trigger name"
                  fullWidth
                  isInvalid={nameInvalid}
                  error={nameInvalid ? 'Name is required' : undefined}
                >
                  <EuiFieldText
                    value={trigger.name}
                    onChange={(e) => updateTrigger(trigger.id, { name: e.target.value })}
                    fullWidth
                    compressed
                    aria-label="Trigger name"
                  />
                </EuiFormRow>
                <EuiSpacer size="s" />

                <EuiFlexGroup gutterSize="m">
                  <EuiFlexItem>
                    <EuiFormRow label="Severity" display="rowCompressed">
                      <EuiSelect
                        options={SEVERITY_OPTIONS}
                        value={trigger.severity}
                        onChange={(e) =>
                          updateTrigger(trigger.id, {
                            severity: e.target.value as PplTriggerSeverity,
                          })
                        }
                        compressed
                        aria-label="Severity"
                      />
                    </EuiFormRow>
                  </EuiFlexItem>
                </EuiFlexGroup>
                <EuiSpacer size="s" />

                <EuiFormRow label="Condition type" fullWidth>
                  <EuiRadioGroup
                    options={TRIGGER_TYPE_RADIOS}
                    idSelected={trigger.type}
                    onChange={(id) => updateTrigger(trigger.id, { type: id as PplTriggerType })}
                    name={`ppl-trigger-type-${trigger.id}`}
                  />
                </EuiFormRow>
                <EuiSpacer size="s" />

                {trigger.type === 'number_of_results' ? (
                  <EuiFormRow
                    label="Trigger condition"
                    helpText={`Threshold (1–${NUM_RESULTS_MAX}). Backend cap from plugins.alerting.ppl_query_results_max_datarows.`}
                    isInvalid={numResultsInvalid}
                    error={
                      numResultsInvalid
                        ? `Value must be an integer between ${NUM_RESULTS_MIN} and ${NUM_RESULTS_MAX}`
                        : undefined
                    }
                  >
                    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                      <EuiFlexItem grow={false} style={{ minWidth: 100 }}>
                        <EuiSelect
                          options={NUM_RESULTS_OPERATOR_OPTIONS}
                          value={trigger.numResultsCondition}
                          onChange={(e) =>
                            updateTrigger(trigger.id, {
                              numResultsCondition: e.target.value as PplNumResultsOperator,
                            })
                          }
                          compressed
                          aria-label="Condition operator"
                        />
                      </EuiFlexItem>
                      <EuiFlexItem grow={false} style={{ minWidth: 120 }}>
                        <EuiFieldNumber
                          value={trigger.numResultsValue}
                          min={NUM_RESULTS_MIN}
                          max={NUM_RESULTS_MAX}
                          step={1}
                          onChange={(e) =>
                            updateTrigger(trigger.id, {
                              numResultsValue: parseInt(e.target.value, 10) || 0,
                            })
                          }
                          compressed
                          aria-label="Threshold value"
                        />
                      </EuiFlexItem>
                      <EuiFlexItem>
                        <EuiText size="xs" color="subdued">
                          When the query returns {trigger.numResultsCondition}{' '}
                          {trigger.numResultsValue} datarows, this trigger fires.
                        </EuiText>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiFormRow>
                ) : (
                  <EuiFormRow
                    label="Custom condition"
                    helpText={
                      'A PPL `where` clause appended to the base query. Must start with `where`. ' +
                      'Example: where avg_latency > 300'
                    }
                    isInvalid={customConditionInvalid}
                    error={
                      customConditionInvalid
                        ? 'Custom condition must start with `where`'
                        : undefined
                    }
                    fullWidth
                  >
                    <EuiTextArea
                      value={trigger.customCondition}
                      onChange={(e) =>
                        updateTrigger(trigger.id, { customCondition: e.target.value })
                      }
                      rows={2}
                      fullWidth
                      compressed
                      aria-label="Custom PPL where clause"
                    />
                  </EuiFormRow>
                )}

                <EuiHorizontalRule margin="m" />

                <EuiTitle size="xxs">
                  <h4>Notification actions ({trigger.actions.length})</h4>
                </EuiTitle>
                <EuiSpacer size="xs" />
                {!dsId && trigger.actions.length > 0 && (
                  <EuiCallOut size="s" color="warning" iconType="iInCircle">
                    <EuiText size="xs">
                      Pick a datasource first to load notification destinations.
                    </EuiText>
                  </EuiCallOut>
                )}

                {trigger.actions.map((action, actionIdx) => {
                  const subjectInvalid = hasSubmitted && action.subject.length > SUBJECT_MAX;
                  const messageInvalid =
                    hasSubmitted &&
                    (action.message.length === 0 || action.message.length > MESSAGE_MAX);
                  const destinationInvalid = hasSubmitted && action.destinationId === '';
                  return (
                    <React.Fragment key={action.id}>
                      {actionIdx > 0 && <EuiSpacer size="xs" />}
                      <EuiPanel paddingSize="s" hasBorder>
                        <EuiAccordion
                          id={`ppl-action-${action.id}`}
                          buttonContent={<span>{action.name}</span>}
                          initialIsOpen
                          paddingSize="s"
                          extraAction={
                            <EuiButtonEmpty
                              size="xs"
                              color="danger"
                              onClick={() => removeAction(trigger.id, action.id)}
                              aria-label={`Delete action ${action.name}`}
                            >
                              Delete
                            </EuiButtonEmpty>
                          }
                        >
                          <EuiFormRow label="Action name" fullWidth>
                            <EuiFieldText
                              value={action.name}
                              onChange={(e) =>
                                updateAction(trigger.id, action.id, { name: e.target.value })
                              }
                              fullWidth
                              compressed
                              aria-label="Action name"
                            />
                          </EuiFormRow>
                          <EuiSpacer size="s" />
                          <DestinationPicker
                            dsId={dsId}
                            value={action.destinationId}
                            onChange={(id) =>
                              updateAction(trigger.id, action.id, { destinationId: id })
                            }
                            ariaLabel={`Destination for ${action.name}`}
                            isInvalid={destinationInvalid}
                            errorMessage={
                              destinationInvalid ? 'Destination is required' : undefined
                            }
                          />
                          <EuiSpacer size="s" />
                          <EuiFormRow
                            label="Subject"
                            fullWidth
                            helpText={`Max ${SUBJECT_MAX} chars.`}
                            isInvalid={subjectInvalid}
                            error={
                              subjectInvalid
                                ? `Subject must be ≤ ${SUBJECT_MAX} characters`
                                : undefined
                            }
                          >
                            <EuiFieldText
                              value={action.subject}
                              onChange={(e) =>
                                updateAction(trigger.id, action.id, { subject: e.target.value })
                              }
                              fullWidth
                              compressed
                              aria-label="Action subject"
                            />
                          </EuiFormRow>
                          <EuiSpacer size="s" />
                          <EuiFormRow
                            label="Message"
                            fullWidth
                            helpText={`Mustache templates supported. Max ${MESSAGE_MAX} chars.`}
                            isInvalid={messageInvalid}
                            error={
                              messageInvalid
                                ? action.message.length === 0
                                  ? 'Message is required'
                                  : `Message must be ≤ ${MESSAGE_MAX} characters`
                                : undefined
                            }
                          >
                            <EuiTextArea
                              value={action.message}
                              onChange={(e) =>
                                updateAction(trigger.id, action.id, { message: e.target.value })
                              }
                              rows={4}
                              fullWidth
                              compressed
                              aria-label="Action message"
                            />
                          </EuiFormRow>
                        </EuiAccordion>
                      </EuiPanel>
                    </React.Fragment>
                  );
                })}
                <EuiSpacer size="s" />
                <EuiButtonEmpty
                  size="xs"
                  iconType="plusInCircle"
                  onClick={() => addAction(trigger.id)}
                  aria-label="Add another action"
                >
                  Add another action
                </EuiButtonEmpty>
              </EuiAccordion>
            </EuiPanel>
          </React.Fragment>
        );
      })}
      <EuiSpacer size="m" />
      <EuiButtonEmpty
        size="s"
        iconType="plusInCircle"
        onClick={addTrigger}
        aria-label="Add another trigger"
        data-test-subj="alertManager-addPplTrigger"
      >
        Add another trigger
      </EuiButtonEmpty>
    </section>
  );
};
