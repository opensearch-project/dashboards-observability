/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButtonIcon,
  EuiCopy,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiTableFieldDataColumnType,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { round } from 'lodash';
import moment from 'moment';
import React from 'react';
import { TRACE_ANALYTICS_DATE_FORMAT } from '../../../../../common/constants/trace_analytics';
import { TraceAnalyticsMode, TraceQueryMode } from '../../../../../common/types/trace_analytics';
import { nanoToMilliSec } from '../common/helper_functions';

export const fetchDynamicColumns = (columnItems: string[]) => {
  return columnItems
    .filter((col) => col.includes('attributes') || col.includes('instrumentation'))
    .map((col) => ({
      className: 'attributes-column',
      field: col,
      name: (
        <EuiText className="euiTableCellContent">
          <EuiToolTip content={col}>
            <p className="euiTableCellContent__text attributes-column-header">{col}</p>
          </EuiToolTip>
        </EuiText>
      ),
      align: 'right',
      sortable: true,
      truncateText: true,
      render: (item) =>
        item ? (
          <EuiText>
            <EuiToolTip content={item}>
              <EuiText size="s" className="attributes-column" title={item}>
                {item}
              </EuiText>
            </EuiToolTip>
          </EuiText>
        ) : (
          '-'
        ),
    }));
};

export const getTableColumns = (
  showAttributes: boolean,
  columnItems: string[],
  mode: TraceAnalyticsMode,
  tracesTableMode: TraceQueryMode,
  getTraceViewUri?: (traceId: string) => string,
  openTraceFlyout?: (traceId: string) => void
): Array<EuiTableFieldDataColumnType<any>> => {
  // Helper functions for rendering table fields
  const renderIdField = (item: string) =>
    item ? (
      <EuiText>
        <EuiToolTip content={item}>
          <EuiText size="s" className="traces-table traces-table-trace-id" title={item}>
            {item}
          </EuiText>
        </EuiToolTip>
      </EuiText>
    ) : (
      '-'
    );

  const renderTraceLinkField = (item: string) => (
    <EuiFlexGroup gutterSize="s" alignItems="center">
      <EuiFlexItem grow={false}>
        <EuiLink
          data-test-subj="trace-link"
          {...(getTraceViewUri && { href: getTraceViewUri(item) })}
          {...(openTraceFlyout && { onClick: () => openTraceFlyout(item) })}
        >
          <EuiText size="s" className="traces-table traces-table-trace-id" title={item}>
            {item}
          </EuiText>
        </EuiLink>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiCopy textToCopy={item}>
          {(copy) => (
            <EuiButtonIcon aria-label="Copy trace id" iconType="copyClipboard" onClick={copy} />
          )}
        </EuiCopy>
      </EuiFlexItem>
    </EuiFlexGroup>
  );

  const renderErrorsField = (item: number) =>
    item == null ? (
      '-'
    ) : +item > 0 ? (
      <EuiText color="danger" size="s">
        Yes
      </EuiText>
    ) : (
      'No'
    );

  const renderDurationField = (item: number) =>
    item ? <EuiText size="s">{round(nanoToMilliSec(Math.max(0, item)), 2)}</EuiText> : '-';

  const renderDateField = (item: number) =>
    item === 0 || item ? moment(item).format(TRACE_ANALYTICS_DATE_FORMAT) : '-';

  // Columns for custom_data_prepper mode
  if (mode === 'custom_data_prepper' && tracesTableMode !== 'traces') {
    return [
      {
        field: 'spanId',
        name: 'Span Id',
        align: 'left',
        sortable: true,
        render: renderIdField,
        className: 'span-group-column',
      },
      {
        field: 'traceId',
        name: 'Trace Id',
        align: 'left',
        sortable: true,
        render: renderTraceLinkField,
      },
      {
        field: 'parentSpanId',
        name: 'Parent Span Id',
        align: 'left',
        sortable: true,
        render: renderIdField,
        className: 'span-group-column',
      },
      {
        field: 'traceGroup',
        name: 'Trace group',
        align: 'left',
        sortable: true,
        truncateText: true,
      },
      {
        field: 'durationInNanos',
        name: 'Duration (ms)',
        align: 'right',
        sortable: true,
        render: renderDurationField,
      },
      {
        field: 'status.code',
        name: 'Errors',
        align: 'right',
        sortable: true,
        render: renderErrorsField,
      },
      {
        field: 'endTime',
        name: 'Last updated',
        align: 'right',
        sortable: true,
        render: renderDateField,
        className: 'span-group-column',
      },
      ...(showAttributes ? fetchDynamicColumns(columnItems) : []),
    ] as Array<EuiTableFieldDataColumnType<any>>;
  }

  // Columns for non-jaeger traces mode
  if (mode !== 'jaeger' && tracesTableMode === 'traces') {
    return [
      {
        field: 'trace_id',
        name: 'Trace ID',
        align: 'left',
        sortable: true,
        render: renderTraceLinkField,
      },
      {
        field: 'trace_group',
        name: 'Trace group',
        align: 'left',
        sortable: true,
        truncateText: true,
      },
      {
        field: 'latency',
        name: 'Duration (ms)',
        align: 'right',
        sortable: true,
        truncateText: true,
      },
      {
        field: 'percentile_in_trace_group',
        name: 'Percentile in trace group',
        align: 'right',
        sortable: true,
        render: (item) => (item ? `${round(item, 2)}th` : '-'),
      },
      {
        field: 'error_count',
        name: 'Errors',
        align: 'right',
        sortable: true,
        render: renderErrorsField,
      },
      {
        field: 'last_updated',
        name: 'Last updated',
        align: 'left',
        sortable: true,
        className: 'span-group-column',
      },
    ] as Array<EuiTableFieldDataColumnType<any>>;
  }

  // Default columns for other modes
  return [
    {
      field: 'trace_id',
      name: 'Trace ID',
      align: 'left',
      sortable: true,
      render: renderTraceLinkField,
    },
    { field: 'latency', name: 'Latency (ms)', align: 'right', sortable: true },
    {
      field: 'error_count',
      name: 'Errors',
      align: 'right',
      sortable: true,
      render: renderErrorsField,
    },
    {
      field: 'last_updated',
      name: 'Last updated',
      align: 'left',
      sortable: true,
      className: 'span-group-column',
    },
  ] as Array<EuiTableFieldDataColumnType<any>>;
};
