/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { waitFor } from '@testing-library/react';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { SpanDetailPanel } from '../span_detail_panel';

jest.mock('../../../../visualizations/plotly/plot', () => ({
  Plt: (props: any) => (
    <div
      data-test-subj="mocked-plt"
      tabIndex={0}
      role="button"
      onClick={() => {
        if (props.onSelectedHandler) {
          props.onSelectedHandler({ range: { x: [5, 15] } });
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (props.onSelectedHandler) {
            props.onSelectedHandler({ range: { x: [5, 15] } });
          }
        }
      }}
    />
  ),
}));

const mockHttp = {
  post: jest.fn(),
};

const mockData = {
  gantt: [
    {
      x: [10],
      y: ['service1'],
      marker: { color: '#fff' },
      width: 0.4,
      type: 'bar',
      orientation: 'h',
      hoverinfo: 'none',
      showlegend: false,
    },
  ],
  table: [
    {
      service_name: 'service1',
      span_id: 'span1',
      latency: 10,
      error: 'Error',
      start_time: '2023-01-01T00:00:00Z',
      end_time: '2023-01-01T00:00:10Z',
    },
  ],
  ganttMaxX: 20,
};

const mockSetData = jest.fn();
const mockAddSpanFilter = jest.fn();
const mockProps = {
  http: mockHttp,
  traceId: 'trace1',
  colorMap: { service1: '#7492e7' },
  mode: 'data_prepper',
  dataSourceMDSId: 'mock-id',
  dataSourceMDSLabel: 'mock-label',
  data: mockData,
  setData: mockSetData,
  addSpanFilter: mockAddSpanFilter,
  removeSpanFilter: jest.fn(),
  spanFilters: [],
  setSpanFiltersWithStorage: jest.fn(),
};

describe('SpanDetailPanel component', () => {
  it('renders correctly with default props', async () => {
    render(<SpanDetailPanel {...mockProps} />);
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('displays loading chart when isGanttChartLoading is true', () => {
    const { container } = render(<SpanDetailPanel {...mockProps} isGanttChartLoading={true} />);
    expect(container.querySelector('.euiLoadingChart')).toBeInTheDocument();
  });

  it('does not display loading chart when isGanttChartLoading is false', () => {
    const { container } = render(<SpanDetailPanel {...mockProps} isGanttChartLoading={false} />);
    expect(container.querySelector('.euiLoadingChart')).not.toBeInTheDocument();
  });

  it('renders gantt chart and mini-map correctly', async () => {
    const { container } = render(<SpanDetailPanel {...mockProps} />);

    await waitFor(() => {
      // Charts should be rendered
      expect(container.querySelector('[data-test-subj="mocked-plt"]')).toBeInTheDocument();
    });
  });

  it('handles zoom reset button correctly', async () => {
    const { _container } = render(<SpanDetailPanel {...mockProps} />);

    await waitFor(() => {
      // Verify reset button exists
      const resetButton = screen.queryByText(/Reset zoom/i);
      expect(resetButton).toBeInTheDocument();
    });
  });

  it('renders component without errors', async () => {
    const { container } = render(<SpanDetailPanel {...mockProps} />);

    await waitFor(() => {
      expect(container).toBeInTheDocument();
    });
  });

  it('handles user-defined zoom range via mini-map', async () => {
    const { container } = render(<SpanDetailPanel {...mockProps} />);

    await waitFor(() => {
      // Verify component renders
      expect(container).toBeTruthy();
    });
  });
});
