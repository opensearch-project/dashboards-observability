/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { configure, mount, shallow } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import { SpanDetailPanel } from '../span_detail_panel';
import { EuiButtonGroup, EuiSmallButton } from '@elastic/eui';
import { Plt } from '../../../../visualizations/plotly/plot';
import { act } from 'react-dom/test-utils';

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

  it('renders gantt chart and mini-map correctly', () => {
    const wrapper = mount(<SpanDetailPanel {...mockProps} />);
    expect(wrapper.find(Plt)).toHaveLength(2); // Gantt chart and mini-map
  });

  it('handles zoom reset button correctly', () => {
    const wrapper = mount(<SpanDetailPanel {...mockProps} />);

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

    wrapper.update();

    // Verify that the reset button is now enabled
    resetButton = wrapper
      .find(EuiSmallButton)
      .filterWhere((btn) => btn.text().includes('Reset zoom'));
    expect(resetButton.prop('isDisabled')).toBe(false); // Should now be enabled

    // Simulate clicking the reset button
    act(() => {
      resetButton.prop('onClick')!();
    });

    wrapper.update();

    // Verify that the reset button is disabled again after reset
    resetButton = wrapper
      .find(EuiSmallButton)
      .filterWhere((btn) => btn.text().includes('Reset zoom'));
    expect(resetButton.prop('isDisabled')).toBe(true);
  });

  it('handles view toggle button group', () => {
    const wrapper = mount(<SpanDetailPanel {...mockProps} />);
    const toggleButtons = wrapper.find(EuiButtonGroup);
    expect(toggleButtons).toHaveLength(1);

    // Verify initial state is 'timeline'
    expect(toggleButtons.prop('idSelected')).toBe('timeline');

    // Simulate changing the toggle
    act(() => {
      toggleButtons.prop('onChange')!('span_list');
    });

    wrapper.update();

    // Verify the toggle button group has been updated
    const updatedToggleButtons = wrapper.find(EuiButtonGroup);
    expect(updatedToggleButtons.prop('idSelected')).toBe('span_list');
  });

  it('handles user-defined zoom range via mini-map', () => {
    const wrapper = mount(<SpanDetailPanel {...mockProps} />);

    // Find the mini-map and simulate click
    const miniMap = wrapper.find('[data-test-subj="mocked-plt"]').at(0);
    act(() => {
      miniMap.simulate('click');
    });

    wrapper.update();

    // After zooming, the reset button should be enabled
    const resetButton = wrapper
      .find(EuiSmallButton)
      .filterWhere((btn) => btn.text().includes('Reset zoom'));
    expect(resetButton.prop('isDisabled')).toBe(false);
  });
});
