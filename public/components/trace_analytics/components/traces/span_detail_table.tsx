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
  EuiFlexGroup,
  EuiFlexItem,
  EuiSmallButton,
} from '@elastic/eui';
import round from 'lodash/round';
import moment from 'moment';
import React, { useEffect, useMemo, useState } from 'react';
import { HttpSetup } from '../../../../../../../src/core/public';
import { TRACE_ANALYTICS_DATE_FORMAT } from '../../../../../common/constants/trace_analytics';
import { TraceAnalyticsMode } from '../../../../../common/types/trace_analytics';
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

const gatherAllSpanIds = (spans) => {
  const allSpanIds = new Set();
  spans.forEach((span) => {
    allSpanIds.add(span.spanId);
    if (span.children && span.children.length > 0) {
      const childSpanIds = gatherAllSpanIds(span.children);
      childSpanIds.forEach((id) => allSpanIds.add(id));
    }
  });
  return allSpanIds;
};

export function SpanDetailTable(props: SpanDetailTableProps) {
  const { mode } = props;
  const [items, setItems] = useState<any>([]);
  const [total, setTotal] = useState(0);
  const [expandedRows, setExpandedRows] = useState(new Set());

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

        // Expand all rows by default
        const allExpandedIds = gatherAllSpanIds(hierarchy);
        setExpandedRows(allExpandedIds);
      },
      setTotal,
      spanSearchParams,
      props.DSL,
      mode,
      props.dataSourceMDSId
    );
  }, [props.DSL]);

  const buildHierarchy = (spans) => {
    const spanMap = {};
    spans.forEach((span) => {
      spanMap[span.spanId] = { ...span, children: [] };
    });
    const rootSpans = [];

    spans.forEach((span) => {
      if (span.parentSpanId && spanMap[span.parentSpanId]) {
        spanMap[span.parentSpanId].children.push(spanMap[span.spanId]);
      } else {
        rootSpans.push(spanMap[span.spanId]);
      }
    });

    return rootSpans;
  };

  const flattenHierarchy = (spans, level = 0, isParentExpanded = true) => {
    return spans.flatMap((span) => {
      const isExpanded = expandedRows.has(span.spanId);
      const shouldShow = level === 0 || isParentExpanded;
      const row = shouldShow ? [{ ...span, level }] : [];
      const children = flattenHierarchy(span.children, level + 1, isExpanded && shouldShow);
      return [...row, ...children];
    });
  };

  const flattenedItems = useMemo(() => flattenHierarchy(items), [items, expandedRows]);

  const columns: EuiDataGridColumn[] = [
    {
      id: mode === 'jaeger' ? 'spanID' : 'spanId',
      display: 'Span ID',
      initialWidth: 250,
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
    },
    {
      id: 'startTime',
      display: 'Start time',
    },
    {
      id: mode === 'jaeger' ? 'jaegerEndTime' : 'endTime',
      display: 'End time',
    },
    {
      id: mode === 'jaeger' ? 'tag' : 'status.code',
      display: 'Errors',
    },
  ];

  const [visibleColumns, setVisibleColumns] = useState(() =>
    columns
      .filter(({ id }) => props.hiddenColumns.findIndex((column) => column === id) === -1)
      .map(({ id }) => id)
  );

  const toggleRowExpansion = (spanId) => {
    setExpandedRows((prevExpandedRows) => {
      const newExpandedRows = new Set(prevExpandedRows);
      if (newExpandedRows.has(spanId)) {
        newExpandedRows.delete(spanId);
      } else {
        newExpandedRows.add(spanId);
      }
      return newExpandedRows;
    });
  };

  const renderCellValue = useMemo(() => {
    return ({ rowIndex, columnId }: { rowIndex: number; columnId: string }) => {
      const span = flattenedItems[rowIndex];
      if (!span) return '-';

      const value = span[columnId];
      const indentation = `${span.level * 20}px`; // Indent based on the level of hierarchy
      const isRowExpanded = expandedRows.has(span.spanId);

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
              {span.children.length > 0 ? (
                <EuiIcon
                  type={isRowExpanded ? 'arrowDown' : 'arrowRight'}
                  onClick={() => toggleRowExpansion(span.spanId)}
                  style={{ cursor: 'pointer', marginRight: 5 }}
                />
              ) : (
                <EuiIcon type="empty" style={{ visibility: 'hidden', marginRight: 5 }} />
              )}
              <EuiLink data-test-subj="spanId-link" onClick={() => props.openFlyout(value)}>
                {value}
              </EuiLink>
            </div>
          );
        case 'durationInNanos':
          return `${round(nanoToMilliSec(Math.max(0, value)), 2)} ms`;
        case 'duration':
          return `${round(microToMilliSec(Math.max(0, value)), 2)} ms`;
        case 'startTime':
          return mode === 'jaeger'
            ? moment(round(microToMilliSec(Math.max(0, value)), 2)).format(
                TRACE_ANALYTICS_DATE_FORMAT
              )
            : moment(value).format(TRACE_ANALYTICS_DATE_FORMAT);
        case 'jaegerEndTime':
          return moment(
            round(microToMilliSec(Math.max(0, span.startTime + span.duration)), 2)
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
          return value || '-';
      }
    };
  }, [flattenedItems, expandedRows]);

  const expandAllRows = () => {
    const allExpandedIds = gatherAllSpanIds(items);
    setExpandedRows(allExpandedIds);
  };

  const collapseAllRows = () => {
    setExpandedRows(new Set());
  };

  const toolbarButtons = (
    <EuiFlexGroup justifyContent="flexEnd" alignItems="center" gutterSize="s">
      <EuiFlexItem grow={false}>
        <EuiSmallButton onClick={expandAllRows}>Expand All</EuiSmallButton>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiSmallButton onClick={collapseAllRows}>Collapse All</EuiSmallButton>
      </EuiFlexItem>
    </EuiFlexGroup>
  );

  return (
    <div style={{ height: '700px', overflowY: 'auto' }}>
      <EuiDataGrid
        aria-labelledby="span-detail-data-grid"
        columns={columns}
        columnVisibility={{ visibleColumns, setVisibleColumns }}
        rowCount={flattenedItems.length}
        renderCellValue={renderCellValue}
        toolbarVisibility={
          mode === 'jaeger'
            ? false
            : {
                showColumnSelector: true,
                showSortSelector: true,
                showFullScreenSelector: true,
                additionalControls: toolbarButtons,
              }
        }
      />
      {total === 0 && <NoMatchMessage size="xl" />}
    </div>
  );
}
