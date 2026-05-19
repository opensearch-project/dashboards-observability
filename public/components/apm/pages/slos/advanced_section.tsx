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
 *   3. Supplemental alarm toggles — sliHealth, attainmentBreach,
 *      budgetWarning, noData, resolved. The budgetWarning toggle gates
 *      *alert emission*; the thresholds editor above edits the threshold
 *      *values*. Both surfaces are needed.
 *
 * Progressive disclosure: defaults match the hardcoded values
 * (google-30d.yaml burn rates, 50%/20% budget warnings, alarms off-by-default
 * except budgetWarning). Users who don't open the accordion get exactly what
 * the wizard produced before this PR.
 */

import React, { useMemo } from 'react';
import { i18n } from '@osd/i18n';
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
import type { BudgetWarningThreshold, BurnRateConfig } from '../../../../../common/slo/slo_types';
import type { Action, FormState, ToggleableAlarm } from './wizard_state';
import { BURN_RATE_PRESETS, isPresetApplied } from './burn_rate_presets';

export interface AdvancedSectionProps {
  burnRates: BurnRateConfig[];
  budgetWarnings: BudgetWarningThreshold[];
  alarms: FormState['alarms'];
  errors: Record<string, string>;
  dispatch: React.Dispatch<Action>;
}

const I18N = {
  severityCritical: i18n.translate('observability.slo.advanced.severityCritical', {
    defaultMessage: 'critical',
  }),
  severityWarning: i18n.translate('observability.slo.advanced.severityWarning', {
    defaultMessage: 'warning',
  }),
  severityInfo: i18n.translate('observability.slo.advanced.severityInfo', {
    defaultMessage: 'info',
  }),
  accordionLabel: i18n.translate('observability.slo.advanced.accordionLabel', {
    defaultMessage: 'Advanced — burn rates, budget warnings, supplemental alarms',
  }),
  burnRatesHeading: i18n.translate('observability.slo.advanced.burnRatesHeading', {
    defaultMessage: 'Burn-rate tiers (MWMBR)',
  }),
  burnRatesDescription: i18n.translate('observability.slo.advanced.burnRatesDescription', {
    defaultMessage:
      'Pick a preset, or edit the table below for a custom configuration. Presets overwrite the existing tiers.',
  }),
  customConfiguration: i18n.translate('observability.slo.advanced.customConfiguration', {
    defaultMessage: 'Custom configuration',
  }),
  shortWindow: i18n.translate('observability.slo.advanced.shortWindow', {
    defaultMessage: 'Short window',
  }),
  longWindow: i18n.translate('observability.slo.advanced.longWindow', {
    defaultMessage: 'Long window',
  }),
  multiplier: i18n.translate('observability.slo.advanced.multiplier', {
    defaultMessage: 'Multiplier',
  }),
  forLabel: i18n.translate('observability.slo.advanced.forLabel', {
    defaultMessage: 'For',
  }),
  severity: i18n.translate('observability.slo.advanced.severity', {
    defaultMessage: 'Severity',
  }),
  alarm: i18n.translate('observability.slo.advanced.alarm', {
    defaultMessage: 'Alarm',
  }),
  removeBurnRateAria: (index: number) =>
    i18n.translate('observability.slo.advanced.removeBurnRateAria', {
      defaultMessage: 'Remove burn-rate tier {index}',
      values: { index },
    }),
  addBurnRate: i18n.translate('observability.slo.advanced.addBurnRate', {
    defaultMessage: 'Add burn-rate tier',
  }),
  budgetWarningsHeading: i18n.translate('observability.slo.advanced.budgetWarningsHeading', {
    defaultMessage: 'Budget-warning thresholds',
  }),
  budgetWarningsDescriptionPrefix: i18n.translate(
    'observability.slo.advanced.budgetWarningsDescriptionPrefix',
    {
      defaultMessage: 'Fires when the remaining error budget drops below',
    }
  ),
  budgetWarningsDescriptionSuffix: i18n.translate(
    'observability.slo.advanced.budgetWarningsDescriptionSuffix',
    {
      defaultMessage: '. Values are fractions of the total budget.',
    }
  ),
  thresholdLabel: i18n.translate('observability.slo.advanced.thresholdLabel', {
    defaultMessage: 'Threshold (fraction remaining)',
  }),
  removeBudgetWarningAria: (index: number) =>
    i18n.translate('observability.slo.advanced.removeBudgetWarningAria', {
      defaultMessage: 'Remove budget warning {index}',
      values: { index },
    }),
  addBudgetWarning: i18n.translate('observability.slo.advanced.addBudgetWarning', {
    defaultMessage: 'Add budget-warning threshold',
  }),
  alarmsHeading: i18n.translate('observability.slo.advanced.alarmsHeading', {
    defaultMessage: 'Supplemental alarms',
  }),
  noDataAlert: i18n.translate('observability.slo.advanced.noDataAlert', {
    defaultMessage: 'No-data alert',
  }),
  alarmSliHealthLabel: i18n.translate('observability.slo.advanced.alarmSliHealthLabel', {
    defaultMessage: 'SLI health',
  }),
  alarmSliHealthCaption: i18n.translate('observability.slo.advanced.alarmSliHealthCaption', {
    defaultMessage: 'Overlaps the page-quick tier; default OFF to avoid duplicate pages.',
  }),
  alarmAttainmentBreachLabel: i18n.translate(
    'observability.slo.advanced.alarmAttainmentBreachLabel',
    {
      defaultMessage: 'Attainment breach',
    }
  ),
  alarmAttainmentBreachCaption: i18n.translate(
    'observability.slo.advanced.alarmAttainmentBreachCaption',
    {
      defaultMessage:
        'Fires when attainment falls below the objective target for the whole window.',
    }
  ),
  alarmBudgetWarningLabel: i18n.translate('observability.slo.advanced.alarmBudgetWarningLabel', {
    defaultMessage: 'Budget-warning alerts',
  }),
  alarmBudgetWarningCaption: i18n.translate(
    'observability.slo.advanced.alarmBudgetWarningCaption',
    {
      defaultMessage: 'Emits one alert per (objective × threshold) defined above.',
    }
  ),
  alarmResolvedLabel: i18n.translate('observability.slo.advanced.alarmResolvedLabel', {
    defaultMessage: 'Resolved notifications',
  }),
  alarmResolvedCaption: i18n.translate('observability.slo.advanced.alarmResolvedCaption', {
    defaultMessage: 'Recovery notification when any firing SLO alert clears.',
  }),
};

