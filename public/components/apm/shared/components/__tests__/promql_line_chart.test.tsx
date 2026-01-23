/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { PromQLLineChart, PromQLLineChartProps } from '../promql_line_chart';
import { ChartSeriesData } from '../../../common/types/service_details_types';

// Mock ECharts
const mockSetOption = jest.fn();
const mockShowLoading = jest.fn();
const mockHideLoading = jest.fn();
const mockDispose = jest.fn();
const mockResize = jest.fn();

jest.mock('echarts', () => ({
  init: jest.fn(() => ({
    setOption: mockSetOption,
    showLoading: mockShowLoading,
    hideLoading: mockHideLoading,
    dispose: mockDispose,
    resize: mockResize,
  })),
  graphic: {
    LinearGradient: jest.fn(),
  },
}));

// Mock the usePromQLChartData hook
const mockUsePromQLChartData = jest.fn();
jest.mock('../../hooks/use_promql_chart_data', () => ({
  usePromQLChartData: (params: any) => mockUsePromQLChartData(params),
}));

// Mock euiThemeVars
jest.mock('@osd/ui-shared-deps/theme', () => ({
  euiThemeVars: {
    euiColorDarkShade: '#69707d',
    euiColorEmptyShade: '#ffffff',
    euiColorLightShade: '#d3dae6',
    euiColorMediumShade: '#98a2b3',
    euiColorLightestShade: '#f5f7fa',
    euiTextColor: '#343741',
  },
}));

