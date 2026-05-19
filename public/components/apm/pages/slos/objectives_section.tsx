/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Multi-objective editor. N rows; each row is {name, target%, latency
 * threshold if the template is latency_threshold}. The validator already
 * supports N objectives; the generator emits one rule-set per objective.
 *
 * The target row carries a live preview of the allowed downtime over the
 * selected window — `99.9% over 28d → 40m 20s of error budget` — so the
 * user picks an objective with eyes open. A high-target callout fires above
 * 99.99% (Google's stated cap, citing GCP SLO defaults) so very-tight
 * targets don't get rubber-stamped.
 */

import React from 'react';
import { i18n } from '@osd/i18n';
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
import type { SloTemplate } from '../../../../../common/slo/slo_templates';
import type { Action, FormState } from './wizard_state';

const I18N = {
  heading: i18n.translate('observability.slo.objectives.heading', {
    defaultMessage: 'Objectives',
  }),
  description: i18n.translate('observability.slo.objectives.description', {
    defaultMessage:
      'Each objective produces its own set of recording and alerting rules. Common pattern: a strict page target (p99) plus a looser ticket target (p90).',
  }),
  helpDecimal: i18n.translate('observability.slo.objectives.helpDecimal', {
    defaultMessage: '99.9% = 0.999 decimal',
  }),
  downtimePreview: (target: string, windowDuration: string, downtime: string) =>
    i18n.translate('observability.slo.objectives.downtimePreview', {
      defaultMessage: '{target}% over {windowDuration} → {downtime} of error budget',
      values: { target, windowDuration, downtime },
    }),
  nameLabel: i18n.translate('observability.slo.objectives.nameLabel', {
    defaultMessage: 'Objective name',
  }),
  targetLabel: i18n.translate('observability.slo.objectives.targetLabel', {
    defaultMessage: 'Target (%)',
  }),
  latencyLabel: (unit: string) =>
    i18n.translate('observability.slo.objectives.latencyLabel', {
      defaultMessage: 'Latency ({unit})',
      values: { unit },
    }),
  removeAria: (index: number) =>
    i18n.translate('observability.slo.objectives.removeAria', {
      defaultMessage: 'Remove objective {index}',
      values: { index },
    }),
  highTargetWarning: i18n.translate('observability.slo.objectives.highTargetWarning', {
    defaultMessage:
      'A target above 99.99% leaves almost no error budget. GCP caps SLO targets at 99.9%; consider whether your users can actually distinguish 99.99% from 99.9%.',
  }),
  addButton: i18n.translate('observability.slo.objectives.addButton', {
    defaultMessage: 'Add objective',
  }),
};

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
        <h4>{I18N.heading}</h4>
      </EuiText>
      <EuiText size="s" color="subdued">
        {I18N.description}
      </EuiText>
      <EuiSpacer size="s" />
      {objectives.map((row, i) => {
        const nameError = errors[`spec.objectives[${i}].name`];
        const targetError = errors[`spec.objectives[${i}].target`];
        const latencyError = errors[`spec.objectives[${i}].latencyThreshold`];
        const preview = computePreview(row.target, windowDuration);
        const targetHelpText = (
          <>
            <span>{I18N.helpDecimal}</span>
            {preview && (
              <>
                <br />
                <span
                  style={{ color: '#69707D' }}
                  data-test-subj={`slosWizardObjectiveTargetDowntime-${i}`}
                >
                  {I18N.downtimePreview(row.target, windowDuration, preview.downtime)}
                </span>
              </>
            )}
          </>
        );
        return (
          <React.Fragment key={i}>
            <EuiFlexGroup
              gutterSize="s"
              alignItems="flexEnd"
              style={{ marginBottom: 8 }}
              data-test-subj={`slosWizardObjectiveRow-${i}`}
            >
              <EuiFlexItem>
                <EuiFormRow label={I18N.nameLabel} isInvalid={!!nameError} error={nameError}>
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
                  label={I18N.targetLabel}
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
                    label={I18N.latencyLabel(latencyThresholdUnit)}
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
                  aria-label={I18N.removeAria(i)}
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
                  <EuiText size="s">{I18N.highTargetWarning}</EuiText>
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
        {I18N.addButton}
      </EuiButtonEmpty>
    </EuiPanel>
  );
};
