/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiDataGrid, EuiLoadingSpinner, EuiSpacer } from '@elastic/eui';
import $ from 'jquery';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

interface QueryDataGridProps {
  rowCount: number;
  queryColumns: any[];
  dataValues: any[];
}

interface RenderCellValueProps {
  rowIndex: number;
  columnId: string;
}

function QueryDataGrid(props: QueryDataGridProps) {
  const { rowCount, queryColumns, dataValues } = props;
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  // ** Sorting config
  const [sortingColumns, setSortingColumns] = useState([]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);

  const [isVisible, setIsVisible] = useState(false);

  const onSort = useCallback(
    (newColumns) => {
      setSortingColumns(newColumns);
    },
    [setSortingColumns]
  );

  const onChangeItemsPerPage = useCallback(
    (pageSize) =>
      setPagination((newPagination) => ({
        ...newPagination,
        pageSize,
        pageIndex: 0,
      })),
    [setPagination]
  );

  const onChangePage = useCallback(
    (pageIndex) => setPagination((newPagination) => ({ ...newPagination, pageIndex })),
    [setPagination]
  );

  const renderCellValue = useMemo(() => {
    return ({ rowIndex, columnId }: RenderCellValueProps) => {
      return dataValues.hasOwnProperty(rowIndex) ? dataValues[rowIndex][columnId] : null;
    };
  }, []);

  const getUpdatedVisibleColumns = () => {
    const updatedVisibleColumns = [];
    for (let index = 0; index < queryColumns.length; ++index) {
      updatedVisibleColumns.push(queryColumns[index].displayAsText);
    }
    return updatedVisibleColumns;
  };

  useEffect(() => {
    if ($('.euiDataGrid__overflow').is(':visible')) {
      setIsVisible(true);
    }
    setTimeout(() => {
      if ($('.euiDataGrid__overflow').is(':visible')) {
        setIsVisible(true);
      }
    }, 1000);
    setVisibleColumns(getUpdatedVisibleColumns());
  }, []);

  const displayLoadingSpinner = !isVisible ? (
    <>
      <EuiLoadingSpinner size="xl" />
      <EuiSpacer />
    </>
  ) : null;

  return (
    <div id="queryDataGrid">
      {displayLoadingSpinner}
      <EuiDataGrid
        aria-label="Query datagrid"
        columns={queryColumns}
        columnVisibility={{ visibleColumns, setVisibleColumns }}
        rowCount={rowCount}
        renderCellValue={renderCellValue}
        inMemory={{ level: 'sorting' }}
        sorting={{ columns: sortingColumns, onSort }}
        pagination={{
          ...pagination,
          pageSizeOptions: [10, 20, 50],
          onChangeItemsPerPage,
          onChangePage,
        }}
      />
    </div>
  );
}

function queryDataGridPropsAreEqual(prevProps: QueryDataGridProps, nextProps: QueryDataGridProps) {
  return (
    prevProps.rowCount === nextProps.rowCount &&
    JSON.stringify(prevProps.queryColumns) === JSON.stringify(nextProps.queryColumns) &&
    JSON.stringify(prevProps.dataValues) === JSON.stringify(nextProps.dataValues)
  );
}

export const QueryDataGridMemo = React.memo(QueryDataGrid, queryDataGridPropsAreEqual);
