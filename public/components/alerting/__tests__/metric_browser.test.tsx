/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react';

// Provide mock metrics so generateMetricMeta() produces data
jest.mock('../promql_editor', () => ({
  MOCK_METRICS: ['http_requests_total', 'node_cpu_seconds_total', 'up'],
  MOCK_LABEL_NAMES: ['instance', 'job', 'method', 'status'],
}));

import { MetricBrowser } from '../metric_browser';

describe('MetricBrowser', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders the search input and metric table', () => {
    const { getByLabelText, getByText } = render(<MetricBrowser onSelectMetric={jest.fn()} />);
    expect(getByLabelText('Search metrics')).toBeInTheDocument();
    expect(getByText('http_requests_total')).toBeInTheDocument();
  });

  it('filters metrics by search term', () => {
    const { getByLabelText, queryByText } = render(<MetricBrowser onSelectMetric={jest.fn()} />);
    fireEvent.change(getByLabelText('Search metrics'), { target: { value: 'node_cpu' } });
    expect(queryByText('node_cpu_seconds_total')).toBeInTheDocument();
    expect(queryByText('http_requests_total')).not.toBeInTheDocument();
  });

  it('calls onSelectMetric when a metric is clicked', () => {
    const onSelect = jest.fn();
    const { getByText } = render(<MetricBrowser onSelectMetric={onSelect} />);
    fireEvent.click(getByText('up'));
    expect(onSelect).toHaveBeenCalledWith('up');
  });
});
