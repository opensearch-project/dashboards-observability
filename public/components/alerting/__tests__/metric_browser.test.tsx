/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MetricBrowser } from '../metric_browser';

// Mock the AlertingPromResourcesService
jest.mock('../query_services/alerting_prom_resources_service', () => ({
  AlertingPromResourcesService: jest.fn().mockImplementation(() => ({
    listMetricNames: jest.fn().mockResolvedValue({
      metrics: [
        'up',
        'http_requests_total',
        'process_resident_memory_bytes',
        'node_cpu_seconds_total',
        'http_request_duration_seconds_bucket',
      ],
    }),
    listLabelNames: jest.fn().mockResolvedValue({
      labels: ['instance', 'job', 'method', 'status_code'],
    }),
  })),
}));

describe('MetricBrowser', () => {
  const mockOnSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading state initially', () => {
    render(<MetricBrowser onSelectMetric={mockOnSelect} datasourceId="ds-1" />);
    expect(screen.getByText('Loading metrics...')).toBeInTheDocument();
  });

  it('renders metric names from the API', async () => {
    render(<MetricBrowser onSelectMetric={mockOnSelect} datasourceId="ds-1" />);

    await waitFor(() => {
      expect(screen.getByText('up')).toBeInTheDocument();
    });
    expect(screen.getByText('http_requests_total')).toBeInTheDocument();
    expect(screen.getByText('process_resident_memory_bytes')).toBeInTheDocument();
  });

  it('infers metric type from name suffix', async () => {
    render(<MetricBrowser onSelectMetric={mockOnSelect} datasourceId="ds-1" />);

    await waitFor(() => {
      expect(screen.getByText('up')).toBeInTheDocument();
    });

    // http_requests_total, node_cpu_seconds_total → counter
    expect(screen.getAllByText('counter').length).toBeGreaterThanOrEqual(1);
    // http_request_duration_seconds_bucket → histogram
    expect(screen.getAllByText('histogram').length).toBeGreaterThanOrEqual(1);
  });

  it('filters metrics by search input', async () => {
    render(<MetricBrowser onSelectMetric={mockOnSelect} datasourceId="ds-1" />);

    await waitFor(() => {
      expect(screen.getByText('up')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search metrics by name...');
    fireEvent.change(searchInput, { target: { value: 'http' } });

    expect(screen.getByText('http_requests_total')).toBeInTheDocument();
    expect(screen.getByText('http_request_duration_seconds_bucket')).toBeInTheDocument();
    expect(screen.queryByText('up')).not.toBeInTheDocument();
    expect(screen.queryByText('process_resident_memory_bytes')).not.toBeInTheDocument();
  });

  it('calls onSelectMetric when a metric is clicked', async () => {
    render(<MetricBrowser onSelectMetric={mockOnSelect} datasourceId="ds-1" />);

    await waitFor(() => {
      expect(screen.getByText('up')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('up'));
    expect(mockOnSelect).toHaveBeenCalledWith('up');
  });

  it('shows error when no datasourceId is provided', async () => {
    render(<MetricBrowser onSelectMetric={mockOnSelect} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load metrics')).toBeInTheDocument();
    });
    expect(screen.getByText('No datasource selected')).toBeInTheDocument();
  });

  it('shows selected metric detail panel', async () => {
    render(<MetricBrowser onSelectMetric={mockOnSelect} datasourceId="ds-1" />);

    await waitFor(() => {
      expect(screen.getByText('http_requests_total')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('http_requests_total'));

    // Detail panel shows the selected metric name in bold and its type
    const detailPanels = screen.getAllByText('http_requests_total');
    expect(detailPanels.length).toBeGreaterThanOrEqual(2); // table + detail panel
  });
});
