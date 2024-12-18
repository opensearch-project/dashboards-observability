/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import {
  EuiDataGrid,
  EuiDataGridColumn,
  EuiLink,
  EuiText,
  EuiIcon,
  EuiButtonEmpty,
} from '@elastic/eui';
import round from 'lodash/round';
import moment from 'moment';
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { HttpSetup } from '../../../../../../../src/core/public';
import { TRACE_ANALYTICS_DATE_FORMAT } from '../../../../../common/constants/trace_analytics';
import { TraceAnalyticsMode } from '../../../../../common/types/trace_analytics';
import { handleSpansRequest } from '../../requests/traces_request_handler';
import {
  NoMatchMessage,
  microToMilliSec,
  nanoToMilliSec,
  FullScreenWrapper,
} from '../common/helper_functions';

interface SpanDetailTableProps {
  http: HttpSetup;
  hiddenColumns: string[];
  openFlyout: (spanId: string) => void;
  mode: TraceAnalyticsMode;
  DSL?: any;
  setTotal?: (total: number) => void;
  dataSourceMDSId: string;
  availableWidth?: number;
}

export interface SpanSearchParams {
  from: number;
  size: number;
  sortingColumns: Array<{
    [id: string]: 'asc' | 'desc';
  }>;
}

const getColumns = (mode: TraceAnalyticsMode): EuiDataGridColumn[] => [
  {
    id: mode === 'jaeger' ? 'spanID' : 'spanId',
    display: 'Span ID',
  },
  {
    id: mode === 'jaeger' ? 'references' : 'parentSpanId',
    display: 'Parent span ID',
  },
  {
    id: mode === 'jaeger' ? 'traceID' : 'traceId',
    display: 'Trace ID',
  },
  ...(mode !== 'jaeger'
    ? [
        {
          id: 'traceGroup',
          display: 'Trace group',
        },
      ]
    : []),
  {
    id: mode === 'jaeger' ? 'process' : 'serviceName',
    display: 'Service',
  },
  {
    id: mode === 'jaeger' ? 'operationName' : 'name',
    display: 'Operation',
  },
  {
    id: mode === 'jaeger' ? 'duration' : 'durationInNanos',
    display: 'Duration',
    initialWidth: 100,
  },
  {
    id: mode === 'jaeger' ? 'tag' : 'status.code',
    display: 'Errors',
    initialWidth: 100,
  },
  {
    id: 'startTime',
    display: 'Start time',
  },
  {
    id: mode === 'jaeger' ? 'jaegerEndTime' : 'endTime',
    display: 'End time',
  },
];

const renderCommonCellValue = ({
  rowIndex,
  columnId,
  items,
  tableParams,
  expandedRows,
  toggleRowExpansion,
  props,
  flattenedItems,
  indentationFactor = 0,
  fullScreenMode = false,
}: {
  rowIndex: number;
  columnId: string;
  items: any;
  tableParams: any;
  expandedRows?: Set<string>;
  toggleRowExpansion?: (spanId: string) => void;
  props: SpanDetailTableProps;
  flattenedItems?: any[];
  indentationFactor?: number;
  fullScreenMode?: boolean;
}) => {
  const adjustedRowIndex = flattenedItems
    ? rowIndex
    : rowIndex - tableParams.page * tableParams.size;
  const item = flattenedItems ? flattenedItems[rowIndex] : items[adjustedRowIndex];

  if (!item) return '-';

  const value = item[columnId];
  const indentation = `${(item.level || 0) * indentationFactor}px`;
  const isRowExpanded = expandedRows?.has(item.spanId);

  if ((value == null || value === '') && columnId !== 'jaegerEndTime') return '-';

  switch (columnId) {
    case 'tag':
      return value?.error === true ? (
        <EuiText color="danger" size="s">
          Yes
        </EuiText>
      ) : (
        'No'
      );
    case 'references':
      return value.length > 0 ? value[0].spanID : '';
    case 'process':
      return value?.serviceName;
    case 'spanId':
    case 'spanID':
      return (
        <div style={{ paddingLeft: indentation, display: 'flex', alignItems: 'center' }}>
          {toggleRowExpansion && item.children?.length > 0 ? (
            <EuiIcon
              type={isRowExpanded ? 'arrowDown' : 'arrowRight'}
              onClick={() => toggleRowExpansion(item.spanId)}
              style={{ cursor: 'pointer', marginRight: 5 }}
              data-test-subj="treeViewExpandArrow"
            />
          ) : (
            <EuiIcon type="empty" style={{ visibility: 'hidden', marginRight: 5 }} />
          )}
          {!fullScreenMode ? (
            <EuiLink data-test-subj="spanId-link" onClick={() => props.openFlyout(value)}>
              {value}
            </EuiLink>
          ) : (
            <span>{value}</span>
          )}
        </div>
      );
    case 'durationInNanos':
      return `${round(nanoToMilliSec(Math.max(0, value)), 2)} ms`;
    case 'duration':
      return `${round(microToMilliSec(Math.max(0, value)), 2)} ms`;
    case 'startTime':
      return props.mode === 'jaeger'
        ? moment(round(microToMilliSec(Math.max(0, value)), 2)).format(TRACE_ANALYTICS_DATE_FORMAT)
        : moment(value).format(TRACE_ANALYTICS_DATE_FORMAT);
    case 'jaegerEndTime':
      return moment(round(microToMilliSec(Math.max(0, item.startTime + item.duration)), 2)).format(
        TRACE_ANALYTICS_DATE_FORMAT
      );
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
      return value || '-';
  }
};

