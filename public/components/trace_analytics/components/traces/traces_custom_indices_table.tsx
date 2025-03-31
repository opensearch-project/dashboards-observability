/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiDataGridColumn, EuiLink, EuiPanel, EuiText } from '@elastic/eui';
import React, { useMemo } from 'react';
import moment from 'moment';
import { TraceAnalyticsMode, TraceQueryMode } from '../../../../../common/types/trace_analytics';
import { MissingConfigurationMessage, NoMatchMessage } from '../common/helper_functions';
import { getTableColumns } from './trace_table_helpers';
import { RenderCustomDataGrid } from '../common/shared_components/custom_datagrid';
import { uiSettingsService } from '../../../../../common/utils';

interface TracesLandingTableProps {
  columnItems: string[];
  items: any[];
  totalHits: number;
  mode: TraceAnalyticsMode;
  loading: boolean;
  getTraceViewUri?: (traceId: string) => string;
  openTraceFlyout?: (traceId: string) => void;
  jaegerIndicesExist: boolean;
  dataPrepperIndicesExist: boolean;
  tracesTableMode: TraceQueryMode;
  setTracesTableMode: React.Dispatch<React.SetStateAction<TraceQueryMode>>;
  sorting: Array<{ id: string; direction: 'desc' | 'asc' }>;
  pagination: {
    pageIndex: number;
    pageSize: number;
    pageSizeOptions: number[];
    onChangePage: (newPage: number) => void;
    onChangeItemsPerPage: (newSize: number) => void;
  };
  onSort: (columns: Array<{ id: string; direction: 'desc' | 'asc' }>) => void;
  maxTraces: number;
  setMaxTraces: React.Dispatch<React.SetStateAction<number>>;
}

export function TracesCustomIndicesTable(props: TracesLandingTableProps) {
  const {
    columnItems,
    items,
    totalHits,
    loading,
    getTraceViewUri,
    openTraceFlyout,
    sorting: sortingColumns,
    pagination,
    onSort,
  } = props;

  const renderCellValue = useMemo(() => {
    return ({ rowIndex, columnId }: { rowIndex: number; columnId: string }) => {
      const isTracesMode = props.tracesTableMode === 'traces';
      const adjustedRowIndex = isTracesMode
        ? rowIndex
        : rowIndex - pagination.pageIndex * pagination.pageSize;

      if (!items.hasOwnProperty(adjustedRowIndex)) return '-';
      const value = items[adjustedRowIndex]?.[columnId];

      if (!value && columnId !== 'status.code' && columnId !== 'error_count') return '-';

      switch (columnId) {
        case 'last_updated':
        case 'endTime':
          // return moment(value).format('MM/DD/YYYY HH:mm:ss.SSS');
          return moment(value).format(uiSettingsService.get('dateFormat'));
        case 'trace_id':
        case 'traceId':
          return getTraceViewUri ? <EuiLink href={getTraceViewUri(value)}>{value}</EuiLink> : value;
        case 'durationInNanos':
          return `${(value / 1000000).toFixed(2)} ms`;
        case 'status.code':
          return value === 2 ? (
            <EuiText color="danger" size="s">
              Yes
            </EuiText>
          ) : (
            'No'
          );
        case 'error_count':
          return value > 0 ? (
            <EuiText color="danger" size="s">
              Yes
            </EuiText>
          ) : (
            'No'
          );
        default:
          return value;
      }
    };
  }, [items, pagination.pageIndex, pagination.pageSize, props.tracesTableMode]);

  const columns = useMemo(() => {
    return getTableColumns(
      columnItems,
      props.mode,
      props.tracesTableMode,
      getTraceViewUri,
      openTraceFlyout
    ).map((col) => ({
      id: col.field,
      display: col.name,
      schema: 'string',
      isSortable: col.sortable ?? false,
    })) as EuiDataGridColumn[];
  }, [columnItems, props.tracesTableMode, getTraceViewUri, openTraceFlyout, items]);

  return (
    <>
      <EuiPanel>
        {!(
          props.mode === 'custom_data_prepper' ||
          (props.mode === 'data_prepper' && props.dataPrepperIndicesExist) ||
          (props.mode === 'jaeger' && props.jaegerIndicesExist)
        ) ? (
          <MissingConfigurationMessage mode={props.mode} />
        ) : items?.length > 0 || loading ? (
          <RenderCustomDataGrid
            key={columns.map((col) => col.id).join('-')} // Force re-render for switching from spans to traces
            columns={columns}
            renderCellValue={renderCellValue}
            rowCount={props.tracesTableMode === 'traces' ? items.length : totalHits}
            sorting={{ columns: sortingColumns, onSort }}
            pagination={pagination}
            isTableDataLoading={loading}
            tracesTableMode={props.tracesTableMode}
            setTracesTableMode={(mode) => props.setTracesTableMode(mode as TraceQueryMode)}
            maxTraces={props.maxTraces}
            setMaxTraces={props.setMaxTraces}
          />
        ) : (
          <NoMatchMessage size="xl" mode={mode} />
        )}
      </EuiPanel>
    </>
  );
}
