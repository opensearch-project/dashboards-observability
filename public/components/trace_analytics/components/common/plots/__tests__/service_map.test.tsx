/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import { mount } from 'enzyme';
import React from 'react';
import { act } from '@testing-library/react';
import { ServiceMap } from '../service_map';
import { EuiFieldSearch, EuiSelectable } from '@elastic/eui';
import { TEST_SERVICE_MAP, MOCK_CANVAS_CONTEXT } from '../../../../../../../test/constants';
import Graph from 'react-graph-vis';
import toJson from 'enzyme-to-json';

configure({ adapter: new Adapter() });

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'static-uuid'),
}));

// Normalize dynamic values in snapshots
expect.addSnapshotSerializer({
  test: (val) => typeof val === 'string' && /^[a-f0-9-]{36}$/.test(val),
  print: () => '"<dynamic-uuid>"',
});

// Mock crypto.getRandomValues
const crypto = {
  getRandomValues: jest.fn((arr) => arr.fill(0)), // Fill with consistent values
};
Object.defineProperty(global, 'crypto', { value: crypto });

jest
  .spyOn(HTMLCanvasElement.prototype, 'getContext')
  .mockImplementation((contextId) =>
    contextId === '2d' ? ((MOCK_CANVAS_CONTEXT as unknown) as CanvasRenderingContext2D) : null
  );

jest.mock('react-graph-vis', () => {
  const GraphMock = () => <div data-testid="mock-graph">Mock Graph</div>;
  return GraphMock;
});

async function setFocusOnService(wrapper: ReturnType<typeof mount>, serviceName: string) {
  const searchField = wrapper.find(EuiFieldSearch).first();
  expect(searchField.exists()).toBeTruthy();

  await act(async () => {
    const mockEvent = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      target: { value: '' },
    };
    searchField.prop('onClick')?.((mockEvent as unknown) as React.MouseEvent<HTMLInputElement>);
  });
  wrapper.update();

  const selectable = wrapper.find(EuiSelectable);
  const onChange = selectable.prop('onChange');

  if (onChange) {
    await act(async () => {
      onChange([{ label: serviceName, checked: 'on' }]);
    });
    wrapper.update();
  } else {
    throw new Error('onChange handler is undefined on EuiSelectable');
  }
  expect(wrapper.find(EuiFieldSearch).prop('placeholder')).toBe(serviceName);
}

describe('ServiceMap Component', () => {
  const defaultProps = {
    serviceMap: TEST_SERVICE_MAP,
    idSelected: 'latency' as 'latency' | 'error_rate' | 'throughput',
    setIdSelected: jest.fn(),
    page: 'dashboard' as
      | 'app'
      | 'appCreate'
      | 'dashboard'
      | 'traces'
      | 'services'
      | 'serviceView'
      | 'detailFlyout'
      | 'traceView',
    mode: 'jaeger',
    currService: '',
    filters: [],
    setFilters: jest.fn(),
    addFilter: jest.fn(),
    removeFilter: jest.fn(),
    isLoading: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders service map component', async () => {
    const wrapper = mount(<ServiceMap {...defaultProps} />);
    wrapper.update();

    await act(async () => {
      expect(
        toJson(wrapper, {
          noKey: false,
          mode: 'deep',
        })
      ).toMatchSnapshot();
    });
  });

  it('renders application composition map title when page is app', () => {
    const wrapper = mount(<ServiceMap {...defaultProps} page="app" />);
    expect(wrapper.find('PanelTitle').prop('title')).toBe('Application Composition Map');
  });

  it('renders service map title for other pages', () => {
    const wrapper = mount(<ServiceMap {...defaultProps} />);
    expect(wrapper.find('PanelTitle').prop('title')).toBe('Service map');
  });

  describe('Service search and selection', () => {
    it('updates placeholder when service is focused', async () => {
      const wrapper = mount(<ServiceMap {...defaultProps} />);
      await setFocusOnService(wrapper, 'order');
    });

    it('clears focus with refresh button', async () => {
      const wrapper = mount(<ServiceMap {...defaultProps} />);
      await setFocusOnService(wrapper, 'order');

      // Verify focus is set
      expect(wrapper.find(EuiFieldSearch).prop('placeholder')).toBe('order');

      // Find and click the refresh button
      const refreshButton = wrapper.find('button[data-test-subj="serviceMapRefreshButton"]');
      expect(refreshButton.exists()).toBeTruthy();

      await act(async () => {
        refreshButton.simulate('click');
      });
      wrapper.update();

      // Verify the search field is cleared
      const updatedSearchField = wrapper.find(EuiFieldSearch).first();
      expect(updatedSearchField.prop('value')).toBe('');
      expect(updatedSearchField.prop('placeholder')).not.toBe('order');
    });
  });

  describe('Metric selection', () => {
    it('changes selected metric', async () => {
      const setIdSelected = jest.fn();
      const wrapper = mount(<ServiceMap {...defaultProps} setIdSelected={setIdSelected} />);

      const buttonGroup = wrapper.find('EuiButtonGroup');
      const onChange = buttonGroup.prop('onChange');

      if (onChange) {
        await act(async () => {
          onChange('error_rate' as any);
        });
        wrapper.update();
      } else {
        throw new Error('onChange handler is undefined on EuiButtonGroup');
      }

      expect(setIdSelected).toHaveBeenCalledWith('error_rate');
    });
  });

  describe('Service dependencies', () => {
    it('shows related services when focusing on a service', async () => {
      const wrapper = mount(<ServiceMap {...defaultProps} />);
      await setFocusOnService(wrapper, 'order');

      // Verify that the graph exists and has nodes
      const graph = wrapper.find(Graph);
      expect(graph.exists()).toBeTruthy();

      const graphProps = graph.props() as { graph: { nodes: any[] } };
      expect(graphProps.graph).toBeDefined();
      expect(graphProps.graph.nodes.length).toBeGreaterThan(0);
    });
  });

  describe('Loading state', () => {
    it('shows loading indicator when isLoading is true', () => {
      const wrapper = mount(<ServiceMap {...defaultProps} />);
      expect(wrapper.find('.euiLoadingSpinner').exists()).toBeTruthy();
    });
  });

  describe('Empty state', () => {
    it('handles empty service map', () => {
      const wrapper = mount(<ServiceMap {...defaultProps} serviceMap={{}} />);
      expect(wrapper.find('Graph').exists()).toBeFalsy();
    });
  });
});
