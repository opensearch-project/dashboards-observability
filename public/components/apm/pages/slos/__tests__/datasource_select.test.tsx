/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Datasource } from '../../../../../common/types/alerting';
import { DatasourceSelect, SUPPORTED_DATASOURCE_TYPES } from '../datasource_select';

// The component falls back to useDatasources() only when no `datasources` prop
// is supplied; every test here passes the prop, so the hook is inert. Mock it
// anyway so it never touches coreRefs.savedObjectsClient.
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
    ...overrides,
  };
}

describe('DatasourceSelect', () => {
  it('only supports backends SLOs can currently be created against', () => {
    // Guards the extensibility seam: when OpenSearch SLOs land this expectation
    // is updated deliberately rather than slipping in unnoticed.
    expect([...SUPPORTED_DATASOURCE_TYPES]).toEqual(['prometheus']);
  });

  it('lists eligible (prometheus, enabled) datasources and excludes the rest', () => {
    const onChange = jest.fn();
    render(
      <DatasourceSelect
        value=""
        onChange={onChange}
        isLoading={false}
        datasources={[
          ds({ id: 'ds-prom-1', name: 'Prod Prometheus' }),
          ds({ id: 'ds-os-1', name: 'Local Cluster', type: 'opensearch' }),
          ds({ id: 'ds-prom-disabled', name: 'Disabled Prom', enabled: false }),
        ]}
      />
    );
    const select = screen.getByTestId('slosWizardDatasourceId') as HTMLSelectElement;
    const optionText = Array.from(select.options).map((o) => o.text);
    expect(optionText).toContain('Prod Prometheus');
    // OpenSearch + disabled prometheus are filtered out.
    expect(optionText).not.toContain('Local Cluster');
    expect(optionText).not.toContain('Disabled Prom');
  });

  it('emits the selected datasource id on change', () => {
    const onChange = jest.fn();
    render(
      <DatasourceSelect
        value=""
        onChange={onChange}
        isLoading={false}
        datasources={[ds({ id: 'ds-prom-1', name: 'Prod Prometheus' })]}
      />
    );
    fireEvent.change(screen.getByTestId('slosWizardDatasourceId'), {
      target: { value: 'ds-prom-1' },
    });
    expect(onChange).toHaveBeenCalledWith('ds-prom-1');
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
    // The actual select is not rendered in the empty state.
    expect(screen.queryByTestId('slosWizardDatasourceId')).toBeNull();
  });

  it('shows a loading indicator while datasources resolve', () => {
    render(<DatasourceSelect value="" onChange={jest.fn()} isLoading datasources={[]} />);
    expect(screen.getByTestId('slosWizardDatasourceLoading')).toBeInTheDocument();
    expect(screen.queryByTestId('slosWizardDatasourceId')).toBeNull();
  });
});
