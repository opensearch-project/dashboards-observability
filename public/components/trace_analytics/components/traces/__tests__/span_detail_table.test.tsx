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
import {
  EuiDataGridPaginationProps,
  EuiDataGridSorting,
  EuiDataGridColumnVisibility,
} from '@elastic/eui';

jest.mock('../../../../../../test/__mocks__/httpClientMock', () => ({
  post: jest.fn(),
}));

const httpClientMock = jest.requireMock('../../../../../../test/__mocks__/httpClientMock');

configure({ adapter: new Adapter() });

describe.only('SpanDetailTable with Mocked Data', () => {
  it('renders the table with mocked data', async () => {
    // Mock the HTTP response
    httpClientMock.post.mockResolvedValue((TEST_SPAN_RESPONSE as unknown) as HttpResponse);

    const wrapper = mount(
      <SpanDetailTable
        http={httpClientMock}
        hiddenColumns={['traceId', 'traceGroup']}
        DSL={{}}
        openFlyout={() => {}}
        mode="data_prepper"
        dataSourceMDSId="testDataSource"
      />
    );

    // Wait for the table to render
    await waitFor(() => {
      wrapper.update();
      expect(wrapper.find('EuiDataGrid')).toHaveLength(1); // Ensure the table is rendered
    });
      // Check that the table has rows
    const tableRows = wrapper.find('[data-test-subj="dataGridRowCell"]').hostNodes();
    expect(tableRows).toHaveLength(3); // Replace 10 with the expected number of rows
  });
});

