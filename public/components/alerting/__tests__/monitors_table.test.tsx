/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// Stub flyout to avoid pulling in its dependency tree
jest.mock('../monitor_detail_flyout', () => ({
  MonitorDetailFlyout: () => <div data-test-subj="monitorFlyout" />,
}));

jest.mock('../detector_detail_flyout', () => ({
  DetectorDetailFlyout: () => <div data-test-subj="detectorFlyout" />,
}));

jest.mock('../forecaster_detail_flyout', () => ({
  ForecasterDetailFlyout: () => <div data-test-subj="forecasterFlyout" />,
}));

// monitors_table.tsx was moved to monitors_table/index.tsx;
// `../monitors_table` still resolves via TS's implicit index.tsx resolution.
import { MonitorsTable } from '../monitors_table';
import { Datasource } from '../../../../common/types/alerting';

const sampleRule = (overrides = {}) => ({
  id: 'r1',
  name: 'HighCPU',
  enabled: true,
  status: 'active' as const,
  severity: 'critical' as const,
  monitorType: 'metric' as const,
  healthStatus: 'healthy' as const,
  datasourceId: 'ds-1',
  datasourceType: 'prometheus' as const,
  query: 'rate(cpu[5m]) > 0.9',
  condition: '',
  labels: { team: 'infra' },
  annotations: {},
  createdBy: 'admin',
  createdAt: '2026-01-01T00:00:00Z',
  lastModified: '2026-01-01T00:00:00Z',
  notificationDestinations: [],
  evaluationInterval: '1m',
  pendingPeriod: '5m',
  ...overrides,
});

// MonitorsTable no longer takes an apiClient prop — mutation
// dispatch happens inside the page via hooks. Props kept here are the
// display-and-interaction ones the component currently accepts.
const defaultProps = {
  rules: [sampleRule()],
  datasources: ([{ id: 'ds-1', name: 'prom1', type: 'prometheus' }] as unknown) as Datasource[],
  loading: false,
  onDelete: jest.fn(),
  selectedDsIds: ['ds-1'],
  onDatasourceChange: jest.fn(),
  maxDatasources: 5,
  onDatasourceCapReached: jest.fn(),
};

describe('MonitorsTable', () => {
  it('renders the table with a rule row', () => {
    render(<MonitorsTable {...defaultProps} />);
    expect(screen.getByText('HighCPU')).toBeInTheDocument();
    expect(screen.getByText(/rules/)).toBeInTheDocument();
  });

  it('selects a row checkbox', () => {
    render(<MonitorsTable {...defaultProps} />);
    const checkbox = screen.getByLabelText('Select HighCPU');
    fireEvent.click(checkbox);
    // After selecting, the Delete button should appear
    expect(screen.getByText(/Delete/)).toBeInTheDocument();
  });

  it('opens the detector flyout when a detector name is clicked', () => {
    render(
      <MonitorsTable
        {...defaultProps}
        rules={[
          sampleRule({
            id: 'det-1',
            name: 'sample-http-responses-detector',
            definitionType: 'detector',
            monitorType: 'detector',
            severity: 'info',
            datasourceType: 'opensearch',
          }),
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /sample-http-responses-detector/i }));

    expect(screen.getByTestId('detectorFlyout')).toBeInTheDocument();
  });

  it('opens the forecaster flyout and keeps forecasters out of bulk monitor selection', () => {
    render(
      <MonitorsTable
        {...defaultProps}
        rules={[
          sampleRule({
            id: 'forecast-1',
            name: 'sample-cpu-forecaster',
            definitionType: 'forecaster',
            monitorType: 'forecaster',
            severity: 'info',
            datasourceType: 'opensearch',
          }),
        ]}
      />
    );

    expect(screen.getByLabelText('Select sample-cpu-forecaster')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /sample-cpu-forecaster/i }));

    expect(screen.getByTestId('forecasterFlyout')).toBeInTheDocument();
  });

  // Regression: deselecting all datasources must wipe both the dependent
  // facet selections AND the search box, mirroring the cascade-clear in
  // alerts_dashboard.tsx. Keep the two tabs aligned.
  it('clears the search box when all datasources are deselected', () => {
    const onDatasourceChange = jest.fn();
    render(<MonitorsTable {...defaultProps} onDatasourceChange={onDatasourceChange} />);

    const searchInput = screen.getByPlaceholderText(/Search rules/i) as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'HighCPU' } });
    expect(searchInput.value).toBe('HighCPU');

    // Uncheck the only selected datasource in the filter panel.
    fireEvent.click(screen.getByLabelText(/prom1/));

    expect(onDatasourceChange).toHaveBeenCalledWith([]);
    expect(searchInput.value).toBe('');
  });
});
