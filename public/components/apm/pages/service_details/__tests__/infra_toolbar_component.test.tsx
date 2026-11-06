/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InfraToolbar, isValidFilterRegex } from '../infra_toolbar';
import { InfraLabelFilter, InfraLayout } from '../../../common/types/infra_types';

const onFilters = jest.fn();

/** The toolbar with its state held here, as the tab holds it. */
const Harness: React.FC<{ initial?: InfraLabelFilter[] }> = ({ initial = [] }) => {
  const [filters, setFilters] = useState<InfraLabelFilter[]>(initial);
  const [search, setSearch] = useState('');
  const [layout, setLayout] = useState<InfraLayout>('grid');
  return (
    <InfraToolbar
      labels={[{ name: 'k8s_pod_name', values: ['pod-a', 'pod-b'] }]}
      filters={filters}
      onFiltersChange={(f) => {
        onFilters(f);
        setFilters(f);
      }}
      search={search}
      onSearchChange={setSearch}
      layout={layout}
      onLayoutChange={setLayout}
    />
  );
};

const typeIntoCombo = (testSubj: string, value: string) => {
  const input = screen.getByTestId(testSubj).querySelector('input') as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
  return input;
};

const openAndPickLabel = async () => {
  fireEvent.click(screen.getByTestId('serviceInfrastructureAddLabelFilter'));
  typeIntoCombo('serviceInfrastructureFilterLabel', 'k8s_pod');
  fireEvent.click(await screen.findByRole('option', { name: 'k8s_pod_name' }));
};

describe('InfraToolbar', () => {
  beforeEach(() => onFilters.mockClear());

  it('adds a label filter from the popover and shows it as a badge', async () => {
    render(<Harness />);
    await openAndPickLabel();
    const input = typeIntoCombo('serviceInfrastructureFilterValue', 'pod-a');
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(onFilters).toHaveBeenLastCalledWith([
      { name: 'k8s_pod_name', operator: '=', value: 'pod-a' },
    ]);
    expect(await screen.findByTestId('activeFilterBadges')).toHaveTextContent('pod-a');
  });

  it('rejects an invalid regex instead of sending it with every chart query', async () => {
    render(<Harness />);
    await openAndPickLabel();
    // Pick the =~ operator.
    fireEvent.click(screen.getByTestId('serviceInfrastructureFilterOperator'));
    fireEvent.click(await screen.findByRole('option', { name: /Matches regex/ }));
    const input = typeIntoCombo('serviceInfrastructureFilterValue', 'pod-(');
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    await waitFor(() =>
      expect(screen.getByText('Not a valid regular expression')).toBeInTheDocument()
    );
    // The typed value stays, to be fixed.
    expect(input.value).toBe('pod-(');
    expect(onFilters).not.toHaveBeenCalled();
  });

  it('clears every filter at once', async () => {
    render(
      <Harness
        initial={[
          { name: 'k8s_pod_name', operator: '=', value: 'pod-a' },
          { name: 'k8s_pod_name', operator: '!=', value: 'pod-b' },
        ]}
      />
    );
    fireEvent.click(screen.getByText(/Clear all/i));
    expect(onFilters).toHaveBeenLastCalledWith([]);
  });

  it('validates regexes as PromQL anchors them', () => {
    expect(isValidFilterRegex('pod-.*')).toBe(true);
    expect(isValidFilterRegex('pod-(')).toBe(false);
  });
});
