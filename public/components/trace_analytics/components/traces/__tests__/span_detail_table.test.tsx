/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiDataGridColumnVisibility,
  EuiDataGridPaginationProps,
  EuiDataGridSorting,
} from '@elastic/eui';
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

configure({ adapter: new Adapter() });

describe('SpanDetailTable', () => {
  it('renders the empty component', async () => {
    httpClientMock.post.mockResolvedValue(({
      hits: { hits: [], total: { value: 0 } },
    } as unknown) as HttpResponse);

    const wrapper = mount(
      <SpanDetailTable
        http={httpClientMock}
        hiddenColumns={['traceId', 'traceGroup']}
        openFlyout={() => {}}
        mode="data_prepper"
        dataSourceMDSId="testDataSource"
      />
    );

    wrapper.update();

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });

  it('renders the component with data', async () => {
    const setCurrentSpan = jest.fn();
    httpClientMock.post.mockResolvedValue((TEST_SPAN_RESPONSE as unknown) as HttpResponse);

    const container = document.createElement('div');
    await act(async () => {
      ReactDOM.render(
        <SpanDetailTable
          http={httpClientMock}
          hiddenColumns={['traceId', 'traceGroup']}
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
          openFlyout={(spanId: string) => setCurrentSpan(spanId)}
          mode="jaeger"
          dataSourceMDSId="testDataSource"
        />,
        container
      );
    });
    expect(container).toMatchSnapshot();
  });

  describe('Pagination functionality', () => {
    it('should handle page size changes', async () => {
      httpClientMock.post.mockResolvedValue((TEST_SPAN_RESPONSE as unknown) as HttpResponse);

      const wrapper = mount(
        <SpanDetailTable
          http={httpClientMock}
          hiddenColumns={[]}
          openFlyout={jest.fn()}
          mode="data_prepper"
          dataSourceMDSId="test-id"
        />
      );

      expect(wrapper.find('EuiLoadingSpinner')).toHaveLength(1); // Ensure loading state appears

      await act(async () => {
        await waitFor(() => {
          wrapper.update();
          // Retrieve initial pagination state
          const pagination = wrapper
            .find('EuiDataGrid')
            .prop('pagination') as EuiDataGridPaginationProps;

          expect(pagination.pageSize).not.toBe(50); // Ensure it starts with a different page size
          pagination.onChangeItemsPerPage!(50);
        });
      });

      await waitFor(() => {
        wrapper.update();
        const updatedPagination = wrapper
          .find('EuiDataGrid')
          .prop('pagination') as EuiDataGridPaginationProps;
        expect(updatedPagination.pageSize).toBe(50);
      });
    });

    it('should handle page changes', async () => {
      httpClientMock.post.mockResolvedValue((TEST_SPAN_RESPONSE as unknown) as HttpResponse);

      const wrapper = mount(
        <SpanDetailTable
          http={httpClientMock}
          hiddenColumns={[]}
          openFlyout={jest.fn()}
          mode="data_prepper"
          dataSourceMDSId="test-id"
        />
      );

      expect(wrapper.find('EuiLoadingSpinner')).toHaveLength(1); // Ensure loading state appears

      await act(async () => {
        await waitFor(() => {
          wrapper.update();
          const pagination = wrapper
            .find('EuiDataGrid')
            .prop('pagination') as EuiDataGridPaginationProps;
          pagination.onChangePage!(1);
        });
      });

      await waitFor(() => {
        wrapper.update();
        const updatedPagination = wrapper
          .find('EuiDataGrid')
          .prop('pagination') as EuiDataGridPaginationProps;
        expect(updatedPagination.pageIndex).toBe(1);
      });
    });
  });

  describe('Column visibility', () => {
    it('should hide columns specified in hiddenColumns prop', async () => {
      const wrapper = mount(
        <SpanDetailTable
          http={httpClientMock}
          hiddenColumns={['spanId', 'startTime']}
          openFlyout={jest.fn()}
          mode="data_prepper"
          dataSourceMDSId="test-id"
        />
      );

      await waitFor(() => {
        wrapper.update();
        const columnVisibility = wrapper
          .find('EuiDataGrid')
          .prop('columnVisibility') as EuiDataGridColumnVisibility;
        expect(columnVisibility.visibleColumns).not.toContain('spanId');
        expect(columnVisibility.visibleColumns).not.toContain('startTime');
      });
    });

    it('should update visible columns when column visibility changes', async () => {
      const wrapper = mount(
        <SpanDetailTable
          http={httpClientMock}
          hiddenColumns={[]}
          openFlyout={jest.fn()}
          mode="data_prepper"
          dataSourceMDSId="test-id"
        />
      );

      const newVisibleColumns = ['spanId', 'serviceName'];

      await act(async () => {
        await waitFor(() => {
          wrapper.update();
          const columnVisibility = wrapper
            .find('EuiDataGrid')
            .prop('columnVisibility') as EuiDataGridColumnVisibility;
          columnVisibility.setVisibleColumns!(newVisibleColumns);
        });
      });

      await waitFor(() => {
        wrapper.update();
        const updatedColumnVisibility = wrapper
          .find('EuiDataGrid')
          .prop('columnVisibility') as EuiDataGridColumnVisibility;
        expect(updatedColumnVisibility.visibleColumns).toEqual(newVisibleColumns);
      });
    });
  });

  describe('Sorting functionality', () => {
    it('should handle sort changes', async () => {
      const wrapper = mount(
        <SpanDetailTable
          http={httpClientMock}
          hiddenColumns={[]}
          openFlyout={jest.fn()}
          mode="data_prepper"
          dataSourceMDSId="test-id"
        />
      );

      const newSorting = [{ id: 'startTime', direction: 'desc' }];
      await act(async () => {
        await waitFor(() => {
          wrapper.update();
          const sorting = wrapper.find('EuiDataGrid').prop('sorting') as EuiDataGridSorting;
          sorting.onSort!(newSorting);
        });
      });

      await waitFor(() => {
        wrapper.update();
        const updatedSorting = wrapper.find('EuiDataGrid').prop('sorting') as EuiDataGridSorting;
        expect(updatedSorting.columns).toEqual(newSorting);
      });
    });
  });
});

describe('SpanDetailTableHierarchy', () => {
  configure({ adapter: new Adapter() });

  it('renders the empty component', async () => {
    httpClientMock.post.mockResolvedValue(({
      hits: { hits: [], total: { value: 0 } },
    } as unknown) as HttpResponse);
    const utils = await mount(
      <SpanDetailTableHierarchy
        http={httpClientMock}
        hiddenColumns={['traceId', 'traceGroup']}
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
