/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { WizardKeyValueGrid } from '../wizard_key_value_grid';

describe('WizardKeyValueGrid', () => {
  it('renders one row per entry and fires change handlers per field', () => {
    const onChange = jest.fn();
    const onAdd = jest.fn();
    const onRemove = jest.fn();
    render(
      <WizardKeyValueGrid
        entries={[
          { key: 'compliance', value: 'pci' },
          { key: 'region', value: 'us-west-2' },
        ]}
        onChange={onChange}
        onAdd={onAdd}
        onRemove={onRemove}
        testSubjPrefix="slosWizardLabel"
      />
    );
    expect(screen.getByTestId('slosWizardLabelRow-0')).toBeInTheDocument();
    expect(screen.getByTestId('slosWizardLabelRow-1')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('slosWizardLabelKey-1'), {
      target: { value: 'zone' },
    });
    expect(onChange).toHaveBeenCalledWith(1, 'key', 'zone');

    fireEvent.click(screen.getByTestId('slosWizardLabelRemove-0'));
    expect(onRemove).toHaveBeenCalledWith(0);

    fireEvent.click(screen.getByTestId('slosWizardLabelAdd'));
    expect(onAdd).toHaveBeenCalled();
  });

  it('renders an empty-state hint when no rows are configured', () => {
    render(
      <WizardKeyValueGrid
        entries={[]}
        onChange={jest.fn()}
        onAdd={jest.fn()}
        onRemove={jest.fn()}
        testSubjPrefix="slosWizardLabel"
      />
    );
    expect(screen.getByTestId('slosWizardLabelsEmpty')).toBeInTheDocument();
  });

  it('renders the per-row error when rowErrors[i] is set', () => {
    render(
      <WizardKeyValueGrid
        entries={[{ key: 'env', value: 'uuid' }]}
        rowErrors={['Label values must not be UUIDs (cardinality guardrail)']}
        onChange={jest.fn()}
        onAdd={jest.fn()}
        onRemove={jest.fn()}
        testSubjPrefix="slosWizardLabel"
      />
    );
    const row = screen.getByTestId('slosWizardLabelRow-0').closest('.euiFormRow')!;
    expect(row.textContent).toMatch(/must not be UUIDs/);
  });
});
