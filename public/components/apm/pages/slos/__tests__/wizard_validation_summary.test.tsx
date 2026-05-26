/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { WizardValidationSummary } from '../wizard_validation_summary';

describe('WizardValidationSummary', () => {
  it('renders nothing when there are no errors', () => {
    const { container } = render(<WizardValidationSummary errors={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('groups each error under its section label with a clickable link', () => {
    render(
      <WizardValidationSummary
        errors={{
          'spec.name': 'Name is required',
          'spec.alerting.burnRates[0].shortWindow': 'Short window is required',
        }}
      />
    );
    const summary = screen.getByTestId('slosWizardValidationSummary');
    expect(summary).toHaveTextContent('Fix 2 errors');
    expect(summary).toHaveTextContent('Identity: Name is required');
    expect(summary).toHaveTextContent('Advanced: Short window is required');
    expect(screen.getByTestId('slosWizardValidationSummaryItem-spec.name')).toBeInTheDocument();
  });

  it('uses singular copy when there is exactly one error', () => {
    render(<WizardValidationSummary errors={{ 'spec.name': 'Name is required' }} />);
    expect(screen.getByTestId('slosWizardValidationSummary')).toHaveTextContent(
      'Fix 1 error before'
    );
  });
});
