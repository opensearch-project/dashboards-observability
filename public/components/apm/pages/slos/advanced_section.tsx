/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Advanced section. Collapsed by default so the common path stays
 * minimal. Exposes the three knobs that were previously hard-coded:
 *
 *   1. MWMBR burn-rate tiers — short/long windows, multiplier, severity.
 *   2. Budget-warning thresholds — fraction remaining + severity.
 *   3. Supplemental alarm toggles — sliHealth, attainmentBreach, noData,
 *      resolved. budgetWarning is covered by the thresholds editor above.
 *
 * Maya's UX rationale: progressive disclosure. Defaults match the hardcoded
 * P0 values (google-30d.yaml burn rates, 50%/20% budget warnings, alarms
 * off-by-default except budgetWarning). Users who don't open the accordion
 * get exactly what the wizard produced before.
 */

import React, { useMemo } from 'react';
import {
  EuiAccordion,
  EuiButton,
  EuiButtonEmpty,
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
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import type { BudgetWarningThreshold, BurnRateConfig } from '../../../../../common/slo/slo_types';
import { MWMBR_MAX_TIERS } from '../../../../../common/slo/slo_promql_generator';
import type { Action, FormState, ToggleableAlarm } from './wizard_state';
import { BURN_RATE_PRESETS, isPresetApplied } from './burn_rate_presets';

export interface AdvancedSectionProps {
  burnRates: BurnRateConfig[];
  budgetWarnings: BudgetWarningThreshold[];
  alarms: FormState['alarms'];
  errors: Record<string, string>;
  dispatch: React.Dispatch<Action>;
}

const SEVERITY_OPTIONS = [
  {
    value: 'critical',
    text: i18n.translate('observability.apm.slo.wizard.advanced.severity.critical', {
      defaultMessage: 'critical',
    }),
  },
  {
    value: 'warning',
    text: i18n.translate('observability.apm.slo.wizard.advanced.severity.warning', {
      defaultMessage: 'warning',
    }),
  },
  {
    value: 'info',
    text: i18n.translate('observability.apm.slo.wizard.advanced.severity.info', {
      defaultMessage: 'info',
    }),
  },
];

export const AdvancedSection: React.FC<AdvancedSectionProps> = ({
  burnRates,
  budgetWarnings,
  alarms,
  errors,
  dispatch,
}) => (
  <EuiPanel>
    <EuiAccordion
      id="slosWizardAdvanced"
      buttonContent={i18n.translate('observability.apm.slo.wizard.advanced.accordionLabel', {
        defaultMessage: 'Advanced — burn rates, budget warnings, supplemental alarms',
      })}
      paddingSize="s"
      data-test-subj="slosWizardAdvancedToggle"
    >
      <BurnRatesEditor burnRates={burnRates} errors={errors} dispatch={dispatch} />
      <EuiSpacer size="m" />
      <BudgetWarningsEditor budgetWarnings={budgetWarnings} errors={errors} dispatch={dispatch} />
      <EuiSpacer size="m" />
      <AlarmsEditor alarms={alarms} dispatch={dispatch} />
    </EuiAccordion>
  </EuiPanel>
);

// ---- Burn rates --------------------------------------------------------

const BurnRatesEditor: React.FC<{
  burnRates: BurnRateConfig[];
  errors: Record<string, string>;
  dispatch: React.Dispatch<Action>;
}> = ({ burnRates, errors, dispatch }) => {
  const activePresetId = useMemo(
    () => BURN_RATE_PRESETS.find((p) => isPresetApplied(p, burnRates))?.id ?? null,
    [burnRates]
  );
  return (
    <div data-test-subj="slosWizardBurnrates">
      <EuiText size="s">
        <h5>
          {i18n.translate('observability.apm.slo.wizard.advanced.burnRates.heading', {
            defaultMessage: 'Burn-rate tiers (MWMBR)',
          })}
        </h5>
      </EuiText>
      <EuiText size="xs" color="subdued">
        {i18n.translate('observability.apm.slo.wizard.advanced.burnRates.description', {
          defaultMessage:
            'Pick a preset, or edit the table below for a custom configuration. Presets overwrite the existing tiers.',
        })}
      </EuiText>
      <EuiSpacer size="xs" />
      <EuiFlexGroup gutterSize="s" responsive={false} wrap>
        {BURN_RATE_PRESETS.map((preset) => (
          <EuiFlexItem grow={false} key={preset.id}>
            <EuiToolTip content={preset.summary}>
              <EuiButton
                size="s"
                fill={activePresetId === preset.id}
                onClick={() => dispatch({ kind: 'applyBurnRatePreset', preset: preset.id })}
                data-test-subj={`slosBurnRatePreset-${preset.id}`}
              >
                {preset.label}
              </EuiButton>
            </EuiToolTip>
          </EuiFlexItem>
        ))}
        {activePresetId === null && (
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued" data-test-subj="slosBurnRatePresetCustom">
              {i18n.translate('observability.apm.slo.wizard.advanced.burnRates.customLabel', {
                defaultMessage: 'Custom configuration',
              })}
            </EuiText>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      {burnRates.map((tier, i) => {
        const prefix = `spec.alerting.burnRates[${i}]`;
        return (
          <EuiFlexGroup
            // Stable per-row key — severity is the natural discriminator;
            // fall back to index for the brief moment it's unset.
            key={tier.severity ? `${tier.severity}:${i}` : `idx:${i}`}
            gutterSize="s"
            alignItems="flexEnd"
            style={{ marginBottom: 6 }}
            data-test-subj={`slosWizardBurnrateRow-${i}`}
            wrap
          >
            <EuiFlexItem>
              <EuiFormRow
                label={i18n.translate(
                  'observability.apm.slo.wizard.advanced.burnRates.shortWindow',
                  { defaultMessage: 'Short window' }
                )}
                isInvalid={!!errors[`${prefix}.shortWindow`]}
                error={errors[`${prefix}.shortWindow`]}
              >
                <EuiFieldText
                  value={tier.shortWindow}
                  onChange={(e) =>
                    dispatch({
                      kind: 'setBurnRateField',
                      index: i,
                      field: 'shortWindow',
                      value: e.target.value,
                    })
                  }
                  compressed
                  data-test-subj={`slosWizardBurnrateShort-${i}`}
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiFormRow
                label={i18n.translate(
                  'observability.apm.slo.wizard.advanced.burnRates.longWindow',
                  { defaultMessage: 'Long window' }
                )}
                isInvalid={!!errors[`${prefix}.longWindow`]}
                error={errors[`${prefix}.longWindow`]}
              >
                <EuiFieldText
                  value={tier.longWindow}
                  onChange={(e) =>
                    dispatch({
                      kind: 'setBurnRateField',
                      index: i,
                      field: 'longWindow',
                      value: e.target.value,
                    })
                  }
                  compressed
                  data-test-subj={`slosWizardBurnrateLong-${i}`}
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiFormRow
                label={i18n.translate(
                  'observability.apm.slo.wizard.advanced.burnRates.multiplier',
                  { defaultMessage: 'Multiplier' }
                )}
                isInvalid={!!errors[`${prefix}.burnRateMultiplier`]}
                error={errors[`${prefix}.burnRateMultiplier`]}
              >
                <EuiFieldNumber
                  value={tier.burnRateMultiplier}
                  step={0.1}
                  min={0.001}
                  onChange={(e) =>
                    dispatch({
                      kind: 'setBurnRateField',
                      index: i,
                      field: 'burnRateMultiplier',
                      value: Number(e.target.value),
                    })
                  }
                  compressed
                  data-test-subj={`slosWizardBurnrateMultiplier-${i}`}
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiFormRow
                label={i18n.translate(
                  'observability.apm.slo.wizard.advanced.burnRates.forDuration',
                  { defaultMessage: 'For' }
                )}
              >
                <EuiFieldText
                  value={tier.forDuration}
                  onChange={(e) =>
                    dispatch({
                      kind: 'setBurnRateField',
                      index: i,
                      field: 'forDuration',
                      value: e.target.value,
                    })
                  }
                  compressed
                  data-test-subj={`slosWizardBurnrateFor-${i}`}
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiFormRow
                label={i18n.translate('observability.apm.slo.wizard.advanced.burnRates.severity', {
                  defaultMessage: 'Severity',
                })}
              >
                <EuiSelect
                  value={tier.severity}
                  onChange={(e) =>
                    dispatch({
                      kind: 'setBurnRateField',
                      index: i,
                      field: 'severity',
                      value: e.target.value,
                    })
                  }
                  options={SEVERITY_OPTIONS}
                  compressed
                  data-test-subj={`slosWizardBurnrateSeverity-${i}`}
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiCheckbox
                id={`slosWizardBurnrateAlarm-${i}`}
                label={i18n.translate(
                  'observability.apm.slo.wizard.advanced.burnRates.alarmCheckbox',
                  { defaultMessage: 'Alarm' }
                )}
                checked={tier.createAlarm}
                onChange={(e) =>
                  dispatch({
                    kind: 'setBurnRateField',
                    index: i,
                    field: 'createAlarm',
                    value: e.target.checked,
                  })
                }
                data-test-subj={`slosWizardBurnrateAlarm-${i}`}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                color="danger"
                onClick={() => dispatch({ kind: 'removeBurnRate', index: i })}
                iconType="trash"
                aria-label={i18n.translate(
                  'observability.apm.slo.wizard.advanced.burnRates.removeAriaLabel',
                  {
                    defaultMessage: 'Remove burn-rate tier {index}',
                    values: { index: i },
                  }
                )}
                size="s"
                data-test-subj={`slosWizardBurnrateRemove-${i}`}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        );
      })}
      <EuiButtonEmpty
        iconType="plusInCircle"
        size="s"
        isDisabled={burnRates.length >= MWMBR_MAX_TIERS}
        onClick={() => dispatch({ kind: 'addBurnRate' })}
        data-test-subj="slosWizardBurnrateAdd"
      >
        {burnRates.length >= MWMBR_MAX_TIERS
          ? i18n.translate('observability.apm.slo.wizard.advanced.burnRates.atCap', {
              defaultMessage: 'At cap ({max} tiers)',
              values: { max: MWMBR_MAX_TIERS },
            })
          : i18n.translate('observability.apm.slo.wizard.advanced.burnRates.addButton', {
              defaultMessage: 'Add burn-rate tier',
            })}
      </EuiButtonEmpty>
    </div>
  );
};

// ---- Budget warnings ---------------------------------------------------

const BudgetWarningsEditor: React.FC<{
  budgetWarnings: BudgetWarningThreshold[];
  errors: Record<string, string>;
  dispatch: React.Dispatch<Action>;
}> = ({ budgetWarnings, errors, dispatch }) => (
  <div data-test-subj="slosWizardBudgetWarnings">
    <EuiText size="s">
      <h5>
        {i18n.translate('observability.apm.slo.wizard.advanced.budgetWarnings.heading', {
          defaultMessage: 'Budget-warning thresholds',
        })}
      </h5>
    </EuiText>
    <EuiText size="xs" color="subdued">
      {i18n.translate('observability.apm.slo.wizard.advanced.budgetWarnings.descriptionPrefix', {
        defaultMessage: 'Fires when the remaining error budget drops below ',
      })}
      <code>threshold</code>
      {i18n.translate('observability.apm.slo.wizard.advanced.budgetWarnings.descriptionSuffix', {
        defaultMessage: '. Values are fractions of the total budget.',
      })}
    </EuiText>
    <EuiSpacer size="xs" />
    {budgetWarnings.map((bw, i) => {
      const prefix = `spec.budgetWarningThresholds[${i}]`;
      return (
        <EuiFlexGroup
          // Severity is the natural id; tag with index to disambiguate two
          // rows that happen to share the same severity while editing.
          key={bw.severity ? `${bw.severity}:${i}` : `idx:${i}`}
          gutterSize="s"
          alignItems="flexEnd"
          style={{ marginBottom: 6 }}
          data-test-subj={`slosWizardBudgetWarningRow-${i}`}
        >
          <EuiFlexItem>
            <EuiFormRow
              label={i18n.translate(
                'observability.apm.slo.wizard.advanced.budgetWarnings.thresholdLabel',
                { defaultMessage: 'Threshold (fraction remaining)' }
              )}
              isInvalid={!!errors[`${prefix}.threshold`]}
              error={errors[`${prefix}.threshold`]}
            >
              <EuiFieldNumber
                value={bw.threshold}
                step={0.05}
                min={0.01}
                max={0.99}
                onChange={(e) =>
                  dispatch({
                    kind: 'setBudgetWarningField',
                    index: i,
                    field: 'threshold',
                    value: Number(e.target.value),
                  })
                }
                compressed
                data-test-subj={`slosWizardBudgetWarningThreshold-${i}`}
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFormRow
              label={i18n.translate(
                'observability.apm.slo.wizard.advanced.budgetWarnings.severityLabel',
                { defaultMessage: 'Severity' }
              )}
            >
              <EuiSelect
                value={bw.severity}
                onChange={(e) =>
                  dispatch({
                    kind: 'setBudgetWarningField',
                    index: i,
                    field: 'severity',
                    value: e.target.value,
                  })
                }
                options={SEVERITY_OPTIONS}
                compressed
                data-test-subj={`slosWizardBudgetWarningSeverity-${i}`}
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              color="danger"
              onClick={() => dispatch({ kind: 'removeBudgetWarning', index: i })}
              iconType="trash"
              aria-label={i18n.translate(
                'observability.apm.slo.wizard.advanced.budgetWarnings.removeAriaLabel',
                {
                  defaultMessage: 'Remove budget warning {index}',
                  values: { index: i },
                }
              )}
              size="s"
              data-test-subj={`slosWizardBudgetWarningRemove-${i}`}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      );
    })}
    <EuiButtonEmpty
      iconType="plusInCircle"
      size="s"
      onClick={() => dispatch({ kind: 'addBudgetWarning' })}
      data-test-subj="slosWizardBudgetWarningAdd"
    >
      {i18n.translate('observability.apm.slo.wizard.advanced.budgetWarnings.addButton', {
        defaultMessage: 'Add budget-warning threshold',
      })}
    </EuiButtonEmpty>
  </div>
);

// ---- Alarms ------------------------------------------------------------

interface AlarmToggle {
  id: ToggleableAlarm;
  label: string;
  caption: string;
}

const ALARM_TOGGLES: AlarmToggle[] = [
  {
    id: 'sliHealth',
    label: i18n.translate('observability.apm.slo.wizard.advanced.alarms.sliHealthLabel', {
      defaultMessage: 'SLI health',
    }),
    caption: i18n.translate('observability.apm.slo.wizard.advanced.alarms.sliHealthCaption', {
      defaultMessage: 'Overlaps the page-quick tier; default OFF to avoid duplicate pages.',
    }),
  },
  {
    id: 'attainmentBreach',
    label: i18n.translate('observability.apm.slo.wizard.advanced.alarms.attainmentBreachLabel', {
      defaultMessage: 'Attainment breach',
    }),
    caption: i18n.translate(
      'observability.apm.slo.wizard.advanced.alarms.attainmentBreachCaption',
      {
        defaultMessage:
          'Fires when attainment falls below the objective target for the whole window.',
      }
    ),
  },
  {
    id: 'budgetWarning',
    label: i18n.translate('observability.apm.slo.wizard.advanced.alarms.budgetWarningLabel', {
      defaultMessage: 'Budget-warning alerts',
    }),
    caption: i18n.translate('observability.apm.slo.wizard.advanced.alarms.budgetWarningCaption', {
      defaultMessage: 'Emits one alert per (objective × threshold) defined above.',
    }),
  },
  {
    id: 'resolved',
    label: i18n.translate('observability.apm.slo.wizard.advanced.alarms.resolvedLabel', {
      defaultMessage: 'Resolved notifications',
    }),
    caption: i18n.translate('observability.apm.slo.wizard.advanced.alarms.resolvedCaption', {
      defaultMessage: 'Recovery notification when any firing SLO alert clears.',
    }),
  },
];

const AlarmsEditor: React.FC<{
  alarms: FormState['alarms'];
  dispatch: React.Dispatch<Action>;
}> = ({ alarms, dispatch }) => (
  <div data-test-subj="slosWizardSupplementalAlarms">
    <EuiText size="s">
      <h5>
        {i18n.translate('observability.apm.slo.wizard.advanced.alarms.heading', {
          defaultMessage: 'Supplemental alarms',
        })}
      </h5>
    </EuiText>
    <EuiSpacer size="xs" />
    {ALARM_TOGGLES.map((a) => (
      <div key={a.id} style={{ marginBottom: 8 }}>
        <EuiCheckbox
          id={`slosWizardAlarm-${a.id}`}
          label={a.label}
          checked={alarms[a.id].enabled}
          onChange={(e) =>
            dispatch({ kind: 'setAlarmToggle', alarm: a.id, enabled: e.target.checked })
          }
          data-test-subj={`slosWizardAlarm-${a.id}`}
        />
        <EuiText size="xs" color="subdued">
          {a.caption}
        </EuiText>
      </div>
    ))}
    <EuiFlexGroup gutterSize="s" alignItems="center">
      <EuiFlexItem grow={false}>
        <EuiCheckbox
          id="slosWizardAlarmNoData"
          label={i18n.translate('observability.apm.slo.wizard.advanced.alarms.noDataLabel', {
            defaultMessage: 'No-data alert',
          })}
          checked={alarms.noData.enabled}
          onChange={(e) =>
            dispatch({ kind: 'setAlarmToggle', alarm: 'noData', enabled: e.target.checked })
          }
          data-test-subj="slosWizardAlarmNoData"
        />
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiFormRow
          label={i18n.translate('observability.apm.slo.wizard.advanced.alarms.noDataFor', {
            defaultMessage: 'For',
          })}
        >
          <EuiFieldText
            value={alarms.noData.forDuration}
            onChange={(e) => dispatch({ kind: 'setNoDataDuration', forDuration: e.target.value })}
            disabled={!alarms.noData.enabled}
            compressed
            data-test-subj="slosWizardAlarmNoDataDuration"
          />
        </EuiFormRow>
      </EuiFlexItem>
    </EuiFlexGroup>
  </div>
);
