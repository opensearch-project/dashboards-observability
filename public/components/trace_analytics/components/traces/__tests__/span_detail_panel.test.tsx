/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount, shallow } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { SpanDetailPanel } from '../span_detail_panel';
import { HttpSetup } from '../../../../../../../../src/core/public';

configure({ adapter: new Adapter() });

const mockHttp = ({
  post: jest.fn(),
} as unknown) as HttpSetup;

const mockData = {
  traceId: 'trace1',
  spanId: 'span1',
  parentSpanId: 'span0',
  operationName: 'GET /api/users',
  serviceName: 'user-service',
  startTime: 1640995200000,
  endTime: 1640995210000,
  duration: 10000,
  tags: {
    'http.method': 'GET',
    'http.url': '/api/users',
    'http.status_code': 200,
    component: 'spring-web',
  },
  process: {
    serviceName: 'user-service',
    tags: {
      'jaeger.version': '1.35.0',
      hostname: 'user-service-pod-123',
    },
  },
};

const mockProps = {
  http: mockHttp,
  traceId: 'trace1',
  colorMap: { service1: '#7492e7' },
  mode: 'data_prepper' as const,
  dataSourceMDSId: 'mock-id',
  dataSourceMDSLabel: 'mock-label',
  spanFilters: [],
  setSpanFiltersWithStorage: jest.fn(),
  onSpanClick: jest.fn(),
  payloadData: JSON.stringify(mockData),
};

describe('SpanDetailPanel component', () => {
  it('renders correctly with default props', () => {
    const wrapper = shallow(<SpanDetailPanel {...mockProps} />);
    expect(wrapper).toMatchSnapshot();
  });

  it('displays loading chart when isLoading is true', () => {
    const wrapper = mount(<SpanDetailPanel {...mockProps} isLoading={true} />);
    expect(wrapper.find('EuiLoadingChart')).toHaveLength(1);
  });

  it('does not display loading chart when isLoading is false', () => {
    const wrapper = mount(<SpanDetailPanel {...mockProps} isLoading={false} />);
    expect(wrapper.find('EuiLoadingChart')).toHaveLength(0);
  });
});
