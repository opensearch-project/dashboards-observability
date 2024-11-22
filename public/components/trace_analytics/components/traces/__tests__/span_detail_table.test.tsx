/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { waitFor } from '@testing-library/react';
import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { HttpResponse } from '../../../../../../../../src/core/public';
import { TEST_JAEGER_SPAN_RESPONSE, TEST_SPAN_RESPONSE } from '../../../../../../test/constants';
import { SpanDetailTable, SpanDetailTableHierarchy } from '../span_detail_table';

jest.mock('../../../../../../test/__mocks__/httpClientMock', () => ({
  post: jest.fn(),
}));

const httpClientMock = jest.requireMock('../../../../../../test/__mocks__/httpClientMock');

describe('<SpanDetailTable /> spec', () => {
  configure({ adapter: new Adapter() });

  it('renders the empty component', async () => {
    httpClientMock.post.mockResolvedValue(({
      hits: { hits: [], total: { value: 0 } },
    } as unknown) as HttpResponse);
    const utils = await mount(
      <SpanDetailTable
        http={httpClientMock}
        hiddenColumns={['traceId', 'traceGroup']}
        DSL={{}}
        openFlyout={() => {}}
        mode="data_prepper"
        dataSourceMDSId="testDataSource"
      />
    );
    utils.update();
    await waitFor(() => {
      expect(utils).toMatchSnapshot();
    });
  });

  it('renders the component with data', async () => {
    const setCurrentSpan = jest.fn();
    httpClientMock.post.mockResolvedValue((TEST_SPAN_RESPONSE as unknown) as HttpResponse);
    const container = document.createElement('div');
    await act(() => {
      ReactDOM.render(
        <SpanDetailTable
          http={httpClientMock}
          hiddenColumns={['traceId', 'traceGroup']}
          DSL={{}}
          openFlyout={(spanId: string) => setCurrentSpan(spanId)}
          mode="data_prepper"
          dataSourceMDSId="testDataSource"
        />,
        container
      );
    });
    expect(container).toMatchSnapshot();
  });

  it('renders the jaeger component with data', async () => {
    const setCurrentSpan = jest.fn();
    httpClientMock.post.mockResolvedValue((TEST_JAEGER_SPAN_RESPONSE as unknown) as HttpResponse);
    const container = document.createElement('div');
    await act(() => {
      ReactDOM.render(
        <SpanDetailTable
          http={httpClientMock}
          hiddenColumns={['traceID', 'traceGroup']}
          DSL={{}}
          openFlyout={(spanId: string) => setCurrentSpan(spanId)}
          mode="jaeger"
          dataSourceMDSId="testDataSource"
        />,
        container
      );
    });
    expect(container).toMatchSnapshot();
  });
});

describe('<SpanDetailTableHierarchy /> spec', () => {
  configure({ adapter: new Adapter() });

  it('renders the empty component', async () => {
    httpClientMock.post.mockResolvedValue(({
      hits: { hits: [], total: { value: 0 } },
    } as unknown) as HttpResponse);
    const utils = await mount(
      <SpanDetailTableHierarchy
        http={httpClientMock}
        hiddenColumns={['traceId', 'traceGroup']}
        DSL={{}}
        openFlyout={() => {}}
        mode="data_prepper"
        dataSourceMDSId="testDataSource"
      />
    );
    utils.update();
    await waitFor(() => {
      expect(utils).toMatchSnapshot();
    });
  });

  it('renders the component with data', async () => {
    const setCurrentSpan = jest.fn();
    httpClientMock.post.mockResolvedValue((TEST_SPAN_RESPONSE as unknown) as HttpResponse);
    const container = document.createElement('div');
    await act(() => {
      ReactDOM.render(
        <SpanDetailTableHierarchy
          http={httpClientMock}
          hiddenColumns={['traceId', 'traceGroup']}
          DSL={{}}
          openFlyout={(spanId: string) => setCurrentSpan(spanId)}
          mode="data_prepper"
          dataSourceMDSId="testDataSource"
        />,
        container
      );
    });
    expect(container).toMatchSnapshot();
  });

  it('renders the jaeger component with data', async () => {
    const setCurrentSpan = jest.fn();
    httpClientMock.post.mockResolvedValue((TEST_JAEGER_SPAN_RESPONSE as unknown) as HttpResponse);
    const container = document.createElement('div');
    await act(() => {
      ReactDOM.render(
        <SpanDetailTableHierarchy
          http={httpClientMock}
          hiddenColumns={['traceID', 'traceGroup']}
          DSL={{}}
          openFlyout={(spanId: string) => setCurrentSpan(spanId)}
          mode="jaeger"
          dataSourceMDSId="testDataSource"
        />,
        container
      );
    });
    expect(container).toMatchSnapshot();
  });
});
