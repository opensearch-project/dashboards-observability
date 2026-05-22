/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Multi-objective editor. N rows; each row is {name, target%, latency
 * threshold if the template is latency_threshold}. The validator already
 * supports N objectives; the generator emits one rule-set per objective.
 */

import React from 'react';
import {
  EuiButtonEmpty,
  EuiCallOut,
  EuiFieldNumber,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import type { SloTemplate } from '../../../../../common/slo/slo_templates';
import type { Action, FormState } from './wizard_state';

export interface ObjectivesSectionProps {
  objectives: FormState['objectives'];
  latencyThresholdUnit: FormState['latencyThresholdUnit'];
  windowDuration: FormState['windowDuration'];
  template: SloTemplate;
  errors: Record<string, string>;
  dispatch: React.Dispatch<Action>;
}

const HIGH_TARGET_THRESHOLD = 99.99;

function windowDurationToMs(w: FormState['windowDuration']): number {
  switch (w) {
    case '7d':
      return 7 * 86_400_000;
    case '14d':
      return 14 * 86_400_000;
    case '28d':
      return 28 * 86_400_000;
    case '30d':
      return 30 * 86_400_000;
  }
}

// Two-largest-non-zero-units formatter: "1h 23m", "4m 19s", "12s". Seconds
// precision matters here — at 99.99% over 28d the budget is ~4 minutes, and
// chopping everything smaller than a minute would collapse the preview for
// exactly the targets most in need of sober scrutiny. Rounds the ms→sec
// boundary (rather than flooring) to absorb the IEEE-754 error from
// `1 - Number('99.9')/100`, which otherwise ticks "43m 12s" down to "43m 11s"
// on the 30d window.
export function formatAllowedDowntime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const totalSec = Math.round(ms / 1000);
  const d = Math.floor(totalSec / 86_400);
  const h = Math.floor((totalSec % 86_400) / 3_600);
  const m = Math.floor((totalSec % 3_600) / 60);
  const s = totalSec % 60;
  const parts: Array<[number, string]> = [
    [d, 'd'],
    [h, 'h'],
    [m, 'm'],
    [s, 's'],
  ];
  const nonzero = parts.filter(([v]) => v > 0).slice(0, 2);
  if (nonzero.length === 0) return '0s';
  return nonzero.map(([v, u]) => `${v}${u}`).join(' ');
}

function computePreview(
  rawTarget: string,
  windowDuration: FormState['windowDuration']
): { downtime: string; highTarget: boolean } | null {
  if (rawTarget.trim() === '') return null;
  const parsed = Number(rawTarget);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  const windowMs = windowDurationToMs(windowDuration);
  const allowedMs = (1 - parsed / 100) * windowMs;
  return {
    downtime: formatAllowedDowntime(allowedMs),
    highTarget: parsed >= HIGH_TARGET_THRESHOLD,
  };
}

