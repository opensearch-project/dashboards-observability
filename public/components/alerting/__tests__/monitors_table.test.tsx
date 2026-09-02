/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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
  datasources: [{ id: 'ds-1', name: 'prom1', type: 'prometheus' }] as unknown as Datasource[],
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

    const detectorLink = screen.getByRole('button', { name: /sample-http-responses-detector/i });
    expect(detectorLink.closest('tr')).toHaveTextContent('Anomaly Detector');
    fireEvent.click(detectorLink);

    expect(screen.getByTestId('detectorFlyout')).toBeInTheDocument();
  });

  it('opens the forecaster flyout and allows forecaster selection', () => {
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

    expect(screen.getByLabelText('Select sample-cpu-forecaster')).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /sample-cpu-forecaster/i }));

    expect(screen.getByTestId('forecasterFlyout')).toBeInTheDocument();
  });

  it('shows start and stop actions for selected detector and forecaster rows', async () => {
    const onStartResources = jest.fn();
    const onStopResources = jest.fn();
    const stoppedDetector = sampleRule({
      id: 'det-1',
      name: 'stopped-detector',
      definitionType: 'detector',
      monitorType: 'detector',
      enabled: false,
      status: 'Stopped' as const,
      severity: 'info',
      datasourceType: 'opensearch',
    });
    const runningForecaster = sampleRule({
      id: 'forecast-1',
      name: 'running-forecaster',
      definitionType: 'forecaster',
      monitorType: 'forecaster',
      enabled: true,
      status: 'Running' as const,
      severity: 'info',
      datasourceType: 'opensearch',
    });

    render(
      <MonitorsTable
        {...defaultProps}
        rules={[stoppedDetector, runningForecaster]}
        onStartResources={onStartResources}
        onStopResources={onStopResources}
      />
    );

    fireEvent.click(screen.getByLabelText('Select stopped-detector'));
    fireEvent.click(screen.getByTestId('alertManagerStartSelectedResources'));
    await waitFor(() =>
      expect(onStartResources).toHaveBeenCalledWith([expect.objectContaining({ id: 'det-1' })])
    );
    await waitFor(() =>
      expect(screen.queryByTestId('alertManagerStartSelectedResources')).not.toBeInTheDocument()
    );

    fireEvent.click(screen.getByLabelText('Select running-forecaster'));
    fireEvent.click(screen.getByTestId('alertManagerStopSelectedResources'));
    await waitFor(() =>
      expect(onStopResources).toHaveBeenCalledWith([expect.objectContaining({ id: 'forecast-1' })])
    );
  });

  it('surfaces detector and forecaster create actions for OpenSearch datasources', () => {
    const onCreateMonitor = jest.fn();
    render(
      <MonitorsTable
        {...defaultProps}
        datasources={[{ id: 'os-1', name: 'local', type: 'opensearch' }] as unknown as Datasource[]}
        selectedDsIds={['os-1']}
        onCreateMonitor={onCreateMonitor}
      />
    );

    fireEvent.click(screen.getByTestId('alertManagerCreateResourceButton'));
    fireEvent.click(screen.getByText('Anomaly detection rule'));
    expect(onCreateMonitor).toHaveBeenCalledWith('detector');

    fireEvent.click(screen.getByTestId('alertManagerCreateResourceButton'));
    fireEvent.click(screen.getByText('Forecasting rule'));
    expect(onCreateMonitor).toHaveBeenCalledWith('forecaster');
  });

  it('disables detector and forecaster creation for an AOSS datasource', () => {
    const onCreateMonitor = jest.fn();
    render(
      <MonitorsTable
        {...defaultProps}
        datasources={
          [
            {
              id: 'aoss-1',
              name: 'serverless',
              type: 'opensearch',
              mdsId: 'aoss-1',
              engineType: 'OpenSearch Serverless',
            },
          ] as Datasource[]
        }
        selectedDsIds={['aoss-1']}
        onCreateMonitor={onCreateMonitor}
      />
    );

    fireEvent.click(screen.getByTestId('alertManagerCreateResourceButton'));
    expect(
      screen.getByLabelText('Create anomaly detection rule').closest('.euiListGroupItem')
    ).toHaveClass('euiListGroupItem-isDisabled');
    expect(
      screen.getByLabelText('Create forecasting rule').closest('.euiListGroupItem')
    ).toHaveClass('euiListGroupItem-isDisabled');
  });

  // Regression (audit M8): rule-creation enablement must follow the
  // datasources AVAILABLE to the user, not the current facet (browse)
  // selection. A Prometheus datasource exists, so Metrics create stays enabled
  // even with nothing selected in the facet.
  it('keeps metrics creation enabled with a Prometheus datasource and no facet selection', () => {
    const onCreateMonitor = jest.fn();
    render(
      <MonitorsTable
        {...defaultProps}
        datasources={
          [{ id: 'prom-1', name: 'prom1', type: 'prometheus' }] as unknown as Datasource[]
        }
        selectedDsIds={[]}
        onCreateMonitor={onCreateMonitor}
      />
    );

    fireEvent.click(screen.getByTestId('alertManagerCreateResourceButton'));
    fireEvent.click(screen.getByText('Metrics alert rule'));
    expect(onCreateMonitor).toHaveBeenCalledWith('metrics');
  });

  // Logs symmetric counterpart of the metrics test above, and the case that
  // actually distinguishes the fix from the pre-fix behaviour: an OpenSearch
  // datasource EXISTS but is not in the facet selection (only a Prometheus DS
  // is selected). The old selection-keyed logic disabled Logs create here
  // (every selected DS was Prometheus); the fix keeps it enabled because the
  // capability follows the available datasources, not the browse filter.
  it('keeps logs creation enabled when an OpenSearch datasource exists but is not selected', () => {
    const onCreateMonitor = jest.fn();
    render(
      <MonitorsTable
        {...defaultProps}
        datasources={
          [
            { id: 'os-1', name: 'cluster1', type: 'opensearch' },
            { id: 'prom-1', name: 'prom1', type: 'prometheus' },
          ] as unknown as Datasource[]
        }
        selectedDsIds={['prom-1']}
        onCreateMonitor={onCreateMonitor}
      />
    );

    fireEvent.click(screen.getByTestId('alertManagerCreateResourceButton'));
    fireEvent.click(screen.getByText('Logs alert rule'));
    expect(onCreateMonitor).toHaveBeenCalledWith('logs');
  });

  // Disable direction still holds: with no OpenSearch datasource available at
  // all, Logs create is greyed out (the wizard would have no valid target).
  it('disables logs creation when no OpenSearch datasource exists', () => {
    const onCreateMonitor = jest.fn();
    render(
      <MonitorsTable
        {...defaultProps}
        datasources={
          [{ id: 'prom-1', name: 'prom1', type: 'prometheus' }] as unknown as Datasource[]
        }
        selectedDsIds={['prom-1']}
        onCreateMonitor={onCreateMonitor}
      />
    );

    fireEvent.click(screen.getByTestId('alertManagerCreateResourceButton'));
    expect(screen.getByLabelText('Create logs rule').closest('.euiListGroupItem')).toHaveClass(
      'euiListGroupItem-isDisabled'
    );
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
