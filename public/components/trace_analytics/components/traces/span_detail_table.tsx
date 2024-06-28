/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import { EuiDataGrid, EuiDataGridColumn, EuiLink, EuiText } from '@elastic/eui';
import round from 'lodash/round';
import moment from 'moment';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { HttpSetup } from '../../../../../../../src/core/public';
import { TRACE_ANALYTICS_DATE_FORMAT } from '../../../../../common/constants/trace_analytics';
import { TraceAnalyticsMode } from '../../home';
import { handleSpansRequest } from '../../requests/traces_request_handler';
import { NoMatchMessage, microToMilliSec, nanoToMilliSec } from '../common/helper_functions';

interface SpanDetailTableProps {
  http: HttpSetup;
  hiddenColumns: string[];
  openFlyout: (spanId: string) => void;
  mode: TraceAnalyticsMode;
  DSL?: any;
  setTotal?: (total: number) => void;
  dataSourceMDSId: string;
}

export interface SpanSearchParams {
  from: number;
  size: number;
  sortingColumns: Array<{
    [id: string]: 'asc' | 'desc';
  }>;
}

export function SpanDetailTable(props: SpanDetailTableProps) {
  const [tableParams, setTableParams] = useState({
    size: 10,
    page: 0,
    sortingColumns: [] as Array<{
      id: string;
      direction: 'asc' | 'desc';
    }>,
  });
  const { mode } = props;
  const isJaeger = mode === 'jaeger';
  const [items, setItems] = useState<any>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const spanSearchParams: SpanSearchParams = {
      from: tableParams.page * tableParams.size,
      size: tableParams.size,
      sortingColumns: tableParams.sortingColumns.map(({ id, direction }) => ({ [id]: direction })),
    };
    handleSpansRequest(
      props.http,
      setItems,
      setTotal,
      spanSearchParams,
      props.DSL,
      mode,
      props.dataSourceMDSId
    );
  }, [tableParams, props.DSL]);

  useEffect(() => {
    if (props.setTotal) props.setTotal(total);
  }, [total]);

  const columns: EuiDataGridColumn[] = [
    ...(isJaeger
      ? [
          {
            id: 'spanID',
            display: 'Span ID',
          },
        ]
      : [
          {
            id: 'spanId',
            display: 'Span ID',
          },
        ]),
    ...(isJaeger
      ? [
          {
            id: 'references',
            display: 'Parent span ID',
          },
        ]
      : [
          {
            id: 'parentSpanId',
            display: 'Parent span ID',
          },
        ]),
    ...(isJaeger
      ? [
          {
            id: 'traceID',
            display: 'Trace ID',
          },
        ]
      : [
          {
            id: 'traceId',
            display: 'Trace ID',
          },
        ]),
    ...(isJaeger
      ? []
      : [
          {
            id: 'traceGroup',
            display: 'Trace group',
          },
        ]),
    ...(isJaeger
      ? [
          {
            id: 'process',
            display: 'Service',
          },
        ]
      : [
          {
            id: 'serviceName',
            display: 'Service',
          },
        ]),
    ...(isJaeger
      ? [
          {
            id: 'operationName',
            display: 'Operation',
          },
        ]
      : [
          {
            id: 'name',
            display: 'Operation',
          },
        ]),
    ...(isJaeger
      ? [
          {
            id: 'duration',
            display: 'Duration',
          },
        ]
      : [
          {
            id: 'durationInNanos',
            display: 'Duration',
          },
        ]),
    {
      id: 'startTime',
      display: 'Start time',
    },
    ...(isJaeger
      ? [
          {
            id: 'jaegerEndTime',
            display: 'End time',
          },
        ]
      : [
          {
            id: 'endTime',
            display: 'End time',
          },
        ]),
    ...(isJaeger
      ? [
          {
            id: 'tag',
            display: 'Errors',
          },
        ]
      : [
          {
            id: 'status.code',
            display: 'Errors',
          },
        ]),
  ];

  const [visibleColumns, setVisibleColumns] = useState(() =>
    columns
      .filter(({ id }) => props.hiddenColumns.findIndex((column) => column === id) === -1)
      .map(({ id }) => id)
  );

  const renderCellValue = useMemo(() => {
    return ({ rowIndex, columnId }: { rowIndex: number; columnId: string }) => {
      const adjustedRowIndex = rowIndex - tableParams.page * tableParams.size;
      if (!items.hasOwnProperty(adjustedRowIndex)) return '-';
      const value = items[adjustedRowIndex][columnId];
      if ((value == null || value === '') && columnId !== 'jaegerEndTime') return '-';
      switch (columnId) {
        case 'tag':
          return value.error === true ? (
            <EuiText color="danger" size="s">
              Yes
            </EuiText>
          ) : (
            'No'
          );
        case 'references':
          return value.length > 0 ? value[0].spanID : '';
        case 'process':
          return value.serviceName;
        case 'spanId':
          return (
            <EuiLink data-test-subj="spanId-link" onClick={() => props.openFlyout(value)}>
              {value}
            </EuiLink>
          );
        case 'spanID':
          return <EuiLink onClick={() => props.openFlyout(value)}>{value}</EuiLink>;
        case 'durationInNanos':
          return `${round(nanoToMilliSec(Math.max(0, value)), 2)} ms`;
        case 'duration':
          return `${round(microToMilliSec(Math.max(0, value)), 2)} ms`;
        case 'startTime':
          return isJaeger
            ? moment(round(microToMilliSec(Math.max(0, value)), 2)).format(
                TRACE_ANALYTICS_DATE_FORMAT
              )
            : moment(value).format(TRACE_ANALYTICS_DATE_FORMAT);
        case 'jaegerEndTime':
          return moment(
            round(
              microToMilliSec(
                Math.max(0, items[adjustedRowIndex].startTime + items[adjustedRowIndex].duration)
              ),
              2
            )
          ).format(TRACE_ANALYTICS_DATE_FORMAT);
        case 'endTime':
          return moment(value).format(TRACE_ANALYTICS_DATE_FORMAT);
        case 'status.code':
          return value === 2 ? (
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
  }, [items, tableParams.page, tableParams.size]);

  const onSort = useCallback(
    (sortingColumns) => {
      setTableParams({
        ...tableParams,
        sortingColumns,
      });
    },
    [setTableParams]
  );

  const onChangeItemsPerPage = useCallback((size) => setTableParams({ ...tableParams, size }), [
    tableParams,
    setTableParams,
  ]);
  const onChangePage = useCallback((page) => setTableParams({ ...tableParams, page }), [
    tableParams,
    setTableParams,
  ]);

  return (
    <>
      <EuiDataGrid
        aria-labelledby="span-detail-data-grid"
        columns={columns}
        columnVisibility={{ visibleColumns, setVisibleColumns }}
        rowCount={total}
        renderCellValue={renderCellValue}
        sorting={isJaeger ? undefined : { columns: tableParams.sortingColumns, onSort }}
        toolbarVisibility={isJaeger ? false : true}
        pagination={{
          pageIndex: tableParams.page,
          pageSize: tableParams.size,
          pageSizeOptions: [10, 50, 100],
          onChangeItemsPerPage,
          onChangePage,
        }}
      />
      {total === 0 && <NoMatchMessage size="xl" />}
    </>
  );
}