describe('SpanDetailTable', () => {
  it('renders the empty component', async () => {
    httpClientMock.post.mockResolvedValue(({
      hits: { hits: [], total: { value: 0 } },
    } as unknown) as HttpResponse);

    const wrapper = mount(
      <SpanDetailTable
        http={httpClientMock}
        hiddenColumns={['traceId', 'traceGroup']}
        DSL={{}}
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

      const pagination = wrapper
        .find('EuiDataGrid')
        .prop('pagination') as EuiDataGridPaginationProps;

      await act(async () => {
        pagination.onChangeItemsPerPage!(50);
      });

      wrapper.update();

      const updatedPagination = wrapper
        .find('EuiDataGrid')
        .prop('pagination') as EuiDataGridPaginationProps;
      expect(updatedPagination.pageSize).toBe(50);
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

      const pagination = wrapper
        .find('EuiDataGrid')
        .prop('pagination') as EuiDataGridPaginationProps;

      await act(async () => {
        pagination.onChangePage!(1);
      });

      wrapper.update();

      const updatedPagination = wrapper
        .find('EuiDataGrid')
        .prop('pagination') as EuiDataGridPaginationProps;
      expect(updatedPagination.pageIndex).toBe(1);
    });
  });

  describe('Column visibility', () => {
    it('should hide columns specified in hiddenColumns prop', () => {
      const wrapper = mount(
        <SpanDetailTable
          http={httpClientMock}
          hiddenColumns={['spanId', 'startTime']}
          openFlyout={jest.fn()}
          mode="data_prepper"
          dataSourceMDSId="test-id"
        />
      );

      const columnVisibility = wrapper
        .find('EuiDataGrid')
        .prop('columnVisibility') as EuiDataGridColumnVisibility;
      const visibleColumns = columnVisibility.visibleColumns;

      expect(visibleColumns).not.toContain('spanId');
      expect(visibleColumns).not.toContain('startTime');
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

      const columnVisibility = wrapper
        .find('EuiDataGrid')
        .prop('columnVisibility') as EuiDataGridColumnVisibility;

      await act(async () => {
        columnVisibility.setVisibleColumns!(newVisibleColumns);
      });

      wrapper.update();

      const updatedColumnVisibility = wrapper
        .find('EuiDataGrid')
        .prop('columnVisibility') as EuiDataGridColumnVisibility;
      expect(updatedColumnVisibility.visibleColumns).toEqual(newVisibleColumns);
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

      const newSorting: Array<{ id: string; direction: 'asc' | 'desc' }> = [
        { id: 'startTime', direction: 'desc' },
      ];

      const sorting = wrapper.find('EuiDataGrid').prop('sorting') as EuiDataGridSorting;

      await act(async () => {
        sorting.onSort!(newSorting);
      });

      wrapper.update();

      const updatedSorting = wrapper.find('EuiDataGrid').prop('sorting') as EuiDataGridSorting;
      expect(updatedSorting.columns).toEqual(newSorting);
    });

    it('should disable sorting in Jaeger mode', () => {
      const wrapper = mount(
        <SpanDetailTable
          http={httpClientMock}
          hiddenColumns={[]}
          openFlyout={jest.fn()}
          mode="jaeger"
          dataSourceMDSId="test-id"
        />
      );

      expect(wrapper.find('EuiDataGrid').prop('sorting')).toBeUndefined();
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

  it.only('should expand all rows when "Expand All" is clicked', async () => {
    // Mock HTTP response with data
    httpClientMock.post.mockResolvedValue((TEST_SPAN_RESPONSE as unknown) as HttpResponse);

    const wrapper = mount(
      <SpanDetailTableHierarchy
        http={httpClientMock}
        hiddenColumns={[]}
        openFlyout={jest.fn()}
        mode="data_prepper"
        dataSourceMDSId="testDataSource"
      />
    );

    // Wait for the component to render
    await waitFor(() => {
      wrapper.update();
      expect(wrapper.find('EuiDataGrid')).toHaveLength(1);
    });

    const densitybuttonz = wrapper.find('[data-test-subj="dataGridStyleSelectorPopover"]').hostNodes();
    console.log("Density button", densitybuttonz.length);
    const expandAllButton1 = wrapper.find('[data-test-subj="treeExpandAll"]').hostNodes();
    const collapseAllButton1 = wrapper.find('[data-test-subj="treeCollapseAll"]').hostNodes();
    wrapper.update();
    await waitFor(() => {
      
      expect(wrapper.find('EuiDataGrid')).toHaveLength(1); // Ensure the table is rendered
    });
    
    // Simulate clicking the "Expand All" button
    const expandAllButton = wrapper
      .find('[data-test-subj="treeExpandAll"]')
      .hostNodes();
    expect(expandAllButton).toHaveLength(1);

    act(() => {
      expandAllButton.simulate('click');
    });

    wrapper.update();

    // Check that all rows are expanded
    const expandedRows = wrapper.find('EuiIcon[type="arrowDown"]').length;
    expect(expandedRows).toBeGreaterThan(0);
  });

  it.only('should collapse all rows when "Collapse All" is clicked', async () => {
    // Mock HTTP response with data
    httpClientMock.post.mockResolvedValue((TEST_SPAN_RESPONSE as unknown) as HttpResponse);

    const wrapper = mount(
      <SpanDetailTableHierarchy
        http={httpClientMock}
        hiddenColumns={[]}
        openFlyout={jest.fn()}
        mode="data_prepper"
        dataSourceMDSId="testDataSource"
      />
    );

    // Wait for the component to render
    await waitFor(() => {
      wrapper.update();
      expect(wrapper.find('EuiDataGrid')).toHaveLength(1);
    });

  // Check that the table has rows
  const tableRows = wrapper.find('[data-test-subj="dataGridRowCell"]').hostNodes();
  expect(tableRows).toHaveLength(10); // Replace 10 with the expected number of rows

    // Simulate clicking the "Expand All" button first to expand all rows
    const expandAllButton = wrapper
      .find('[data-test-subj="treeExpandAll"]')
      .hostNodes();
    act(() => {
      expandAllButton.simulate('click');
    });

    wrapper.update();

    // Simulate clicking the "Collapse All" button
    const collapseAllButton = wrapper
      .find('[data-test-subj="treeCollapseAll"]')
      .hostNodes();
    expect(collapseAllButton).toHaveLength(1);

    act(() => {
      collapseAllButton.simulate('click');
    });

    wrapper.update();

    // Check that all rows are collapsed
    const expandedRows = wrapper.find('EuiIcon[type="arrowDown"]').length;
    expect(expandedRows).toBe(0);
  });
});
