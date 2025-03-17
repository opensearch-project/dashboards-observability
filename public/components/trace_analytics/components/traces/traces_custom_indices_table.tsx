/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiDataGridColumn,
  EuiLink,
  EuiPanel,
  EuiText,
  PropertySort,
} from '@elastic/eui';
import React, { useEffect, useMemo } from 'react';
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
  totalHits: number;
  refresh: (sort?: PropertySort) => Promise<void>;
  mode: TraceAnalyticsMode;
  loading: boolean;
  getTraceViewUri?: (traceId: string) => string;
  openTraceFlyout?: (traceId: string) => void;
  jaegerIndicesExist: boolean;
  dataPrepperIndicesExist: boolean;
  tracesTableMode: TraceQueryMode;
  setTracesTableMode: React.Dispatch<React.SetStateAction<TraceQueryMode>>;
  sorting: { id: string; direction: "desc" | "asc" }[];
  pagination: {
    pageIndex: number;
    pageSize: number;
    pageSizeOptions: number[];
    onChangePage: (newPage: number) => void;
    onChangeItemsPerPage: (newSize: number) => void;
  };
  onSort: (columns: { id: string; direction: "desc" | "asc" }[]) => void;
}

export function TracesCustomIndicesTable(props: TracesLandingTableProps) {
  const {
    columnItems,
    items,
    totalHits,
    refresh,
    mode,
    loading,
    getTraceViewUri,
    openTraceFlyout,
    sorting: sortingColumns,
    pagination,
    onSort,
  } = props;

  //ADAM DELETE console.log
  //Clear sorting which switching mode
  // useEffect(() => {
  //   onSort([{id: "endTime", direction: "desc"}]);
  // }, [props.tracesTableMode]);
  useEffect(() => {
    onSort([]);
  }, [props.tracesTableMode]);

  const renderCellValue = useMemo(() => {
    return ({ rowIndex, columnId }: { rowIndex: number; columnId: string }) => {
      const adjustedRowIndex = rowIndex - pagination.pageIndex * pagination.pageSize;
      if (!items.hasOwnProperty(adjustedRowIndex)) return '-';
      const value = items[adjustedRowIndex]?.[columnId];

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
        case 'durationInNanos':
          return `${(value / 1000000).toFixed(2)} ms`;
        case 'status.code':
          return value == 2 ? (
            <EuiText color="danger" size="s">Yes</EuiText>
          ) : (
            'No'
          );
        case 'error_count':
          return value?.doc_count > 0 ? (
            <EuiText color="danger" size="s">Yes</EuiText>
          ) : (
            'No'
          );
        default:
          return value;
      }
    };
  }, [items, pagination.pageIndex, pagination.pageSize]);

  const columns = useMemo(() => {
    return getTableColumns(
      columnItems,
      mode,
      props.tracesTableMode,
      getTraceViewUri,
      openTraceFlyout).map(col => ({
        id: col.field,
        display: col.name,
        schema: 'string',
        isSortable: col.sortable ?? false,
      })) as EuiDataGridColumn[];
  }, [
    columnItems,
    mode,
    props.tracesTableMode,
    getTraceViewUri,
    openTraceFlyout,
    items,
  ]);

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
            rowCount={totalHits}
            sorting={{ columns: sortingColumns, onSort }}
            pagination={pagination}
            isTableDataLoading={loading}
            tracesTableMode={props.tracesTableMode}
            setTracesTableMode={(mode) => props.setTracesTableMode(mode as TraceQueryMode)}
          />
        ) : (
          <NoMatchMessage size="xl" />
        )}
      </EuiPanel>
    </>
  );
}
