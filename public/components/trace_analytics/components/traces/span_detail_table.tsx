/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import { EuiButtonEmpty, EuiDataGridColumn, EuiIcon, EuiLink, EuiText } from '@elastic/eui';
import round from 'lodash/round';
import moment from 'moment';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { HttpSetup } from '../../../../../../../src/core/public';
import { TRACE_ANALYTICS_DATE_FORMAT } from '../../../../../common/constants/trace_analytics';
import { TraceAnalyticsMode } from '../../../../../common/types/trace_analytics';
import { microToMilliSec, nanoToMilliSec } from '../common/helper_functions';
import { RenderCustomDataGrid } from '../common/shared_components/custom_datagrid';
import { handleSpansRequest } from '../../requests/traces_request_handler';

interface SpanDetailTableProps {
  http: HttpSetup;
  hiddenColumns: string[];
  openFlyout: (spanId: string) => void;
  mode: TraceAnalyticsMode;
  DSL?: any;
  setTotal?: (total: number) => void;
  dataSourceMDSId: string;
  availableWidth?: number;
  payloadData: string;
  filters: Array<{ field: string; value: any }>;
}

interface Span {
  spanId: string;
  parentSpanId?: string;
  children: Span[];
  [key: string]: any;
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

const renderSpanCellValue = ({
  rowIndex,
  columnId,
  items,
  tableParams,
  disableInteractions,
  props,
}: {
  rowIndex: number;
  columnId: string;
  items: Span[];
  tableParams: { page: number; size: number };
  disableInteractions: boolean;
  props: SpanDetailTableProps;
}) => {
  const adjustedRowIndex = rowIndex - tableParams.page * tableParams.size;
  const item = items[adjustedRowIndex];
  if (!item) return '-';

  const value = item[columnId];
  switch (columnId) {
    case 'tag':
      return value?.error === true ? (
        <EuiText color="danger" size="s">
          Yes
        </EuiText>
      ) : (
        'No'
      );
    case 'status.code':
      return value === 2 ? (
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
      return disableInteractions ? (
        <span>{value}</span>
      ) : (
        <EuiLink data-test-subj="spanId-link" onClick={() => props.openFlyout(value)}>
          {value}
        </EuiLink>
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
  const [items, setItems] = useState<Span[]>([]);
  const [total, setTotal] = useState(0);
  const [isSpansTableDataLoading, setIsSpansTableDataLoading] = useState(false);

  // For application_analytics
  const fetchData = async () => {
    setIsSpansTableDataLoading(true);
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
      props.mode,
      props.dataSourceMDSId
    ).finally(() => setIsSpansTableDataLoading(false));
  };

  // For application_analytics
  useEffect(() => {
    if (!props.payloadData) {
      fetchData();
    }
  }, [tableParams, props.DSL]);

  useEffect(() => {
    if (!props.payloadData) {
      console.warn('No payloadData provided in SpanDetailTable');
      return;
    }
    try {
      const parsed = JSON.parse(props.payloadData);

      const hitsArray =
        parsed.hits && Array.isArray(parsed.hits.hits)
          ? parsed.hits.hits
          : Array.isArray(parsed)
          ? parsed
          : [];

      if (hitsArray.length === 0) {
        console.warn('No hits found in payloadData');
      }

      // Map each hit to its _source
      let spans = hitsArray.map((hit: any) => hit._source);

      // Apply filters passed as a prop.
      if (props.filters.length > 0) {
        spans = spans.filter((span: any) => {
          return props.filters.every(({ field, value }) => {
            return span[field] === value;
          });
        });
      }

      setItems(spans);
      setTotal(spans.length);
    } catch (error) {
      console.error('Error parsing payloadData in SpanDetailTable:', error);
    } finally {
      setIsSpansTableDataLoading(false);
    }
  }, [props.payloadData, props.DSL, props.filters]);

  useEffect(() => {
    if (props.setTotal) props.setTotal(total);
  }, [total]);
  const columns = useMemo(() => getColumns(props.mode), [props.mode]);
  const renderCellValue = useCallback(
    ({ rowIndex, columnId, disableInteractions }) =>
      renderSpanCellValue({
        rowIndex,
        columnId,
        items,
        tableParams,
        disableInteractions,
        props,
      }),
    [items]
  );

  const onSort = (sortingColumns) => {
    setTableParams((prev) => ({ ...prev, sortingColumns }));
  };

  const onChangePage = (page) => {
    setTableParams((prev) => ({ ...prev, page }));
  };

  const onChangeItemsPerPage = (size) => {
    setTableParams((prev) => ({ ...prev, size, page: 0 }));
  };

  const visibleColumns = useMemo(
    () =>
      getColumns(props.mode)
        .filter(({ id }) => !props.hiddenColumns.includes(id))
        .map(({ id }) => id),
    [props.mode]
  );

  return RenderCustomDataGrid({
    columns,
    renderCellValue,
    rowCount: total,
    sorting: props.mode === 'jaeger' ? undefined : { columns: tableParams.sortingColumns, onSort },
    pagination: {
      pageIndex: tableParams.page,
      pageSize: tableParams.size,
      pageSizeOptions: [10, 50, 100],
      onChangePage,
      onChangeItemsPerPage,
    },
    noMatchMessageSize: 'xl',
    visibleColumns,
    availableWidth: props.availableWidth,
    isTableDataLoading: isSpansTableDataLoading,
  });
}

export function SpanDetailTableHierarchy(props: SpanDetailTableProps) {
  const { hiddenColumns, mode, availableWidth, openFlyout } = props;
  const [items, setItems] = useState<Span[]>([]);
  const [_total, setTotal] = useState(0);
  const [expandedRows, setExpandedRows] = useState(new Set<string>());
  const [isSpansTableDataLoading, setIsSpansTableDataLoading] = useState(false);

  useEffect(() => {
    if (!props.payloadData) return;
    try {
      const parsed = JSON.parse(props.payloadData);
      const hitsArray =
        parsed.hits && Array.isArray(parsed.hits.hits)
          ? parsed.hits.hits
          : Array.isArray(parsed)
          ? parsed
          : [];

      let spans = hitsArray.map((hit: any) => hit._source);

      if (props.filters.length > 0) {
        spans = spans.filter((span: any) => {
          return props.filters.every(
            ({ field, value }: { field: string; value: any }) => span[field] === value
          );
        });
      }

      const hierarchy = buildHierarchy(spans);
      setItems(hierarchy);
      setTotal(hierarchy.length);
    } catch (error) {
      console.error('Error parsing payloadData in SpanDetailTableHierarchy:', error);
    } finally {
      setIsSpansTableDataLoading(false);
    }
  }, [props.payloadData, props.DSL, props.mode, props.dataSourceMDSId, props.filters]);

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

  const flattenHierarchy = (spans: Span[], level = 0, isParentExpanded = true): Span[] => {
    return spans.flatMap((span) => {
      const isExpanded = expandedRows.has(span.spanId);
      const shouldShow = level === 0 || isParentExpanded;
      const row = shouldShow ? [{ ...span, level }] : [];
      const children = flattenHierarchy(span.children || [], level + 1, isExpanded && shouldShow);
      return [...row, ...children];
    });
  };

  const flattenedItems = useMemo(() => flattenHierarchy(items), [items, expandedRows]);

  const columns = useMemo(() => getColumns(mode), [mode]);
  const visibleColumns = useMemo(
    () => columns.filter(({ id }) => !hiddenColumns.includes(id)).map(({ id }) => id),
    [columns, hiddenColumns]
  );

  const gatherAllSpanIds = (spans: Span[]): Set<string> => {
    const allSpanIds = new Set<string>();
    const gather = (spanList: Span[]) => {
      spanList.forEach((span) => {
        allSpanIds.add(span.spanId);
        if (span.children.length > 0) {
          gather(span.children);
        }
      });
    };
    gather(spans);
    return allSpanIds;
  };

  const renderCellValue = useCallback(
    ({ rowIndex, columnId, disableInteractions }) => {
      const item = flattenedItems[rowIndex];
      const value = item[columnId];

      if (columnId === 'spanId') {
        const indentation = `${(item.level || 0) * 20}px`;
        const isExpanded = expandedRows.has(item.spanId);
        return (
          <div style={{ display: 'flex', alignItems: 'center', paddingLeft: indentation }}>
            {item.children.length > 0 ? (
              <EuiIcon
                type={isExpanded ? 'arrowDown' : 'arrowRight'}
                onClick={() => {
                  setExpandedRows((prev) => {
                    const newSet = new Set(prev);
                    if (newSet.has(item.spanId)) {
                      newSet.delete(item.spanId);
                    } else {
                      newSet.add(item.spanId);
                    }
                    return newSet;
                  });
                }}
                style={{ cursor: 'pointer', marginRight: 5 }}
                data-test-subj="treeViewExpandArrow"
              />
            ) : (
              <EuiIcon type="empty" style={{ visibility: 'hidden', marginRight: 5 }} />
            )}
            {disableInteractions ? (
              <span>{value}</span>
            ) : (
              <EuiLink
                onClick={() => openFlyout(value)}
                color="primary"
                data-test-subj="spanId-flyout-button"
              >
                {value}
              </EuiLink>
            )}
          </div>
        );
      }

      return renderSpanCellValue({
        rowIndex,
        columnId,
        items: flattenedItems,
        tableParams: { page: 0, size: flattenedItems.length },
        disableInteractions,
        props,
      });
    },
    [flattenedItems, expandedRows, openFlyout]
  );

  const toolbarButtons = [
    <EuiButtonEmpty
      size="xs"
      onClick={() => setExpandedRows(gatherAllSpanIds(items))}
      key="expandAll"
      color="text"
      iconType="expand"
      data-test-subj="treeExpandAll"
    >
      Expand all
    </EuiButtonEmpty>,
    <EuiButtonEmpty
      size="xs"
      onClick={() => setExpandedRows(new Set())}
      key="collapseAll"
      color="text"
      iconType="minimize"
      data-test-subj="treeCollapseAll"
    >
      Collapse all
    </EuiButtonEmpty>,
  ];

  return RenderCustomDataGrid({
    columns,
    renderCellValue,
    rowCount: flattenedItems.length,
    toolbarButtons,
    fullScreen: false,
    availableWidth,
    noMatchMessageSize: 'xl',
    visibleColumns,
    isTableDataLoading: isSpansTableDataLoading,
  });
}