const SEVERITY_OPTIONS = [
  { value: 'critical', text: I18N.severityCritical },
  { value: 'warning', text: I18N.severityWarning },
  { value: 'info', text: I18N.severityInfo },
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
      buttonContent={I18N.accordionLabel}
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
        <h5>{I18N.burnRatesHeading}</h5>
      </EuiText>
      <EuiText size="xs" color="subdued">
        {I18N.burnRatesDescription}
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
              {I18N.customConfiguration}
            </EuiText>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      {burnRates.map((tier, i) => {
        const prefix = `spec.alerting.burnRates[${i}]`;
        return (
          <EuiFlexGroup
            key={i}
            gutterSize="s"
            alignItems="flexEnd"
            style={{ marginBottom: 6 }}
            data-test-subj={`slosWizardBurnrateRow-${i}`}
            wrap
          >
            <EuiFlexItem>
              <EuiFormRow
                label={I18N.shortWindow}
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
                label={I18N.longWindow}
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
                label={I18N.multiplier}
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
              <EuiFormRow label={I18N.forLabel}>
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
              <EuiFormRow label={I18N.severity}>
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
                label={I18N.alarm}
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
                aria-label={I18N.removeBurnRateAria(i)}
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
        onClick={() => dispatch({ kind: 'addBurnRate' })}
        data-test-subj="slosWizardBurnrateAdd"
      >
        {I18N.addBurnRate}
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
      <h5>{I18N.budgetWarningsHeading}</h5>
    </EuiText>
    <EuiText size="xs" color="subdued">
      {I18N.budgetWarningsDescriptionPrefix} <code>threshold</code>
      {I18N.budgetWarningsDescriptionSuffix}
    </EuiText>
    <EuiSpacer size="xs" />
    {budgetWarnings.map((bw, i) => {
      const prefix = `spec.budgetWarningThresholds[${i}]`;
      return (
        <EuiFlexGroup
          key={i}
          gutterSize="s"
          alignItems="flexEnd"
          style={{ marginBottom: 6 }}
          data-test-subj={`slosWizardBudgetWarningRow-${i}`}
        >
          <EuiFlexItem>
            <EuiFormRow
              label={I18N.thresholdLabel}
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
            <EuiFormRow label={I18N.severity}>
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
              aria-label={I18N.removeBudgetWarningAria(i)}
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
      {I18N.addBudgetWarning}
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
    label: I18N.alarmSliHealthLabel,
    caption: I18N.alarmSliHealthCaption,
  },
  {
    id: 'attainmentBreach',
    label: I18N.alarmAttainmentBreachLabel,
    caption: I18N.alarmAttainmentBreachCaption,
  },
  {
    id: 'budgetWarning',
    label: I18N.alarmBudgetWarningLabel,
    caption: I18N.alarmBudgetWarningCaption,
  },
  {
    id: 'resolved',
    label: I18N.alarmResolvedLabel,
    caption: I18N.alarmResolvedCaption,
  },
];

const AlarmsEditor: React.FC<{
  alarms: FormState['alarms'];
  dispatch: React.Dispatch<Action>;
}> = ({ alarms, dispatch }) => (
  <div data-test-subj="slosWizardSupplementalAlarms">
    <EuiText size="s">
      <h5>{I18N.alarmsHeading}</h5>
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
          label={I18N.noDataAlert}
          checked={alarms.noData.enabled}
          onChange={(e) =>
            dispatch({ kind: 'setAlarmToggle', alarm: 'noData', enabled: e.target.checked })
          }
          data-test-subj="slosWizardAlarmNoData"
        />
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiFormRow label={I18N.forLabel}>
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
