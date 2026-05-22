/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Exclusion-window editor. Shape-only in P0: the definition is persisted
 * on the SLO document but attainment exclusion is deferred. The editor
 * captures the spec so data-gathering can start before enforcement ships.
 *
 * Two schedule modes:
 *   cron    — recurring (expression + timezone + duration-per-occurrence)
 *   oneoff  — start + end ISO timestamps
 */

import React from 'react';
import {
  EuiAccordion,
  EuiButtonEmpty,
  EuiButtonGroup,
  EuiCallOut,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import type { ExclusionWindow } from '../../../../../common/slo/slo_types';
import type { Action } from './wizard_state';

export interface ExclusionWindowsEditorProps {
  exclusionWindows: ExclusionWindow[];
  dispatch: React.Dispatch<Action>;
}

const SCHEDULE_OPTIONS = [
  {
    id: 'cron',
    label: i18n.translate('observability.apm.slo.wizard.exclusionWindows.scheduleCron', {
      defaultMessage: 'Recurring (cron)',
    }),
  },
  {
    id: 'oneoff',
    label: i18n.translate('observability.apm.slo.wizard.exclusionWindows.scheduleOneoff', {
      defaultMessage: 'One-off window',
    }),
  },
];

export const ExclusionWindowsEditor: React.FC<ExclusionWindowsEditorProps> = ({
  exclusionWindows,
  dispatch,
}) => (
  <EuiPanel>
    <EuiAccordion
      id="slosWizardExclusionWindows"
      buttonContent={i18n.translate(
        'observability.apm.slo.wizard.exclusionWindows.accordionLabel',
        { defaultMessage: 'Exclusion windows (maintenance / deploy freezes)' }
      )}
      paddingSize="s"
      data-test-subj="slosWizardExclusionWindowsToggle"
    >
      <EuiCallOut
        color="primary"
        size="s"
        iconType="iInCircle"
        title={i18n.translate('observability.apm.slo.wizard.exclusionWindows.notice', {
          defaultMessage: 'Saved with the SLO; attainment exclusion enforcement ships post-GA.',
        })}
        data-test-subj="slosWizardExclusionWindowsNotice"
      />
      <EuiSpacer size="s" />
      {exclusionWindows.length === 0 && (
        <EuiText size="s" color="subdued" data-test-subj="slosWizardExclusionWindowsEmpty">
          {i18n.translate('observability.apm.slo.wizard.exclusionWindows.emptyMessage', {
            defaultMessage: 'No exclusion windows configured.',
          })}
        </EuiText>
      )}
      {exclusionWindows.map((ew, i) => (
        <div
          // Stable per-row key — see objectives_section for rationale.
          key={ew.name ? `name:${ew.name}` : `idx:${i}`}
          style={{ marginBottom: 12 }}
          data-test-subj={`slosWizardExclusionRow-${i}`}
        >
          <EuiFlexGroup gutterSize="s" alignItems="flexEnd">
            <EuiFlexItem>
              <EuiFormRow
                label={i18n.translate('observability.apm.slo.wizard.exclusionWindows.nameLabel', {
                  defaultMessage: 'Name',
                })}
              >
                <EuiFieldText
                  value={ew.name}
                  onChange={(e) =>
                    dispatch({
                      kind: 'setExclusionWindowField',
                      index: i,
                      field: 'name',
                      value: e.target.value,
                    })
                  }
                  compressed
                  data-test-subj={`slosWizardExclusionName-${i}`}
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiFormRow
                label={i18n.translate('observability.apm.slo.wizard.exclusionWindows.reasonLabel', {
                  defaultMessage: 'Reason (optional)',
                })}
              >
                <EuiFieldText
                  value={ew.reason ?? ''}
                  onChange={(e) =>
                    dispatch({
                      kind: 'setExclusionWindowField',
                      index: i,
                      field: 'reason',
                      value: e.target.value,
                    })
                  }
                  compressed
                  data-test-subj={`slosWizardExclusionReason-${i}`}
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                color="danger"
                onClick={() => dispatch({ kind: 'removeExclusionWindow', index: i })}
                iconType="trash"
                aria-label={i18n.translate(
                  'observability.apm.slo.wizard.exclusionWindows.removeAriaLabel',
                  {
                    defaultMessage: 'Remove exclusion window {index}',
                    values: { index: i },
                  }
                )}
                size="s"
                data-test-subj={`slosWizardExclusionRemove-${i}`}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="xs" />
          <EuiButtonGroup
            legend={i18n.translate(
              'observability.apm.slo.wizard.exclusionWindows.scheduleTypeLegend',
              { defaultMessage: 'Schedule type' }
            )}
            idSelected={ew.schedule.type}
            onChange={(id) =>
              dispatch({
                kind: 'setExclusionWindowScheduleType',
                index: i,
                type: id === 'oneoff' ? 'oneoff' : 'cron',
              })
            }
            options={SCHEDULE_OPTIONS}
            data-test-subj={`slosWizardExclusionScheduleType-${i}`}
          />
          <EuiSpacer size="xs" />
          {ew.schedule.type === 'cron' ? (
            <EuiFlexGroup gutterSize="s" alignItems="flexEnd">
              <EuiFlexItem>
                <EuiFormRow
                  label={i18n.translate(
                    'observability.apm.slo.wizard.exclusionWindows.cronExpressionLabel',
                    { defaultMessage: 'Cron expression' }
                  )}
                >
                  <EuiFieldText
                    value={ew.schedule.expression}
                    onChange={(e) =>
                      dispatch({
                        kind: 'setExclusionWindowField',
                        index: i,
                        field: 'cronExpression',
                        value: e.target.value,
                      })
                    }
                    compressed
                    data-test-subj={`slosWizardExclusionCronExpression-${i}`}
                  />
                </EuiFormRow>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiFormRow
                  label={i18n.translate(
                    'observability.apm.slo.wizard.exclusionWindows.cronTimezoneLabel',
                    { defaultMessage: 'Timezone' }
                  )}
                >
                  <EuiFieldText
                    value={ew.schedule.timezone}
                    onChange={(e) =>
                      dispatch({
                        kind: 'setExclusionWindowField',
                        index: i,
                        field: 'cronTimezone',
                        value: e.target.value,
                      })
                    }
                    compressed
                    data-test-subj={`slosWizardExclusionCronTimezone-${i}`}
                  />
                </EuiFormRow>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiFormRow
                  label={i18n.translate(
                    'observability.apm.slo.wizard.exclusionWindows.cronDurationLabel',
                    { defaultMessage: 'Duration (per occurrence)' }
                  )}
                >
                  <EuiFieldText
                    value={ew.schedule.duration}
                    onChange={(e) =>
                      dispatch({
                        kind: 'setExclusionWindowField',
                        index: i,
                        field: 'cronDuration',
                        value: e.target.value,
                      })
                    }
                    compressed
                    data-test-subj={`slosWizardExclusionCronDuration-${i}`}
                  />
                </EuiFormRow>
              </EuiFlexItem>
            </EuiFlexGroup>
          ) : (
            <EuiFlexGroup gutterSize="s" alignItems="flexEnd">
              <EuiFlexItem>
                <EuiFormRow
                  label={i18n.translate(
                    'observability.apm.slo.wizard.exclusionWindows.oneoffStartLabel',
                    { defaultMessage: 'Start (ISO-8601)' }
                  )}
                >
                  <EuiFieldText
                    value={ew.schedule.start}
                    onChange={(e) =>
                      dispatch({
                        kind: 'setExclusionWindowField',
                        index: i,
                        field: 'oneoffStart',
                        value: e.target.value,
                      })
                    }
                    compressed
                    data-test-subj={`slosWizardExclusionOneoffStart-${i}`}
                  />
                </EuiFormRow>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiFormRow
                  label={i18n.translate(
                    'observability.apm.slo.wizard.exclusionWindows.oneoffEndLabel',
                    { defaultMessage: 'End (ISO-8601)' }
                  )}
                >
                  <EuiFieldText
                    value={ew.schedule.end}
                    onChange={(e) =>
                      dispatch({
                        kind: 'setExclusionWindowField',
                        index: i,
                        field: 'oneoffEnd',
                        value: e.target.value,
                      })
                    }
                    compressed
                    data-test-subj={`slosWizardExclusionOneoffEnd-${i}`}
                  />
                </EuiFormRow>
              </EuiFlexItem>
            </EuiFlexGroup>
          )}
        </div>
      ))}
      <EuiButtonEmpty
        iconType="plusInCircle"
        size="s"
        onClick={() => dispatch({ kind: 'addExclusionWindow' })}
        data-test-subj="slosWizardExclusionAdd"
      >
        {i18n.translate('observability.apm.slo.wizard.exclusionWindows.addButton', {
          defaultMessage: 'Add exclusion window',
        })}
      </EuiButtonEmpty>
    </EuiAccordion>
  </EuiPanel>
);