export const ObjectivesSection: React.FC<ObjectivesSectionProps> = ({
  objectives,
  latencyThresholdUnit,
  windowDuration,
  template,
  errors,
  dispatch,
}) => {
  const showLatency = template.sli.type === 'latency_threshold';
  return (
    <EuiPanel data-test-subj="slosWizardObjectives">
      <EuiText size="m">
        <h4>
          {i18n.translate('observability.apm.slo.wizard.objectives.heading', {
            defaultMessage: 'Objectives',
          })}
        </h4>
      </EuiText>
      <EuiText size="s" color="subdued">
        {i18n.translate('observability.apm.slo.wizard.objectives.description', {
          defaultMessage:
            'Each objective produces its own set of recording and alerting rules. Common pattern: a strict page target (p99) plus a looser ticket target (p90).',
        })}
      </EuiText>
      <EuiSpacer size="s" />
      {objectives.map((row, i) => {
        const nameError = errors[`spec.objectives[${i}].name`];
        const targetError = errors[`spec.objectives[${i}].target`];
        const latencyError = errors[`spec.objectives[${i}].latencyThreshold`];
        const preview = computePreview(row.target, windowDuration);
        const targetHelpText = (
          <>
            <span>
              {i18n.translate('observability.apm.slo.wizard.objectives.targetHelpHint', {
                defaultMessage: '99.9% = 0.999 decimal',
              })}
            </span>
            {preview && (
              <>
                <br />
                <span
                  style={{ color: '#69707D' }}
                  data-test-subj={`slosWizardObjectiveTargetDowntime-${i}`}
                >
                  {i18n.translate('observability.apm.slo.wizard.objectives.targetDowntimePreview', {
                    defaultMessage: '{target}% over {windowDuration} → {downtime} of error budget',
                    values: {
                      target: row.target,
                      windowDuration,
                      downtime: preview.downtime,
                    },
                  })}
                </span>
              </>
            )}
          </>
        );
        // Stable per-row key so removing a middle objective doesn't cause focus
        // jump / value bleed in the still-mounted siblings. `name` is the SLO's
        // own stable id; fall back to index for the brief moment a freshly-added
        // row hasn't been named yet.
        const rowKey = row.name ? `name:${row.name}` : `idx:${i}`;
        return (
          <React.Fragment key={rowKey}>
            <EuiFlexGroup
              gutterSize="s"
              alignItems="flexEnd"
              style={{ marginBottom: 8 }}
              data-test-subj={`slosWizardObjectiveRow-${i}`}
            >
              <EuiFlexItem>
                <EuiFormRow
                  label={i18n.translate('observability.apm.slo.wizard.objectives.nameLabel', {
                    defaultMessage: 'Objective name',
                  })}
                  isInvalid={!!nameError}
                  error={nameError}
                >
                  <EuiFieldText
                    value={row.name}
                    onChange={(e) =>
                      dispatch({
                        kind: 'setObjectiveField',
                        index: i,
                        field: 'name',
                        value: e.target.value,
                      })
                    }
                    compressed
                    data-test-subj={`slosWizardObjectiveName-${i}`}
                  />
                </EuiFormRow>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiFormRow
                  label={i18n.translate('observability.apm.slo.wizard.objectives.targetLabel', {
                    defaultMessage: 'Target (%)',
                  })}
                  isInvalid={!!targetError}
                  error={targetError}
                  helpText={targetHelpText}
                >
                  <EuiFieldNumber
                    value={row.target}
                    min={50}
                    max={99.999}
                    step={0.001}
                    onChange={(e) =>
                      dispatch({
                        kind: 'setObjectiveField',
                        index: i,
                        field: 'target',
                        value: e.target.value,
                      })
                    }
                    compressed
                    data-test-subj={`slosWizardObjectiveTarget-${i}`}
                  />
                </EuiFormRow>
              </EuiFlexItem>
              {showLatency && (
                <EuiFlexItem>
                  <EuiFormRow
                    label={i18n.translate('observability.apm.slo.wizard.objectives.latencyLabel', {
                      defaultMessage: 'Latency ({unit})',
                      values: { unit: latencyThresholdUnit },
                    })}
                    isInvalid={!!latencyError}
                    error={latencyError}
                  >
                    <EuiFieldNumber
                      value={row.latencyThreshold}
                      min={0}
                      step={0.01}
                      onChange={(e) =>
                        dispatch({
                          kind: 'setObjectiveField',
                          index: i,
                          field: 'latencyThreshold',
                          value: e.target.value,
                        })
                      }
                      compressed
                      data-test-subj={`slosWizardObjectiveLatency-${i}`}
                    />
                  </EuiFormRow>
                </EuiFlexItem>
              )}
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  color="danger"
                  onClick={() => dispatch({ kind: 'removeObjective', index: i })}
                  disabled={objectives.length <= 1}
                  iconType="trash"
                  aria-label={i18n.translate(
                    'observability.apm.slo.wizard.objectives.removeAriaLabel',
                    {
                      defaultMessage: 'Remove objective {index}',
                      values: { index: i },
                    }
                  )}
                  size="s"
                  data-test-subj={`slosWizardObjectiveRemove-${i}`}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
            {preview?.highTarget && (
              <>
                <EuiCallOut
                  size="s"
                  color="warning"
                  iconType="alert"
                  data-test-subj={`slosWizardObjectiveTargetHighCallout-${i}`}
                >
                  <EuiText size="s">
                    {i18n.translate('observability.apm.slo.wizard.objectives.highTargetWarning', {
                      defaultMessage:
                        'A target above 99.99% leaves almost no error budget — about 4 minutes per 28 days. Consider whether your users can actually distinguish 99.99% from 99.9%, and whether your monitoring stack can measure that level of reliability without false positives.',
                    })}
                  </EuiText>
                </EuiCallOut>
                <EuiSpacer size="s" />
              </>
            )}
          </React.Fragment>
        );
      })}
      <EuiButtonEmpty
        iconType="plusInCircle"
        size="s"
        onClick={() => dispatch({ kind: 'addObjective' })}
        data-test-subj="slosWizardObjectiveAdd"
      >
        {i18n.translate('observability.apm.slo.wizard.objectives.addButton', {
          defaultMessage: 'Add objective',
        })}
      </EuiButtonEmpty>
    </EuiPanel>
  );
};
