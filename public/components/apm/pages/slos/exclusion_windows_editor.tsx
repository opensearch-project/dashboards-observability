/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Exclusion-window editor. Shape-only: the definition is persisted on the
 * SLO document but attainment exclusion enforcement is deferred. The editor
 * captures the spec so data-gathering can start before enforcement ships.
 *
 * Two schedule modes:
 *   cron    — recurring (expression + timezone + duration-per-occurrence)
 *   oneoff  — start + end ISO timestamps
 */

import React from 'react';
import { i18n } from '@osd/i18n';
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
import type { ExclusionWindow } from '../../../../../common/slo/slo_types';
import type { Action } from './wizard_state';

export interface ExclusionWindowsEditorProps {
  exclusionWindows: ExclusionWindow[];
  dispatch: React.Dispatch<Action>;
}

const I18N = {
  scheduleCron: i18n.translate('observability.slo.exclusionWindows.scheduleCron', {
    defaultMessage: 'Recurring (cron)',
  }),
  scheduleOneoff: i18n.translate('observability.slo.exclusionWindows.scheduleOneoff', {
    defaultMessage: 'One-off window',
  }),
  accordionLabel: i18n.translate('observability.slo.exclusionWindows.accordionLabel', {
    defaultMessage: 'Exclusion windows (maintenance / deploy freezes)',
  }),
  noticeTitle: i18n.translate('observability.slo.exclusionWindows.noticeTitle', {
    defaultMessage: 'Saved with the SLO; attainment exclusion enforcement ships post-GA.',
  }),
  empty: i18n.translate('observability.slo.exclusionWindows.empty', {
    defaultMessage: 'No exclusion windows configured.',
  }),
  nameLabel: i18n.translate('observability.slo.exclusionWindows.nameLabel', {
    defaultMessage: 'Name',
  }),
  reasonLabel: i18n.translate('observability.slo.exclusionWindows.reasonLabel', {
    defaultMessage: 'Reason (optional)',
  }),
  removeAria: (index: number) =>
    i18n.translate('observability.slo.exclusionWindows.removeAria', {
      defaultMessage: 'Remove exclusion window {index}',
      values: { index },
    }),
  scheduleLegend: i18n.translate('observability.slo.exclusionWindows.scheduleLegend', {
    defaultMessage: 'Schedule type',
  }),
  cronExpression: i18n.translate('observability.slo.exclusionWindows.cronExpression', {
    defaultMessage: 'Cron expression',
  }),
  timezone: i18n.translate('observability.slo.exclusionWindows.timezone', {
    defaultMessage: 'Timezone',
  }),
  duration: i18n.translate('observability.slo.exclusionWindows.duration', {
    defaultMessage: 'Duration (per occurrence)',
  }),
  startIso: i18n.translate('observability.slo.exclusionWindows.startIso', {
    defaultMessage: 'Start (ISO-8601)',
  }),
  endIso: i18n.translate('observability.slo.exclusionWindows.endIso', {
    defaultMessage: 'End (ISO-8601)',
  }),
  addButton: i18n.translate('observability.slo.exclusionWindows.addButton', {
    defaultMessage: 'Add exclusion window',
  }),
};

const SCHEDULE_OPTIONS = [
  { id: 'cron', label: I18N.scheduleCron },
  { id: 'oneoff', label: I18N.scheduleOneoff },
];

export const ExclusionWindowsEditor: React.FC<ExclusionWindowsEditorProps> = ({
  exclusionWindows,
  dispatch,
}) => (
  <EuiPanel>
    <EuiAccordion
      id="slosWizardExclusionWindows"
      buttonContent={I18N.accordionLabel}
      paddingSize="s"
      data-test-subj="slosWizardExclusionWindowsToggle"
    >
      <EuiCallOut
        color="primary"
        size="s"
        iconType="iInCircle"
        title={I18N.noticeTitle}
        data-test-subj="slosWizardExclusionWindowsNotice"
      />
      <EuiSpacer size="s" />
      {exclusionWindows.length === 0 && (
        <EuiText size="s" color="subdued" data-test-subj="slosWizardExclusionWindowsEmpty">
          {I18N.empty}
        </EuiText>
      )}
      {exclusionWindows.map((ew, i) => (
        <div key={i} style={{ marginBottom: 12 }} data-test-subj={`slosWizardExclusionRow-${i}`}>
          <EuiFlexGroup gutterSize="s" alignItems="flexEnd">
            <EuiFlexItem>
              <EuiFormRow label={I18N.nameLabel}>
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
              <EuiFormRow label={I18N.reasonLabel}>
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
                aria-label={I18N.removeAria(i)}
                size="s"
                data-test-subj={`slosWizardExclusionRemove-${i}`}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="xs" />
          <EuiButtonGroup
            legend={I18N.scheduleLegend}
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
                <EuiFormRow label={I18N.cronExpression}>
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
                <EuiFormRow label={I18N.timezone}>
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
                <EuiFormRow label={I18N.duration}>
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
                <EuiFormRow label={I18N.startIso}>
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
                <EuiFormRow label={I18N.endIso}>
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
        {I18N.addButton}
      </EuiButtonEmpty>
    </EuiAccordion>
  </EuiPanel>
);
