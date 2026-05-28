/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ObjectivesSection } from '../objectives_section';
import type { FormState } from '../wizard_state';
import type { SloTemplate } from '../../../../../../common/slo/slo_templates';

const templateAvailability: SloTemplate = {
  id: 'apm-service-availability',
  name: 'APM service availability',
  description: '',
  icon: 'apmApp',
  category: 'apm',
  sli: { type: 'events', calcMethod: 'count' },
  dimensionHints: { serviceLabel: 'service', operationLabel: 'operation' },
  expectedMetricType: 'counter',
  detectionPattern: null,
};

function makeObjective(overrides: Partial<FormState['objectives'][number]> = {}) {
  return { name: 'page', target: '99.9', latencyThreshold: '', ...overrides };
}

function renderSection({
  target,
  windowDuration,
}: {
  target: string;
  windowDuration: FormState['windowDuration'];
}) {
  return render(
    <ObjectivesSection
      objectives={[makeObjective({ target })]}
      latencyThresholdUnit="seconds"
      windowDuration={windowDuration}
      template={templateAvailability}
      errors={{}}
      dispatch={jest.fn()}
    />
  );
}

describe('ObjectivesSection — allowed-downtime preview', () => {
  it('renders the downtime preview for 99.9% over 28d (40m 19s)', () => {
    renderSection({ target: '99.9', windowDuration: '28d' });
    const preview = screen.getByTestId('slosWizardObjectiveTargetDowntime-0');
    expect(preview.textContent).toMatch(/99\.9% over 28d/);
    expect(preview.textContent).toMatch(/40m 19s of error budget/);
  });

  it('renders the downtime preview for 99.9% over 7d (~10m 5s)', () => {
    renderSection({ target: '99.9', windowDuration: '7d' });
    const preview = screen.getByTestId('slosWizardObjectiveTargetDowntime-0');
    expect(preview.textContent).toMatch(/10m 5s of error budget/);
  });

  it('renders the downtime preview for 99.9% over 30d (43m 12s)', () => {
    renderSection({ target: '99.9', windowDuration: '30d' });
    const preview = screen.getByTestId('slosWizardObjectiveTargetDowntime-0');
    expect(preview.textContent).toMatch(/43m 12s of error budget/);
  });

  it('does not render the preview when the field is empty', () => {
    renderSection({ target: '', windowDuration: '28d' });
    expect(screen.queryByTestId('slosWizardObjectiveTargetDowntime-0')).toBeNull();
  });

  it('does not render the preview when the value does not parse as a number', () => {
    renderSection({ target: 'abc', windowDuration: '28d' });
    expect(screen.queryByTestId('slosWizardObjectiveTargetDowntime-0')).toBeNull();
  });

  it('does not render the preview when the value is out of [0, 100]', () => {
    renderSection({ target: '150', windowDuration: '28d' });
    expect(screen.queryByTestId('slosWizardObjectiveTargetDowntime-0')).toBeNull();
  });
});

describe('ObjectivesSection — high-target callout', () => {
  it('renders the callout at 99.99%', () => {
    renderSection({ target: '99.99', windowDuration: '28d' });
    expect(screen.getByTestId('slosWizardObjectiveTargetHighCallout-0')).toBeInTheDocument();
  });

  it('renders the callout at 99.999%', () => {
    renderSection({ target: '99.999', windowDuration: '28d' });
    expect(screen.getByTestId('slosWizardObjectiveTargetHighCallout-0')).toBeInTheDocument();
  });

  it('does not render the callout at 99.9%', () => {
    renderSection({ target: '99.9', windowDuration: '28d' });
    expect(screen.queryByTestId('slosWizardObjectiveTargetHighCallout-0')).toBeNull();
  });

  it('keeps the ratio-format helpText line visible alongside the downtime preview', () => {
    renderSection({ target: '99.9', windowDuration: '28d' });
    // Ratio-format line is plain text in the form row; scope to the row so we
    // do not accidentally match the downtime line.
    expect(screen.getByText('99.9% = 0.999 decimal')).toBeInTheDocument();
  });

  it('scopes callouts per-row (independent high-target warnings)', () => {
    render(
      <ObjectivesSection
        objectives={[
          makeObjective({ name: 'page', target: '99.9' }),
          makeObjective({ name: 'ticket', target: '99.99' }),
        ]}
        latencyThresholdUnit="seconds"
        windowDuration="28d"
        template={templateAvailability}
        errors={{}}
        dispatch={jest.fn()}
      />
    );
    expect(screen.queryByTestId('slosWizardObjectiveTargetHighCallout-0')).toBeNull();
    expect(screen.getByTestId('slosWizardObjectiveTargetHighCallout-1')).toBeInTheDocument();
  });
});
