/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiSmallButton } from '@elastic/eui';
import { waitFor } from '@testing-library/react';
import { configure, mount, shallow } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { Plt } from '../../../../visualizations/plotly/plot';
import { SpanDetailPanel } from '../span_detail_panel';

configure({ adapter: new Adapter() });

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
};

describe('SpanDetailPanel component', () => {
  it('renders correctly with default props', () => {
    const wrapper = shallow(<SpanDetailPanel {...mockProps} />);
    expect(wrapper).toMatchSnapshot();
  });

  it('displays loading chart initially', () => {
    const wrapper = mount(<SpanDetailPanel {...mockProps} />);
    expect(wrapper.find('EuiLoadingChart')).toHaveLength(1);
  });

  it('renders gantt chart and mini-map correctly', async () => {
    const wrapper = mount(<SpanDetailPanel {...mockProps} />);

    expect(wrapper.find('EuiLoadingChart')).toHaveLength(1); // Ensure loading state appears

    await waitFor(() => {
      wrapper.update();
      expect(wrapper.find(Plt)).toHaveLength(2); // Gantt chart and mini-map appear
    });
  });

  it('handles zoom reset button correctly', async () => {
    const wrapper = mount(<SpanDetailPanel {...mockProps} />);

    await waitFor(() => {
      wrapper.update();
      expect(wrapper.find(Plt)).toHaveLength(2); // Gantt chart and mini-map appear
    });
    // Verify that the reset button is initially disabled
    let resetButton = wrapper
      .find(EuiSmallButton)
      .filterWhere((btn) => btn.text().includes('Reset zoom'));
    expect(resetButton.prop('isDisabled')).toBe(true);

    // Simulate a click on the mini-map
    const miniMap = wrapper.find('[data-test-subj="mocked-plt"]').at(0);
    act(() => {
      miniMap.simulate('click');
    });

    await waitFor(() => {
      wrapper.update();
      resetButton = wrapper
        .find(EuiSmallButton)
        .filterWhere((btn) => btn.text().includes('Reset zoom'));
      expect(resetButton.prop('isDisabled')).toBe(false); // Should now be enabled
    });

    // Simulate clicking the reset button
    act(() => {
      resetButton.prop('onClick')!();
    });

    await waitFor(() => {
      wrapper.update();
      resetButton = wrapper
        .find(EuiSmallButton)
        .filterWhere((btn) => btn.text().includes('Reset zoom'));
      expect(resetButton.prop('isDisabled')).toBe(true); // Should reset
    });
  });

  it('handles user-defined zoom range via mini-map', async () => {
    const wrapper = mount(<SpanDetailPanel {...mockProps} />);

    await waitFor(() => {
      wrapper.update();
      expect(wrapper.find(Plt)).toHaveLength(2); // Gantt chart and mini-map appear
    });

    // Find the mini-map and simulate click
    const miniMap = wrapper.find('[data-test-subj="mocked-plt"]').at(0);
    act(() => {
      miniMap.simulate('click');
    });

    await waitFor(() => {
      wrapper.update();
      const resetButton = wrapper
        .find(EuiSmallButton)
        .filterWhere((btn) => btn.text().includes('Reset zoom'));
      expect(resetButton.prop('isDisabled')).toBe(false);
    });
  });
});
