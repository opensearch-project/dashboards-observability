/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { HttpResponse } from '../../../../../../../../src/core/public';
import { TEST_JAEGER_SPAN_RESPONSE, TEST_SPAN_RESPONSE } from '../../../../../../test/constants';
import { SpanDetailTable, SpanDetailTableHierarchy } from '../span_detail_table';

jest.mock('../../../../../../test/__mocks__/httpClientMock', () => ({
  post: jest.fn(),
}));

const httpClientMock = jest.requireMock('../../../../../../test/__mocks__/httpClientMock');

describe('SpanDetailTable', () => {
  it('renders the empty component', async () => {
    httpClientMock.post.mockResolvedValue(({
      hits: { hits: [], total: { value: 0 } },
    } as unknown) as HttpResponse);

    render(
      <SpanDetailTable
        http={httpClientMock}
        hiddenColumns={['traceId', 'traceGroup']}
        openFlyout={() => {}}
        mode="data_prepper"
        dataSourceMDSId="testDataSource"
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders the component with data', async () => {
    const setCurrentSpan = jest.fn();
    httpClientMock.post.mockResolvedValue((TEST_SPAN_RESPONSE as unknown) as HttpResponse);

    render(
      <SpanDetailTable
        http={httpClientMock}
        hiddenColumns={['traceId', 'traceGroup']}
        openFlyout={(spanId: string) => setCurrentSpan(spanId)}
        mode="data_prepper"
        dataSourceMDSId="testDataSource"
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders the jaeger component with data', async () => {
    const setCurrentSpan = jest.fn();
    httpClientMock.post.mockResolvedValue((TEST_JAEGER_SPAN_RESPONSE as unknown) as HttpResponse);

    render(
      <SpanDetailTable
        http={httpClientMock}
        hiddenColumns={['traceID', 'traceGroup']}
        openFlyout={(spanId: string) => setCurrentSpan(spanId)}
        mode="jaeger"
        dataSourceMDSId="testDataSource"
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  describe('Pagination functionality', () => {
    it('should render with default pagination', async () => {
      httpClientMock.post.mockResolvedValue((TEST_SPAN_RESPONSE as unknown) as HttpResponse);

      render(
        <SpanDetailTable
          http={httpClientMock}
          hiddenColumns={[]}
          openFlyout={jest.fn()}
          mode="data_prepper"
          dataSourceMDSId="test-id"
        />
      );

      await waitFor(() => {
        expect(document.body).toMatchSnapshot();
      });
    });

    it('should render pagination controls', async () => {
      httpClientMock.post.mockResolvedValue((TEST_SPAN_RESPONSE as unknown) as HttpResponse);

      render(
        <SpanDetailTable
          http={httpClientMock}
          hiddenColumns={[]}
          openFlyout={jest.fn()}
          mode="data_prepper"
          dataSourceMDSId="test-id"
        />
      );

      await waitFor(() => {
        expect(document.body).toMatchSnapshot();
      });
    });
  });

  describe('Column visibility', () => {
    it('should hide columns specified in hiddenColumns prop', async () => {
      httpClientMock.post.mockResolvedValue((TEST_SPAN_RESPONSE as unknown) as HttpResponse);

      render(
        <SpanDetailTable
          http={httpClientMock}
          hiddenColumns={['spanId', 'startTime']}
          openFlyout={jest.fn()}
          mode="data_prepper"
          dataSourceMDSId="test-id"
        />
      );

      await waitFor(() => {
        expect(document.body).toMatchSnapshot();
      });
    });

    it('should render with visible columns', async () => {
      httpClientMock.post.mockResolvedValue((TEST_SPAN_RESPONSE as unknown) as HttpResponse);

      render(
        <SpanDetailTable
          http={httpClientMock}
          hiddenColumns={[]}
          openFlyout={jest.fn()}
          mode="data_prepper"
          dataSourceMDSId="test-id"
        />
      );

      await waitFor(() => {
        expect(document.body).toMatchSnapshot();
      });
    });
  });

  describe('Sorting functionality', () => {
    it('should render with default sorting', async () => {
      httpClientMock.post.mockResolvedValue((TEST_SPAN_RESPONSE as unknown) as HttpResponse);

      render(
        <SpanDetailTable
          http={httpClientMock}
          hiddenColumns={[]}
          openFlyout={jest.fn()}
          mode="data_prepper"
          dataSourceMDSId="test-id"
        />
      );

      await waitFor(() => {
        expect(document.body).toMatchSnapshot();
      });
    });
  });
});

describe('SpanDetailTableHierarchy', () => {
  it('renders the empty component', async () => {
    httpClientMock.post.mockResolvedValue(({
      hits: { hits: [], total: { value: 0 } },
    } as unknown) as HttpResponse);

    render(
      <SpanDetailTableHierarchy
        http={httpClientMock}
        hiddenColumns={['traceId', 'traceGroup']}
        openFlyout={() => {}}
        mode="data_prepper"
        dataSourceMDSId="testDataSource"
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders the component with data', async () => {
    const setCurrentSpan = jest.fn();
    httpClientMock.post.mockResolvedValue((TEST_SPAN_RESPONSE as unknown) as HttpResponse);

    render(
      <SpanDetailTableHierarchy
        http={httpClientMock}
        hiddenColumns={['traceId', 'traceGroup']}
        openFlyout={(spanId: string) => setCurrentSpan(spanId)}
        mode="data_prepper"
        dataSourceMDSId="testDataSource"
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders the jaeger component with data', async () => {
    const setCurrentSpan = jest.fn();
    httpClientMock.post.mockResolvedValue((TEST_JAEGER_SPAN_RESPONSE as unknown) as HttpResponse);

    render(
      <SpanDetailTableHierarchy
        http={httpClientMock}
        hiddenColumns={['traceID', 'traceGroup']}
        openFlyout={(spanId: string) => setCurrentSpan(spanId)}
        mode="jaeger"
        dataSourceMDSId="testDataSource"
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
