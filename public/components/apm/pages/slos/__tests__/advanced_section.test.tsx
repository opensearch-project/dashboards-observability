/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { AdvancedSection } from '../advanced_section';
import type {
  BudgetWarningThreshold,
  BurnRateConfig,
} from '../../../../../../common/slo/slo_types';
import type { FormState } from '../wizard_state';

function defaultBurnRates(): BurnRateConfig[] {
  return [
    {
      shortWindow: '5m',
      longWindow: '1h',
      burnRateMultiplier: 14,
      severity: 'critical',
      createAlarm: true,
      forDuration: '2m',
    },
  ];
}

function defaultBudgetWarnings(): BudgetWarningThreshold[] {
  return [
    { threshold: 0.5, severity: 'warning' },
    { threshold: 0.2, severity: 'critical' },
  ];
}

function defaultAlarms(): FormState['alarms'] {
  return {
    sliHealth: { enabled: false },
    attainmentBreach: { enabled: false },
    budgetWarning: { enabled: true },
    noData: { enabled: false, forDuration: '10m' },
    resolved: { enabled: false },
  };
}

function renderAdvanced(
  overrides: {
    burnRates?: BurnRateConfig[];
    budgetWarnings?: BudgetWarningThreshold[];
    alarms?: FormState['alarms'];
    errors?: Record<string, string>;
  } = {}
) {
  const dispatch = jest.fn();
  render(
    <AdvancedSection
      burnRates={overrides.burnRates ?? defaultBurnRates()}
      budgetWarnings={overrides.budgetWarnings ?? defaultBudgetWarnings()}
      alarms={overrides.alarms ?? defaultAlarms()}
      errors={overrides.errors ?? {}}
      dispatch={dispatch}
    />
  );
  return { dispatch };
}

describe('AdvancedSection', () => {
  it('renders the advanced toggle button', () => {
    renderAdvanced();
    expect(screen.getByTestId('slosWizardAdvancedToggle')).toBeInTheDocument();
  });

  it('renders one row per burn-rate tier', () => {
    renderAdvanced({
      burnRates: [
        ...defaultBurnRates(),
        {
          shortWindow: '30m',
          longWindow: '6h',
          burnRateMultiplier: 6,
          severity: 'warning',
          createAlarm: true,
          forDuration: '15m',
        },
      ],
    });
    expect(screen.getByTestId('slosWizardBurnrateRow-0')).toBeInTheDocument();
    expect(screen.getByTestId('slosWizardBurnrateRow-1')).toBeInTheDocument();
  });

  it('dispatches setBurnRateField on the short-window field', () => {
    const { dispatch } = renderAdvanced();
    fireEvent.change(screen.getByTestId('slosWizardBurnrateShort-0'), {
      target: { value: '10m' },
    });
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'setBurnRateField',
      index: 0,
      field: 'shortWindow',
      value: '10m',
    });
  });

  it('dispatches addBurnRate when the add button is clicked', () => {
    const { dispatch } = renderAdvanced();
    fireEvent.click(screen.getByTestId('slosWizardBurnrateAdd'));
    expect(dispatch).toHaveBeenCalledWith({ kind: 'addBurnRate' });
  });

  it('disables the add button when burnRates is at MWMBR_MAX_TIERS', () => {
    const tiers: BurnRateConfig[] = Array.from({ length: 10 }, () => ({
      shortWindow: '5m',
      longWindow: '1h',
      burnRateMultiplier: 14,
      severity: 'critical',
      createAlarm: true,
      forDuration: '2m',
    }));
    renderAdvanced({ burnRates: tiers });
    const add = screen.getByTestId('slosWizardBurnrateAdd');
    expect(add).toBeDisabled();
    expect(add).toHaveTextContent(/At cap/);
  });

  it('dispatches removeBurnRate when the trash icon is clicked', () => {
    const { dispatch } = renderAdvanced();
    fireEvent.click(screen.getByTestId('slosWizardBurnrateRemove-0'));
    expect(dispatch).toHaveBeenCalledWith({ kind: 'removeBurnRate', index: 0 });
  });

  it('dispatches setBudgetWarningField when threshold changes', () => {
    const { dispatch } = renderAdvanced();
    fireEvent.change(screen.getByTestId('slosWizardBudgetWarningThreshold-0'), {
      target: { value: '0.3' },
    });
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'setBudgetWarningField',
      index: 0,
      field: 'threshold',
      value: 0.3,
    });
  });

  it('dispatches addBudgetWarning on the add button', () => {
    const { dispatch } = renderAdvanced();
    fireEvent.click(screen.getByTestId('slosWizardBudgetWarningAdd'));
    expect(dispatch).toHaveBeenCalledWith({ kind: 'addBudgetWarning' });
  });

  it('renders supplemental alarm toggles in the documented default state', () => {
    renderAdvanced();
    // budgetWarning defaults to enabled per the comment in the source.
    const checkbox = screen.getByTestId('slosWizardAlarm-budgetWarning') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    const sliHealth = screen.getByTestId('slosWizardAlarm-sliHealth') as HTMLInputElement;
    expect(sliHealth.checked).toBe(false);
  });

  it('dispatches setAlarmToggle when an alarm checkbox flips', () => {
    const { dispatch } = renderAdvanced();
    fireEvent.click(screen.getByTestId('slosWizardAlarm-sliHealth'));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'setAlarmToggle', alarm: 'sliHealth' })
    );
  });

  it('disables the noData duration field when noData alarm is off, dispatches when toggled on', () => {
    const { dispatch } = renderAdvanced();
    const duration = screen.getByTestId('slosWizardAlarmNoDataDuration');
    expect(duration).toBeDisabled();
    fireEvent.click(screen.getByTestId('slosWizardAlarmNoData'));
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'setAlarmToggle',
      alarm: 'noData',
      enabled: true,
    });
  });
});
