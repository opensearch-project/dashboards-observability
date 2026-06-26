/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Datasource } from '../../../../../common/types/alerting';
import { DatasourceSelect, SUPPORTED_DATASOURCE_TYPES } from '../datasource_select';

// The datasource picker falls back to useDatasources() only when no
// `datasources` prop is supplied; every test here passes the prop, so the hook
// is inert. Mock it anyway so it never touches coreRefs.savedObjectsClient.
jest.mock('../../../../alerting/hooks/use_datasources', () => ({
  useDatasources: () => ({ datasources: [], isLoading: false, error: null, refresh: () => {} }),
}));

function ds(overrides: Partial<Datasource> = {}): Datasource {
  return {
    id: 'ds-prom-1',
    name: 'Prod Prometheus',
    type: 'prometheus',
    url: 'ds-prom-1',
    enabled: true,
    // The SLO routes resolve spec.datasourceId by the SQL-plugin connection id,
    // so the picker emits this (not the saved-object id).
    directQueryName: 'prom_conn',
    ...overrides,
  };
}

/** Open the combobox option list and return the rendered option labels. */
function openAndReadOptions(): string[] {
  // EuiComboBox renders a toggle button that expands the option list. The list
  // portals into document.body, so query options at screen level (role
  // "option" buttons) rather than scoping to the input container.
  fireEvent.click(screen.getByTestId('comboBoxToggleListButton'));
  return screen.getAllByRole('option').map((o) => o.textContent ?? '');
}

describe('DatasourceSelect', () => {
  it('only supports backends SLOs can currently be created against', () => {
    // Guards the extensibility seam: when OpenSearch SLOs land this expectation
    // is updated deliberately rather than slipping in unnoticed.
    expect([...SUPPORTED_DATASOURCE_TYPES]).toEqual(['prometheus']);
  });

  it('lists eligible (prometheus, enabled) datasources and excludes the rest', () => {
    render(
      <DatasourceSelect
        value=""
        onChange={jest.fn()}
        isLoading={false}
        datasources={[
          ds({ id: 'ds-prom-1', name: 'Prod Prometheus' }),
          ds({ id: 'ds-os-1', name: 'Local Cluster', type: 'opensearch' }),
          ds({ id: 'ds-prom-disabled', name: 'Disabled Prom', enabled: false }),
        ]}
      />
    );
    const optionText = openAndReadOptions();
    expect(optionText).toContain('Prod Prometheus');
    // OpenSearch + disabled prometheus are filtered out.
    expect(optionText).not.toContain('Local Cluster');
    expect(optionText).not.toContain('Disabled Prom');
  });

  it('excludes a Prometheus datasource with no directQueryName (cannot be deployed to)', () => {
    render(
      <DatasourceSelect
        value=""
        onChange={jest.fn()}
        isLoading={false}
        datasources={[
          ds({ id: 'ds-prom-1', name: 'Deployable', directQueryName: 'conn-1' }),
          ds({ id: 'ds-prom-2', name: 'No Connection', directQueryName: undefined }),
        ]}
      />
    );
    const optionText = openAndReadOptions();
    expect(optionText).toContain('Deployable');
    expect(optionText).not.toContain('No Connection');
  });

  it('emits the connection id (directQueryName), not the saved-object id', () => {
    const onChange = jest.fn();
    render(
      <DatasourceSelect
        value=""
        onChange={onChange}
        isLoading={false}
        datasources={[
          ds({ id: 'so-uuid-1', name: 'Prod Prometheus', directQueryName: 'prom_conn' }),
        ]}
      />
    );
    fireEvent.click(screen.getByTestId('comboBoxToggleListButton'));
    fireEvent.click(screen.getByRole('option', { name: 'Prod Prometheus' }));
    // Must be the connection id the SLO routes resolve — NOT 'so-uuid-1'.
    expect(onChange).toHaveBeenCalledWith('prom_conn');
  });

  it('shows the datasource name for the currently-selected connection id', () => {
    render(
      <DatasourceSelect
        value="prom_conn"
        onChange={jest.fn()}
        isLoading={false}
        datasources={[
          ds({ id: 'so-uuid-1', name: 'Prod Prometheus', directQueryName: 'prom_conn' }),
        ]}
      />
    );
    // The active selection renders as a chip showing the human-readable name.
    expect(screen.getByText('Prod Prometheus')).toBeInTheDocument();
  });

  it('does not accept free text — typing an unknown id selects nothing', () => {
    const onChange = jest.fn();
    render(
      <DatasourceSelect
        value=""
        onChange={onChange}
        isLoading={false}
        datasources={[ds({ id: 'ds-prom-1', name: 'Prod Prometheus' })]}
      />
    );
    const input = screen.getByTestId('comboBoxSearchInput');
    fireEvent.change(input, { target: { value: 'made-up-datasource' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    // No onCreateOption wired → arbitrary text cannot become a selection.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows an actionable empty state when no compatible datasource exists', () => {
    render(
      <DatasourceSelect
        value=""
        onChange={jest.fn()}
        isLoading={false}
        datasources={[ds({ type: 'opensearch', name: 'Local Cluster' })]}
      />
    );
    expect(screen.getByTestId('slosWizardDatasourceEmpty')).toBeInTheDocument();
    expect(screen.getByTestId('slosWizardDatasourceEmptyLink')).toBeInTheDocument();
    // The combobox is not rendered in the empty state.
    expect(screen.queryByTestId('slosWizardDatasourceId')).toBeNull();
  });

  it('renders the combobox (not the empty state) while datasources are still loading', () => {
    render(<DatasourceSelect value="" onChange={jest.fn()} isLoading datasources={[]} />);
    // An empty-but-loading list must not flash the "no datasources" callout.
    expect(screen.queryByTestId('slosWizardDatasourceEmpty')).toBeNull();
    expect(screen.getByTestId('slosWizardDatasourceId')).toBeInTheDocument();
  });
});
