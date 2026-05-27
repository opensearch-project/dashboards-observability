/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { WizardNav } from '../wizard_nav';

describe('WizardNav', () => {
  it('renders one nav entry per visible section in declared order', () => {
    render(
      <WizardNav
        errors={{}}
        visibleSectionIds={[
          'identity',
          'window',
          'owner',
          'sli',
          'objectives',
          'advanced',
          'exclusions',
          'labels',
          'rulesPreview',
        ]}
      />
    );
    expect(screen.getByTestId('slosWizardNav')).toBeInTheDocument();
    expect(screen.getByTestId('slosWizardNavItem-identity')).toBeInTheDocument();
    expect(screen.getByTestId('slosWizardNavItem-owner')).toBeInTheDocument();
    expect(screen.getByTestId('slosWizardNavItem-rulesPreview')).toBeInTheDocument();
    expect(screen.queryByTestId('slosWizardNavItem-promql')).toBeNull();
  });

  it('shows the PromQL entry only when the section is visible', () => {
    render(
      <WizardNav
        errors={{}}
        visibleSectionIds={[
          'identity',
          'window',
          'owner',
          'sli',
          'promql',
          'objectives',
          'advanced',
          'exclusions',
          'labels',
          'rulesPreview',
        ]}
      />
    );
    expect(screen.getByTestId('slosWizardNavItem-promql')).toBeInTheDocument();
  });

  it('renders the danger icon next to sections that carry errors', () => {
    render(
      <WizardNav
        errors={{
          'spec.name': 'Name is required',
          'spec.alerting.burnRates[0].shortWindow': 'required',
        }}
        visibleSectionIds={[
          'identity',
          'window',
          'owner',
          'sli',
          'objectives',
          'advanced',
          'exclusions',
          'labels',
          'rulesPreview',
        ]}
      />
    );
    expect(screen.getByTestId('slosWizardNavError-identity')).toBeInTheDocument();
    expect(screen.getByTestId('slosWizardNavError-advanced')).toBeInTheDocument();
    expect(screen.queryByTestId('slosWizardNavError-window')).toBeNull();
  });
});