export function SpanDetailTable(props: SpanDetailTableProps) {
  const [tableParams, setTableParams] = useState({
    size: 10,
    page: 0,
    sortingColumns: [] as Array<{
      id: string;
      direction: 'asc' | 'desc';
    }>,
  });
  const [items, setItems] = useState<any>([]);
  const [total, setTotal] = useState(0);
  const { mode } = props;

  useEffect(() => {
    const spanSearchParams: SpanSearchParams = {
      from: tableParams.page * tableParams.size,
      size: tableParams.size,
      sortingColumns: tableParams.sortingColumns.map(({ id, direction }) => ({
        [id]: direction,
      })),
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

  const columns = useMemo(() => getColumns(mode), [mode]);

  const [visibleColumns, setVisibleColumns] = useState(() =>
    columns
      .filter(({ id }) => props.hiddenColumns.findIndex((column) => column === id) === -1)
      .map(({ id }) => id)
  );

  const [fullScreenMode, setFullScreenMode] = useState(false);
  const openFullScreenModal = () => setFullScreenMode(true);
  const closeFullScreenModal = () => setFullScreenMode(false);

  const renderCellValue = useCallback(
    (params) => renderCommonCellValue({ ...params, items, tableParams, props, fullScreenMode }),
    [items, tableParams, props, fullScreenMode]
  );

  const onSort = useCallback(
    (sortingColumns) => {
      setTableParams({
        ...tableParams,
        sortingColumns,
      });
    },
    [tableParams]
  );

  const onChangeItemsPerPage = useCallback((size) => setTableParams({ ...tableParams, size }), [
    tableParams,
  ]);
  const onChangePage = useCallback((page) => setTableParams({ ...tableParams, page }), [
    tableParams,
  ]);

  const toolbarButtons = [
    <EuiButtonEmpty
      size="xs"
      onClick={fullScreenMode ? closeFullScreenModal : openFullScreenModal}
      key="fullScreen"
      color="text"
      iconType={fullScreenMode ? 'cross' : 'fullScreen'}
      data-test-subj="fullScreenButton"
    >
      {fullScreenMode ? 'Exit full screen' : 'Full screen'}
    </EuiButtonEmpty>,
  ];

  return (
    <>
      <FullScreenWrapper isFullScreen={fullScreenMode} onClose={closeFullScreenModal}>
        <EuiDataGrid
          aria-labelledby="span-detail-data-grid"
          columns={columns}
          columnVisibility={{ visibleColumns, setVisibleColumns }}
          rowCount={total}
          renderCellValue={renderCellValue}
          sorting={mode === 'jaeger' ? undefined : { columns: tableParams.sortingColumns, onSort }}
          toolbarVisibility={{
            showColumnSelector: true,
            showSortSelector: true,
            showFullScreenSelector: false,
            additionalControls: toolbarButtons,
          }}
          pagination={{
            pageIndex: tableParams.page,
            pageSize: tableParams.size,
            pageSizeOptions: [10, 50, 100],
            onChangeItemsPerPage,
            onChangePage,
          }}
          style={{
            width: fullScreenMode
              ? '100%'
              : props.availableWidth
              ? `${props.availableWidth}px`
              : '100%', // allow page to be resized
            height: fullScreenMode ? '100%' : 'auto',
          }}
        />
      </FullScreenWrapper>
      {total === 0 && <NoMatchMessage size="xl" />}
    </>
  );
}

export function SpanDetailTableHierarchy(props: SpanDetailTableProps) {
  const { mode } = props;
  const [items, setItems] = useState<any>([]);
  const [total, setTotal] = useState(0);
  const [expandedRows, setExpandedRows] = useState(new Set<string>());
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);

  useEffect(() => {
    const spanSearchParams = {
      from: 0,
      size: 10000,
      sortingColumns: [],
    };
    handleSpansRequest(
      props.http,
      (data) => {
        const hierarchy = buildHierarchy(data);
        setItems(hierarchy);
      },
      setTotal,
      spanSearchParams,
      props.DSL,
      mode,
      props.dataSourceMDSId
    );
  }, [props.DSL]);

  interface Span {
    spanId: string;
    parentSpanId?: string;
    children: Span[];
    [key: string]: any;
  }

  type SpanMap = Record<string, Span>;

  const buildHierarchy = (spans: Span[]): Span[] => {
    const spanMap: SpanMap = {};

    spans.forEach((span) => {
      spanMap[span.spanId] = { ...span, children: [] };
    });

    const rootSpans: Span[] = [];

    spans.forEach((span) => {
      if (span.parentSpanId && spanMap[span.parentSpanId]) {
        // If the parent span exists, add this span to its children array
        spanMap[span.parentSpanId].children.push(spanMap[span.spanId]);
      } else {
        rootSpans.push(spanMap[span.spanId]);
      }
    });

    return rootSpans;
  };

  const flattenedItems = useMemo(() => {
    const flattenHierarchy = (spans: Span[], level = 0, isParentExpanded = true): Span[] => {
      return spans.flatMap((span) => {
        const isExpanded = expandedRows.has(span.spanId);
        const shouldShow = level === 0 || isParentExpanded;
        const row = shouldShow ? [{ ...span, level }] : [];
        const children = flattenHierarchy(span.children || [], level + 1, isExpanded && shouldShow);
        return [...row, ...children];
      });
    };

    return flattenHierarchy(items);
  }, [items, expandedRows]);

  const columns = useMemo(() => getColumns(mode), [mode]);

  useEffect(() => {
    setVisibleColumns(
      columns
        .filter(({ id }) => props.hiddenColumns.findIndex((column) => column === id) === -1)
        .map(({ id }) => id)
    );
  }, [columns, props.hiddenColumns]);

  const [fullScreenMode, setFullScreenMode] = useState(false);
  const openFullScreenModal = () => setFullScreenMode(true);
  const closeFullScreenModal = () => setFullScreenMode(false);

  const renderCellValue = useCallback(
    (params) =>
      renderCommonCellValue({
        ...params,
        items,
        props,
        expandedRows,
        toggleRowExpansion: (id) => {
          setExpandedRows((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
              newSet.delete(id);
            } else {
              newSet.add(id);
            }
            return newSet;
          });
        },
        flattenedItems,
        indentationFactor: 20,
        fullScreenMode,
      }),
    [items, expandedRows, props, flattenedItems, fullScreenMode]
  );

  const gatherAllSpanIds = (spans: Span[]): Set<string> => {
    const allSpanIds = new Set<string>();

    spans.forEach((span) => {
      allSpanIds.add(span.spanId);

      if (span.children && span.children.length > 0) {
        const childSpanIds = gatherAllSpanIds(span.children);
        childSpanIds.forEach((id) => allSpanIds.add(id));
      }
    });

    return allSpanIds;
  };

  const expandAllRows = () => {
    const allExpandedIds = gatherAllSpanIds(items);
    setExpandedRows(allExpandedIds);
  };

  const collapseAllRows = () => {
    setExpandedRows(new Set());
  };

  const toolbarButtons = [
    <EuiButtonEmpty
      size="xs"
      onClick={fullScreenMode ? closeFullScreenModal : openFullScreenModal}
      key="fullScreen"
      color="text"
      iconType={fullScreenMode ? 'cross' : 'fullScreen'}
      data-test-subj="fullScreenButton"
    >
      {fullScreenMode ? 'Exit full screen' : 'Full screen'}
    </EuiButtonEmpty>,
    <EuiButtonEmpty
      size="xs"
      onClick={expandAllRows}
      key="expandAll"
      color="text"
      iconType="expand"
      data-test-subj="treeExpandAll"
    >
      Expand all
    </EuiButtonEmpty>,
    <EuiButtonEmpty
      size="xs"
      onClick={collapseAllRows}
      key="collapseAll"
      color="text"
      iconType="minimize"
      data-test-subj="treeCollapseAll"
    >
      Collapse all
    </EuiButtonEmpty>,
  ];

  return (
    <>
      <FullScreenWrapper isFullScreen={fullScreenMode} onClose={closeFullScreenModal}>
        <EuiDataGrid
          aria-labelledby="span-detail-data-grid"
          columns={columns}
          columnVisibility={{ visibleColumns, setVisibleColumns }}
          rowCount={flattenedItems.length}
          renderCellValue={renderCellValue}
          toolbarVisibility={{
            showColumnSelector: true,
            showSortSelector: true,
            showFullScreenSelector: false,
            additionalControls: toolbarButtons,
          }}
          style={{
            width: fullScreenMode
              ? '100%'
              : props.availableWidth
              ? `${props.availableWidth}px`
              : '100%', // allow page to be resized
            height: fullScreenMode ? '100%' : '500px',
            overflowY: 'auto',
          }}
        />
      </FullScreenWrapper>
      {!fullScreenMode && total === 0 && <NoMatchMessage size="xl" />}
    </>
  );
}