describe('PromQLLineChart', () => {
  const defaultProps: PromQLLineChartProps = {
    promqlQuery: 'rate(http_requests_total[5m])',
    timeRange: {
      from: 'now-1h',
      to: 'now',
    },
    prometheusConnectionId: 'prometheus-1',
  };

  const mockSeriesData: ChartSeriesData[] = [
    {
      name: 'frontend',
      data: [
        { timestamp: 1704067200000, value: 100 },
        { timestamp: 1704067260000, value: 120 },
        { timestamp: 1704067320000, value: 110 },
      ],
      color: '#54b399',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePromQLChartData.mockReturnValue({
      series: [],
      isLoading: false,
      error: null,
    });
  });

  describe('loading state', () => {
    it('should show loading state when data is being fetched', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: [],
        isLoading: true,
        error: null,
      });

      render(<PromQLLineChart {...defaultProps} />);

      // Chart should initialize and show loading
      expect(mockShowLoading).toHaveBeenCalled();
    });

    it('should hide loading when data arrives', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: mockSeriesData,
        isLoading: false,
        error: null,
      });

      render(<PromQLLineChart {...defaultProps} />);

      expect(mockHideLoading).toHaveBeenCalled();
    });
  });

  describe('error state', () => {
    it('should display error message when fetch fails', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: [],
        isLoading: false,
        error: new Error('PromQL query failed'),
      });

      render(<PromQLLineChart {...defaultProps} title="Test Chart" />);

      expect(screen.getByText('Failed to load chart data')).toBeInTheDocument();
    });

    it('should show title in error state', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: [],
        isLoading: false,
        error: new Error('PromQL query failed'),
      });

      render(<PromQLLineChart {...defaultProps} title="My Chart Title" />);

      expect(screen.getByText('My Chart Title')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('should display no data message when series is empty', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: [],
        isLoading: false,
        error: null,
      });

      render(<PromQLLineChart {...defaultProps} />);

      expect(screen.getByText('No data available')).toBeInTheDocument();
    });

    it('should show title in empty state', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: [],
        isLoading: false,
        error: null,
      });

      render(<PromQLLineChart {...defaultProps} title="Empty Chart" />);

      expect(screen.getByText('Empty Chart')).toBeInTheDocument();
    });
  });

  describe('successful data rendering', () => {
    it('should render chart with data', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: mockSeriesData,
        isLoading: false,
        error: null,
      });

      render(<PromQLLineChart {...defaultProps} title="Request Rate" />);

      expect(mockSetOption).toHaveBeenCalled();
    });

    it('should render with title', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: mockSeriesData,
        isLoading: false,
        error: null,
      });

      render(<PromQLLineChart {...defaultProps} title="Request Rate" />);

      expect(screen.getByText('Request Rate')).toBeInTheDocument();
    });

    it('should render with data-test-subj attribute', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: mockSeriesData,
        isLoading: false,
        error: null,
      });

      const { container } = render(<PromQLLineChart {...defaultProps} title="My Test Chart" />);

      expect(
        container.querySelector('[data-test-subj="lineChart-my-test-chart"]')
      ).toBeInTheDocument();
    });
  });

  describe('props handling', () => {
    it('should pass correct parameters to usePromQLChartData hook', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: [],
        isLoading: false,
        error: null,
      });

      render(<PromQLLineChart {...defaultProps} refreshTrigger={5} labelField="remoteService" />);

      expect(mockUsePromQLChartData).toHaveBeenCalledWith({
        promqlQuery: 'rate(http_requests_total[5m])',
        timeRange: { from: 'now-1h', to: 'now' },
        prometheusConnectionId: 'prometheus-1',
        refreshTrigger: 5,
        labelField: 'remoteService',
      });
    });

    it('should apply custom height', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: mockSeriesData,
        isLoading: false,
        error: null,
      });

      const { container } = render(
        <PromQLLineChart {...defaultProps} height={400} title="Custom Height" />
      );

      const chartContainer = container.querySelector('.promql-line-chart');
      expect(chartContainer).toHaveStyle({ height: '400px' });
    });

    it('should use line chart type by default', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: mockSeriesData,
        isLoading: false,
        error: null,
      });

      render(<PromQLLineChart {...defaultProps} />);

      expect(mockSetOption).toHaveBeenCalled();
      const setOptionCall = mockSetOption.mock.calls[0][0];
      // Series type should be line (area would have areaStyle)
      expect(setOptionCall.series[0].type).toBe('line');
    });

    it('should apply area chart type when specified', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: mockSeriesData,
        isLoading: false,
        error: null,
      });

      render(<PromQLLineChart {...defaultProps} chartType="area" />);

      expect(mockSetOption).toHaveBeenCalled();
      const setOptionCall = mockSetOption.mock.calls[0][0];
      expect(setOptionCall.series[0].areaStyle).toBeDefined();
    });

    it('should hide legend when showLegend is false', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: mockSeriesData,
        isLoading: false,
        error: null,
      });

      render(<PromQLLineChart {...defaultProps} showLegend={false} />);

      expect(mockSetOption).toHaveBeenCalled();
      const setOptionCall = mockSetOption.mock.calls[0][0];
      expect(setOptionCall.legend).toBeUndefined();
    });
  });

  describe('multiple series', () => {
    it('should render multiple series', () => {
      const multiSeriesData: ChartSeriesData[] = [
        {
          name: 'frontend',
          data: [
            { timestamp: 1704067200000, value: 100 },
            { timestamp: 1704067260000, value: 120 },
          ],
          color: '#54b399',
        },
        {
          name: 'cart',
          data: [
            { timestamp: 1704067200000, value: 50 },
            { timestamp: 1704067260000, value: 60 },
          ],
          color: '#d36086',
        },
      ];

      mockUsePromQLChartData.mockReturnValue({
        series: multiSeriesData,
        isLoading: false,
        error: null,
      });

      render(<PromQLLineChart {...defaultProps} />);

      expect(mockSetOption).toHaveBeenCalled();
      const setOptionCall = mockSetOption.mock.calls[0][0];
      expect(setOptionCall.series).toHaveLength(2);
      expect(setOptionCall.series[0].name).toBe('frontend');
      expect(setOptionCall.series[1].name).toBe('cart');
    });
  });

  describe('cleanup', () => {
    it('should dispose chart on unmount', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: mockSeriesData,
        isLoading: false,
        error: null,
      });

      const { unmount } = render(<PromQLLineChart {...defaultProps} />);

      unmount();

      expect(mockDispose).toHaveBeenCalled();
    });
  });
});
