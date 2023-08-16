/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import $ from 'jquery';
import { EuiDataGrid, EuiLoadingSpinner, EuiSpacer } from '@elastic/eui';
import { Dispatch } from 'react';
import { SetStateAction } from 'react';

interface QueryDataGridProps {
  rowCount: number;
  queryColumns: any[];
  visibleColumns: any[];
  setVisibleColumns: Dispatch<SetStateAction<Array<{ id: any; displayAsText: any }>>>;
  dataValues: any[];
}

interface RenderCellValueProps {
  rowIndex: number;
  columnId: string;
}

function QueryDataGrid(props: QueryDataGridProps) {
  const { rowCount, queryColumns, visibleColumns, setVisibleColumns, dataValues } = props;
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  // ** Sorting config
  const [sortingColumns, setSortingColumns] = useState([]);
  const [isVisible, setIsVisible] = useState(false);

  const onSort = useCallback(
    (newColumns) => {
      setSortingColumns(newColumns);
    },
    [setSortingColumns]
  );

  const onChangeItemsPerPage = useCallback(
    (pageSize) =>
      setPagination((currentPagination) => ({
        ...currentPagination,
        pageSize,
        pageIndex: 0,
      })),
    [setPagination]
  );

  const onChangePage = useCallback(
    (pageIndex) => setPagination((currentPagination) => ({ ...currentPagination, pageIndex })),
    [setPagination]
  );

  const renderCellValue = useMemo(() => {
    return ({ rowIndex, columnId }: RenderCellValueProps) => {
      return dataValues.hasOwnProperty(rowIndex) ? dataValues[rowIndex][columnId] : null;
    };
  }, [dataValues]);

  const getUpdatedVisibleColumns = (newQueryColumns: unknown[]) => {
    const updatedVisibleColumns = [];
    for (let index = 0; index < newQueryColumns.length; ++index) {
      updatedVisibleColumns.push(newQueryColumns[index].displayAsText);
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
    setVisibleColumns(getUpdatedVisibleColumns(queryColumns));
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
    JSON.stringify(prevProps.visibleColumns) === JSON.stringify(nextProps.visibleColumns) &&
    JSON.stringify(prevProps.dataValues) === JSON.stringify(nextProps.dataValues)
  );
}

export const QueryDataGridMemo = React.memo(QueryDataGrid, queryDataGridPropsAreEqual);
