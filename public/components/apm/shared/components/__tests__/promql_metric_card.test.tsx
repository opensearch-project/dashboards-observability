/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { PromQLMetricCard, PromQLMetricCardProps } from '../promql_metric_card';
import { ChartSeriesData } from '../../../common/types/service_details_types';

// Mock ECharts
const mockSetOption = jest.fn();
const mockDispose = jest.fn();
const mockResize = jest.fn();

jest.mock('echarts', () => ({
  init: jest.fn(() => ({
    setOption: mockSetOption,
    dispose: mockDispose,
    resize: mockResize,
  })),
}));

// Mock the usePromQLChartData hook
const mockUsePromQLChartData = jest.fn();
jest.mock('../../hooks/use_promql_chart_data', () => ({
  usePromQLChartData: (params: any) => mockUsePromQLChartData(params),
}));

describe('PromQLMetricCard', () => {
  const defaultProps: PromQLMetricCardProps = {
    title: 'Request Rate',
    promqlQuery: 'rate(http_requests_total[5m])',
    timeRange: {
      from: 'now-1h',
      to: 'now',
    },
    prometheusConnectionId: 'prometheus-1',
  };

  const mockSeriesData: ChartSeriesData[] = [
    {
      name: 'value',
      data: [
        { timestamp: 1704067200000, value: 80 },
        { timestamp: 1704067260000, value: 90 },
        { timestamp: 1704067320000, value: 100 },
      ],
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePromQLChartData.mockReturnValue({
      series: [],
      latestValue: null,
      isLoading: false,
      error: null,
    });
  });

  describe('rendering', () => {
    it('should render title', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: mockSeriesData,
        latestValue: 100,
        isLoading: false,
        error: null,
      });

      render(<PromQLMetricCard {...defaultProps} />);

      expect(screen.getByText('Request Rate')).toBeInTheDocument();
    });

    it('should render subtitle when provided', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: mockSeriesData,
        latestValue: 100,
        isLoading: false,
        error: null,
      });

      render(<PromQLMetricCard {...defaultProps} subtitle="Average" />);

      expect(screen.getByText('Average')).toBeInTheDocument();
    });

    it('should render with data-test-subj attribute', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: mockSeriesData,
        latestValue: 100,
        isLoading: false,
        error: null,
      });

      const { container } = render(<PromQLMetricCard {...defaultProps} />);

      expect(
        container.querySelector('[data-test-subj="metricCard-request-rate"]')
      ).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('should show loading spinner when loading', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: [],
        latestValue: null,
        isLoading: true,
        error: null,
      });

      const { container } = render(<PromQLMetricCard {...defaultProps} />);

      expect(container.querySelector('.euiLoadingChart')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('should display dash when error occurs', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: [],
        latestValue: null,
        isLoading: false,
        error: new Error('PromQL query failed'),
      });

      const { container } = render(<PromQLMetricCard {...defaultProps} />);

      expect(container.querySelector('.promql-metric-card__value--error')).toBeInTheDocument();
      expect(container.querySelector('.promql-metric-card__value--error')?.textContent).toBe('-');
    });
  });

  describe('value formatting', () => {
    it('should display formatted value when data is available', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: mockSeriesData,
        latestValue: 100,
        isLoading: false,
        error: null,
      });

      render(<PromQLMetricCard {...defaultProps} />);

      expect(screen.getByText('100.0')).toBeInTheDocument();
    });

    it('should format millions with M suffix', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: mockSeriesData,
        latestValue: 1500000,
        isLoading: false,
        error: null,
      });

      render(<PromQLMetricCard {...defaultProps} />);

      expect(screen.getByText('1.5M')).toBeInTheDocument();
    });

    it('should format thousands with K suffix', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: mockSeriesData,
        latestValue: 1500,
        isLoading: false,
        error: null,
      });

      render(<PromQLMetricCard {...defaultProps} />);

      expect(screen.getByText('1.5K')).toBeInTheDocument();
    });

    it('should format small decimals as percentage', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: mockSeriesData,
        latestValue: 0.05,
        isLoading: false,
        error: null,
      });

      render(<PromQLMetricCard {...defaultProps} />);

      expect(screen.getByText('5.0%')).toBeInTheDocument();
    });

    it('should use custom formatValue when provided', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: mockSeriesData,
        latestValue: 150,
        isLoading: false,
        error: null,
      });

      render(<PromQLMetricCard {...defaultProps} formatValue={(v) => `${v.toFixed(0)} ms`} />);

      expect(screen.getByText('150 ms')).toBeInTheDocument();
    });

    it('should display dash when latestValue is null', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: [],
        latestValue: null,
        isLoading: false,
        error: null,
      });

      render(<PromQLMetricCard {...defaultProps} />);

      // Should show dash for null value
      const valueElement = screen.getByText('-');
      expect(valueElement).toBeInTheDocument();
    });
  });

  describe('trend indicator', () => {
    it('should show upward trend when value is increasing', () => {
      // Need at least 4 data points for trend calculation
      const increasingData: ChartSeriesData[] = [
        {
          name: 'value',
          data: [
            { timestamp: 1704067200000, value: 50 },
            { timestamp: 1704067260000, value: 50 },
            { timestamp: 1704067320000, value: 100 },
            { timestamp: 1704067380000, value: 100 }, // 100% increase from earlier half avg
          ],
        },
      ];

      mockUsePromQLChartData.mockReturnValue({
        series: increasingData,
        latestValue: 100,
        isLoading: false,
        error: null,
      });

      const { container } = render(<PromQLMetricCard {...defaultProps} />);

      expect(container.querySelector('.promql-metric-card__trend--up')).toBeInTheDocument();
    });

    it('should show downward trend when value is decreasing', () => {
      // Need at least 4 data points for trend calculation
      const decreasingData: ChartSeriesData[] = [
        {
          name: 'value',
          data: [
            { timestamp: 1704067200000, value: 100 },
            { timestamp: 1704067260000, value: 100 },
            { timestamp: 1704067320000, value: 50 },
            { timestamp: 1704067380000, value: 50 }, // 50% decrease from earlier half avg
          ],
        },
      ];

      mockUsePromQLChartData.mockReturnValue({
        series: decreasingData,
        latestValue: 50,
        isLoading: false,
        error: null,
      });

      const { container } = render(<PromQLMetricCard {...defaultProps} />);

      expect(container.querySelector('.promql-metric-card__trend--down')).toBeInTheDocument();
    });

    it('should not show trend for neutral changes', () => {
      // Need at least 4 data points for trend calculation
      const stableData: ChartSeriesData[] = [
        {
          name: 'value',
          data: [
            { timestamp: 1704067200000, value: 100 },
            { timestamp: 1704067260000, value: 100 },
            { timestamp: 1704067320000, value: 100 },
            { timestamp: 1704067380000, value: 100 }, // No change
          ],
        },
      ];

      mockUsePromQLChartData.mockReturnValue({
        series: stableData,
        latestValue: 100,
        isLoading: false,
        error: null,
      });

      const { container } = render(<PromQLMetricCard {...defaultProps} />);

      expect(container.querySelector('.promql-metric-card__trend--up')).not.toBeInTheDocument();
      expect(container.querySelector('.promql-metric-card__trend--down')).not.toBeInTheDocument();
    });
  });

  describe('inverted color mode', () => {
    it('should apply inverted class when invertColor is true', () => {
      // Need at least 4 data points for trend calculation
      const increasingData: ChartSeriesData[] = [
        {
          name: 'value',
          data: [
            { timestamp: 1704067200000, value: 50 },
            { timestamp: 1704067260000, value: 50 },
            { timestamp: 1704067320000, value: 100 },
            { timestamp: 1704067380000, value: 100 }, // 100% increase from earlier half avg
          ],
        },
      ];

      mockUsePromQLChartData.mockReturnValue({
        series: increasingData,
        latestValue: 100,
        isLoading: false,
        error: null,
      });

      const { container } = render(<PromQLMetricCard {...defaultProps} invertColor={true} />);

      expect(container.querySelector('.promql-metric-card__trend--inverted')).toBeInTheDocument();
    });
  });

  describe('sparkline chart', () => {
    it('should render sparkline when data is available', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: mockSeriesData,
        latestValue: 100,
        isLoading: false,
        error: null,
      });

      render(<PromQLMetricCard {...defaultProps} />);

      expect(mockSetOption).toHaveBeenCalled();
    });

    it('should not render sparkline when no data', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: [],
        latestValue: null,
        isLoading: false,
        error: null,
      });

      const { container } = render(<PromQLMetricCard {...defaultProps} />);

      expect(container.querySelector('.promql-metric-card__chart')).not.toBeInTheDocument();
    });
  });

  describe('props handling', () => {
    it('should pass correct parameters to usePromQLChartData hook', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: [],
        latestValue: null,
        isLoading: false,
        error: null,
      });

      render(<PromQLMetricCard {...defaultProps} refreshTrigger={3} />);

      expect(mockUsePromQLChartData).toHaveBeenCalledWith({
        promqlQuery: 'rate(http_requests_total[5m])',
        timeRange: { from: 'now-1h', to: 'now' },
        prometheusConnectionId: 'prometheus-1',
        refreshTrigger: 3,
      });
    });

    it('should apply custom height', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: mockSeriesData,
        latestValue: 100,
        isLoading: false,
        error: null,
      });

      const { container } = render(<PromQLMetricCard {...defaultProps} height={200} />);

      const panel = container.querySelector('.promql-metric-card');
      expect(panel).toHaveStyle({ height: '200px' });
    });
  });

  describe('cleanup', () => {
    it('should dispose chart on unmount', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: mockSeriesData,
        latestValue: 100,
        isLoading: false,
        error: null,
      });

      const { unmount } = render(<PromQLMetricCard {...defaultProps} />);

      unmount();

      expect(mockDispose).toHaveBeenCalled();
    });
  });
});
