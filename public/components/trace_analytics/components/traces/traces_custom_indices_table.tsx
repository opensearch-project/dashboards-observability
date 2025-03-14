/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButtonEmpty,
  EuiLink,
  EuiPanel,
  EuiText,
  PropertySort,
} from '@elastic/eui';
import React, { useEffect, useMemo, useState } from 'react';
import { TraceAnalyticsMode, TraceQueryMode } from '../../../../../common/types/trace_analytics';
import {
  MissingConfigurationMessage,
  NoMatchMessage,
} from '../common/helper_functions';
import { getTableColumns } from './trace_table_helpers';
import { RenderCustomDataGrid } from '../common/shared_components/custom_datagrid';
import moment from 'moment';

interface TracesLandingTableProps {
  columnItems: string[];
  items: any[];
  refresh: (sort?: PropertySort) => Promise<void>;
  mode: TraceAnalyticsMode;
  loading: boolean;
  getTraceViewUri?: (traceId: string) => string;
  openTraceFlyout?: (traceId: string) => void;
  jaegerIndicesExist: boolean;
  dataPrepperIndicesExist: boolean;
  tracesTableMode: TraceQueryMode;
  setTracesTableMode: React.Dispatch<React.SetStateAction<TraceQueryMode>>;
}

export function TracesCustomIndicesTable(props: TracesLandingTableProps) {
  const { columnItems, items, refresh, mode, loading, getTraceViewUri, openTraceFlyout } = props;
  const [showAttributes, setShowAttributes] = useState(false);

  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const renderCellValue = ({ rowIndex, columnId }: { rowIndex: number; columnId: string }) => {
    const value = items[rowIndex]?.[columnId];
    
    if (!value && columnId !== 'status.code' && columnId !== 'error_count') return '-';
  
    switch (columnId) {
      case 'endTime':
        return moment(value).format('MM/DD/YYYY HH:mm:ss.SSS');
        
      case 'trace_id':
      case 'traceId':
        return getTraceViewUri ? (
          <EuiLink href={getTraceViewUri(value)}>{value}</EuiLink>
        ) : (
          value
        );
  
      case "durationInNanos":
        return `${(value / 1000000).toFixed(2)} ms`;
  
      case "status.code":
        return value == 2 ? (
          <EuiText color="danger" size="s">Yes</EuiText>
        ) : (
          'No'
        );
  
      case 'error_count':
        const errorCount = value?.doc_count ?? 0;
        return errorCount > 0 ? (
          <EuiText color="danger" size="s">Yes</EuiText>
        ) : (
          'No'
        );
  
      default:
        return value;
    }
  };
  
  const pagination = {
    pageIndex,
    pageSize,
    pageSizeOptions: [5, 10, 15],
    onChangePage: (newPage) => setPageIndex(newPage),
    onChangeItemsPerPage: (newSize) => {
      setPageSize(newSize);
      setPageIndex(0);
    },
  };

  const columns = useMemo(() => {
    return getTableColumns(
      showAttributes,
      columnItems,
      mode,
      props.tracesTableMode,
      getTraceViewUri, openTraceFlyout).map(col => ({
        id: col.field,
        display: col.name,
      }));
  }, [
    showAttributes,
    columnItems,
    mode,
    props.tracesTableMode,
    getTraceViewUri,
    openTraceFlyout,
    items,
  ]);

  //const [sortingColumns, setSortingColumns] = useState([{}]);
  const [sortingColumns, setSortingColumns] = useState<{ id: string; direction: "desc" | "asc" }[]>([]);

  /** TEST */
  // const [sortingColumns, setSortingColumns] = useState<{ id: string; direction: "desc" | "asc" }[]>([]);

  // useEffect(() => {
  //   const defaultSortField = props.tracesTableMode === 'traces' ? 'last_updated' : 'endTime';
  //   setSortingColumns([{ id: defaultSortField, direction: "desc" }]);
  //   refresh({ field: defaultSortField, direction: "desc" }).catch(console.error);
  // }, [props.tracesTableMode]); // Runs when tracesTableMode changes

  /** Default sorting based on tracesTableMode */
  // const defaultSortField = props.tracesTableMode === 'traces' ? 'last_updated' : 'endTime';
  // const [sortingColumns, setSortingColumns] = useState<{ id: string; direction: "desc" | "asc" }[]>([
  //   { id: defaultSortField, direction: "desc" },
  // ]);
  
  const sorting = {
    columns: sortingColumns,
    onSort: async (newSorting: { id: string; direction: "desc" | "asc" }[]) => {
      setSortingColumns(newSorting);
  
      const sortField = newSorting[0].id;
      const sortDirection = newSorting[0].direction;
  
      await refresh({
        field: sortField,
        direction: sortDirection,
      });
    },
  };
  
  const attributesButton = (
    <EuiButtonEmpty
      size="xs"
      onClick={() => setShowAttributes((prev) => !prev)}
      key="toggleAttributes"
      color="text"
      data-test-subj="toggleAttributesButton"
    >
      {showAttributes ? 'Hide attributes' : 'Show attributes'}
    </EuiButtonEmpty>
  );

  // useEffect(() => {
  //   //ADAM DELETE
  //   console.log(props.tracesTableMode)
  //   console.log("THE COLUMNS", columns);
  // }, [props.tracesTableMode, columns])

  return (
    <>
      <EuiPanel>
        {!(
          mode === 'custom_data_prepper' ||
          (mode === 'data_prepper' && props.dataPrepperIndicesExist) ||
          (mode === 'jaeger' && props.jaegerIndicesExist)
        ) ? (
          <MissingConfigurationMessage mode={mode} />
        ) : items?.length > 0 || loading ? (
          <RenderCustomDataGrid
            key={columns.map(col => col.id).join('-')}//Force re-render for switching from spans to traces
            columns={columns}
            renderCellValue={renderCellValue}
            rowCount={items.length}
            sorting={sorting}
            pagination={pagination}
            isTableDataLoading={loading}
            tracesTableMode={props.tracesTableMode}
            setTracesTableMode={props.setTracesTableMode}
            {...(props.tracesTableMode !== 'traces' && { toggleAttributesButton: attributesButton })}
          />
        ) : (
          <NoMatchMessage size="xl" />
        )}
      </EuiPanel>
    </>
  );
}
