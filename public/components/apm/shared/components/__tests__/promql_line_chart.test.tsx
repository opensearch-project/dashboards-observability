/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PromQLLineChart, PromQLLineChartProps } from '../promql_line_chart';
import { ChartSeriesData } from '../../../common/types/service_details_types';
import { ApmCursorContext, createApmCursorBus } from '../../hooks/apm_cursor_context';
import { navigateToExploreMetrics } from '../../utils/navigation_utils';

// Mock ECharts — the instance exposes the full interaction API the component uses
// (getZr / on / off / dispatchAction / convert*/ getModel), plus graphic shapes.
const mockSetOption = jest.fn();
const mockShowLoading = jest.fn();
const mockHideLoading = jest.fn();
const mockDispose = jest.fn();
const mockResize = jest.fn();
const mockOn = jest.fn();
const mockOff = jest.fn();
const mockDispatchAction = jest.fn();
const mockConvertToPixel = jest.fn(() => [10, 10]);
const mockConvertFromPixel = jest.fn(() => 1704067230000);
const mockIsDisposed = jest.fn(() => false);
const mockZr = { on: jest.fn(), off: jest.fn(), add: jest.fn(), remove: jest.fn() };
const mockGetZr = jest.fn(() => mockZr);
const mockGetModel = jest.fn(() => ({
  getComponent: jest.fn(() => ({
    coordinateSystem: { getRect: () => ({ x: 0, y: 0, width: 200, height: 100 }) },
  })),
}));

jest.mock('echarts', () => ({
  init: jest.fn(() => ({
    setOption: mockSetOption,
    showLoading: mockShowLoading,
    hideLoading: mockHideLoading,
    dispose: mockDispose,
    resize: mockResize,
    on: mockOn,
    off: mockOff,
    dispatchAction: mockDispatchAction,
    getZr: mockGetZr,
    convertToPixel: mockConvertToPixel,
    convertFromPixel: mockConvertFromPixel,
    isDisposed: mockIsDisposed,
    getModel: mockGetModel,
  })),
  graphic: {
    LinearGradient: jest.fn(),
    Line: jest.fn(() => ({ attr: jest.fn() })),
    Circle: jest.fn(() => ({ attr: jest.fn() })),
  },
}));

// Mock the usePromQLChartData hook
const mockUsePromQLChartData = jest.fn();
jest.mock('../../hooks/use_promql_chart_data', () => ({
  usePromQLChartData: (params: any) => mockUsePromQLChartData(params),
  isResolutionExceededError: jest.fn(() => false),
  RESOLUTION_EXCEEDED_CODE: 'RESOLUTION_EXCEEDED',
}));

// Mock the deep-link helper so clicking the "Open in metrics" button is assertable
// without pulling in coreRefs/window.open.
jest.mock('../../utils/navigation_utils', () => ({
  navigateToExploreMetrics: jest.fn(),
}));

