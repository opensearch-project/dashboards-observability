/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MetricSparkline, MetricDataPoint } from '../metric_sparkline';
import * as echarts from 'echarts';

// Mock echarts
const mockSetOption = jest.fn();
const mockResize = jest.fn();
const mockDispose = jest.fn();

jest.mock('echarts', () => ({
  init: jest.fn(() => ({
    setOption: mockSetOption,
    resize: mockResize,
    dispose: mockDispose,
  })),
  graphic: {
    LinearGradient: jest.fn(),
  },
}));

// Get the mocked module
const mockedEcharts = echarts as jest.Mocked<typeof echarts>;

describe('MetricSparkline', () => {
  const mockData: MetricDataPoint[] = [
    { timestamp: 1704067200000, value: 10 },
    { timestamp: 1704070800000, value: 20 },
    { timestamp: 1704074400000, value: 15 },
    { timestamp: 1704078000000, value: 25 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loading state', () => {
    it('should render loading chart when isLoading is true', () => {
      const { container } = render(<MetricSparkline data={[]} isLoading={true} />);

      // EuiLoadingChart renders with class euiLoadingChart
      const loadingChart = container.querySelector('.euiLoadingChart');
      expect(loadingChart).toBeInTheDocument();
    });

    it('should not initialize echarts when loading', () => {
      render(<MetricSparkline data={mockData} isLoading={true} />);

      expect(mockedEcharts.init).not.toHaveBeenCalled();
    });
  });

  describe('error state', () => {
    it('should render "-" when isError is true', () => {
      render(<MetricSparkline data={mockData} isError={true} />);

      expect(screen.getByText('-')).toBeInTheDocument();
    });

    it('should not initialize echarts when error', () => {
      render(<MetricSparkline data={mockData} isError={true} />);

      expect(mockedEcharts.init).not.toHaveBeenCalled();
    });
  });

  describe('empty data state', () => {
    it('should render "-" when data is empty array', () => {
      render(<MetricSparkline data={[]} />);

      expect(screen.getByText('-')).toBeInTheDocument();
    });

    it('should render "-" when data is undefined', () => {
      // Testing undefined data edge case
      render(<MetricSparkline data={(undefined as unknown) as MetricDataPoint[]} />);

      expect(screen.getByText('-')).toBeInTheDocument();
    });

    it('should not initialize echarts when data is empty', () => {
      render(<MetricSparkline data={[]} />);

      expect(mockedEcharts.init).not.toHaveBeenCalled();
    });
  });

  describe('chart rendering', () => {
    it('should render chart div when data is provided', () => {
      const { container } = render(<MetricSparkline data={mockData} />);

      // Chart container should be rendered
      const chartDiv = container.querySelector('div[style*="height"]');
      expect(chartDiv).toBeInTheDocument();
    });

    it('should initialize echarts when valid data is provided', () => {
      render(<MetricSparkline data={mockData} />);

      expect(mockedEcharts.init).toHaveBeenCalled();
    });

    it('should call setOption with chart configuration', () => {
      render(<MetricSparkline data={mockData} />);

      expect(mockSetOption).toHaveBeenCalled();
      const options = mockSetOption.mock.calls[0][0];

      // Verify chart options structure
      expect(options).toHaveProperty('grid');
      expect(options).toHaveProperty('xAxis');
      expect(options).toHaveProperty('yAxis');
      expect(options).toHaveProperty('series');
      expect(options).toHaveProperty('tooltip');
    });

    it('should configure chart with no axes visible', () => {
      render(<MetricSparkline data={mockData} />);

      const options = mockSetOption.mock.calls[0][0];
      expect(options.xAxis.show).toBe(false);
      expect(options.yAxis.show).toBe(false);
    });

    it('should configure chart with tooltip disabled', () => {
      render(<MetricSparkline data={mockData} />);

      const options = mockSetOption.mock.calls[0][0];
      expect(options.tooltip.show).toBe(false);
    });

    it('should configure chart with silent mode for no interactions', () => {
      render(<MetricSparkline data={mockData} />);

      const options = mockSetOption.mock.calls[0][0];
      expect(options.series[0].silent).toBe(true);
      expect(options.series[0].emphasis.disabled).toBe(true);
    });

    it('should map data timestamps to xAxis', () => {
      render(<MetricSparkline data={mockData} />);

      const options = mockSetOption.mock.calls[0][0];
      expect(options.xAxis.data).toEqual([
        1704067200000,
        1704070800000,
        1704074400000,
        1704078000000,
      ]);
    });

    it('should map data values to series', () => {
      render(<MetricSparkline data={mockData} />);

      const options = mockSetOption.mock.calls[0][0];
      expect(options.series[0].data).toEqual([10, 20, 15, 25]);
    });
  });

  describe('custom props', () => {
    it('should use custom color', () => {
      render(<MetricSparkline data={mockData} color="#FF0000" />);

      const options = mockSetOption.mock.calls[0][0];
      expect(options.series[0].lineStyle.color).toBe('#FF0000');
    });

    it('should use default color when not specified', () => {
      render(<MetricSparkline data={mockData} />);

      const options = mockSetOption.mock.calls[0][0];
      expect(options.series[0].lineStyle.color).toBe('#54B399');
    });

    it('should apply custom height', () => {
      const { container } = render(<MetricSparkline data={mockData} height={40} />);

      const chartDiv = container.querySelector('div');
      expect(chartDiv).toHaveStyle({ height: '40px' });
    });

    it('should apply custom width', () => {
      const { container } = render(<MetricSparkline data={mockData} width={150} />);

      const chartDiv = container.querySelector('div');
      expect(chartDiv).toHaveStyle({ width: '150px' });
    });

    it('should default to 100% width when not specified', () => {
      const { container } = render(<MetricSparkline data={mockData} />);

      const chartDiv = container.querySelector('div');
      expect(chartDiv).toHaveStyle({ width: '100%' });
    });
  });

  describe('cleanup', () => {
    it('should dispose chart on unmount', () => {
      const { unmount } = render(<MetricSparkline data={mockData} />);

      unmount();

      expect(mockDispose).toHaveBeenCalled();
    });
  });

  describe('resize handling', () => {
    it('should add resize event listener', () => {
      const addEventListenerSpy = jest.spyOn(window, 'addEventListener');

      render(<MetricSparkline data={mockData} />);

      expect(addEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));

      addEventListenerSpy.mockRestore();
    });

    it('should remove resize event listener on unmount', () => {
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

      const { unmount } = render(<MetricSparkline data={mockData} />);
      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });
  });
});