// Mock euiThemeVars
jest.mock('@osd/ui-shared-deps/theme', () => ({
  euiThemeVars: {
    euiColorDarkShade: '#69707d',
    euiColorEmptyShade: '#ffffff',
    euiColorLightShade: '#d3dae6',
    euiColorMediumShade: '#98a2b3',
    euiColorLightestShade: '#f5f7fa',
    euiColorPrimary: '#006bb4',
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

  describe('seriesLabel prop', () => {
    it('should override series name when seriesLabel is provided and there is one series', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: [
          { name: '{}', data: [{ timestamp: 1704067200000, value: 100 }], color: '#54b399' },
        ],
        isLoading: false,
        error: null,
      });

      render(<PromQLLineChart {...defaultProps} seriesLabel="Requests" />);

      expect(mockSetOption).toHaveBeenCalled();
      const setOptionCall = mockSetOption.mock.calls[0][0];
      expect(setOptionCall.series[0].name).toBe('Requests');
    });

    it('should not override series names when there are multiple series', () => {
      const multiSeries: ChartSeriesData[] = [
        { name: 'p99', data: [{ timestamp: 1704067200000, value: 100 }], color: '#54b399' },
        { name: 'p90', data: [{ timestamp: 1704067200000, value: 80 }], color: '#d36086' },
      ];

      mockUsePromQLChartData.mockReturnValue({
        series: multiSeries,
        isLoading: false,
        error: null,
      });

      render(<PromQLLineChart {...defaultProps} seriesLabel="Requests" />);

      expect(mockSetOption).toHaveBeenCalled();
      const setOptionCall = mockSetOption.mock.calls[0][0];
      expect(setOptionCall.series[0].name).toBe('p99');
      expect(setOptionCall.series[1].name).toBe('p90');
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

  describe('x-axis overlap fix (#6)', () => {
    it('should set hideOverlap on the x-axis labels', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: mockSeriesData,
        isLoading: false,
        error: null,
      });

      render(<PromQLLineChart {...defaultProps} />);

      const setOptionCall = mockSetOption.mock.calls[0][0];
      expect(setOptionCall.xAxis.axisLabel.hideOverlap).toBe(true);
    });
  });

  describe('time brush (#2)', () => {
    it('should not add a brush component when onTimeRangeChange is absent', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: mockSeriesData,
        isLoading: false,
        error: null,
      });

      render(<PromQLLineChart {...defaultProps} />);

      const setOptionCall = mockSetOption.mock.calls[0][0];
      expect(setOptionCall.brush).toBeUndefined();
    });

    it('should add a lineX brush and report the selection as ISO strings', () => {
      const onTimeRangeChange = jest.fn();
      mockUsePromQLChartData.mockReturnValue({
        series: mockSeriesData,
        isLoading: false,
        error: null,
      });

      render(<PromQLLineChart {...defaultProps} onTimeRangeChange={onTimeRangeChange} />);

      const setOptionCall = mockSetOption.mock.calls[0][0];
      expect(setOptionCall.brush).toEqual({ toolbox: ['lineX'], xAxisIndex: 0 });

      // Grab the brushEnd handler the component registered and invoke it.
      const brushEndCalls = mockOn.mock.calls.filter((c) => c[0] === 'brushEnd');
      expect(brushEndCalls.length).toBeGreaterThan(0);
      const handler = brushEndCalls[brushEndCalls.length - 1][1];
      handler({ areas: [{ coordRange: [1704067200000, 1704067320000] }] });

      expect(onTimeRangeChange).toHaveBeenCalledWith(
        new Date(1704067200000).toISOString(),
        new Date(1704067320000).toISOString()
      );
    });
  });

  describe('legend isolate (#7)', () => {
    it('should isolate the clicked series by unselecting the others', () => {
      const multiSeries: ChartSeriesData[] = [
        { name: 'p99', data: [{ timestamp: 1704067200000, value: 100 }], color: '#54b399' },
        { name: 'p90', data: [{ timestamp: 1704067200000, value: 80 }], color: '#d36086' },
        { name: 'p50', data: [{ timestamp: 1704067200000, value: 60 }], color: '#e7664c' },
      ];
      mockUsePromQLChartData.mockReturnValue({
        series: multiSeries,
        isLoading: false,
        error: null,
      });

      render(<PromQLLineChart {...defaultProps} />);

      const legendCalls = mockOn.mock.calls.filter((c) => c[0] === 'legendselectchanged');
      expect(legendCalls.length).toBeGreaterThan(0);
      const handler = legendCalls[legendCalls.length - 1][1];

      mockDispatchAction.mockClear();
      handler({ name: 'p99' });

      // p99 selected, p90 + p50 unselected (hidden).
      expect(mockDispatchAction).toHaveBeenCalledWith({ type: 'legendSelect', name: 'p99' });
      expect(mockDispatchAction).toHaveBeenCalledWith({ type: 'legendUnSelect', name: 'p90' });
      expect(mockDispatchAction).toHaveBeenCalledWith({ type: 'legendUnSelect', name: 'p50' });
    });

    it('should not wire legend isolation for a single-series chart', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: mockSeriesData,
        isLoading: false,
        error: null,
      });

      render(<PromQLLineChart {...defaultProps} />);

      const legendCalls = mockOn.mock.calls.filter((c) => c[0] === 'legendselectchanged');
      expect(legendCalls.length).toBe(0);
    });
  });

  describe('open in Discover metrics (#8)', () => {
    it('should render the deep-link button and open Explore metrics on click', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: mockSeriesData,
        isLoading: false,
        error: null,
      });

      const { container } = render(<PromQLLineChart {...defaultProps} title="Request Rate" />);

      const button = container.querySelector('[data-test-subj="openInMetrics-request-rate"]');
      expect(button).toBeInTheDocument();

      fireEvent.click(button as Element);
      expect(navigateToExploreMetrics).toHaveBeenCalledWith(
        'rate(http_requests_total[5m])',
        'prometheus-1',
        { from: 'now-1h', to: 'now' }
      );
    });

    it('should not render the deep-link button when showOpenInMetrics is false', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: mockSeriesData,
        isLoading: false,
        error: null,
      });

      const { container } = render(
        <PromQLLineChart {...defaultProps} title="Request Rate" showOpenInMetrics={false} />
      );

      expect(
        container.querySelector('[data-test-subj="openInMetrics-request-rate"]')
      ).not.toBeInTheDocument();
    });
  });

  describe('synced crosshair (#3)', () => {
    it('should register zrender overlay handlers when inside a cursor provider', () => {
      mockUsePromQLChartData.mockReturnValue({
        series: mockSeriesData,
        isLoading: false,
        error: null,
      });

      const bus = createApmCursorBus();
      render(
        <ApmCursorContext.Provider value={bus}>
          <PromQLLineChart {...defaultProps} />
        </ApmCursorContext.Provider>
      );

      // Overlay shapes added to the zrender layer + mousemove/globalout wired.
      expect(mockGetZr).toHaveBeenCalled();
      expect(mockZr.add).toHaveBeenCalled();
      expect(mockZr.on).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(mockZr.on).toHaveBeenCalledWith('globalout', expect.any(Function));
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
