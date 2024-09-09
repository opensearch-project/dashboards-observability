/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import {
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiCopy,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiInMemoryTable,
  EuiLink,
  EuiPanel,
  EuiSpacer,
  EuiTableFieldDataColumnType,
  EuiText,
  EuiToolTip,
  PropertySort,
} from '@elastic/eui';
import { CriteriaWithPagination } from '@opensearch-project/oui/src/eui_components/basic_table';
import round from 'lodash/round';
import truncate from 'lodash/truncate';
import moment from 'moment';
import React, { useMemo, useState } from 'react';
import {
  TRACE_ANALYTICS_DATE_FORMAT,
  TRACES_MAX_NUM,
} from '../../../../../common/constants/trace_analytics';
import { TraceAnalyticsMode } from '../../../../../common/types/trace_analytics';
import {
  MissingConfigurationMessage,
  nanoToMilliSec,
  NoMatchMessage,
  PanelTitle,
} from '../common/helper_functions';

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
}

export function TracesCustomIndicesTable(props: TracesLandingTableProps) {
  const { columnItems, items, refresh, mode, loading, getTraceViewUri, openTraceFlyout } = props;
  const [showAttributes, setShowAttributes] = useState(false);

  const renderTitleBar = (totalItems?: number) => {
    return (
      <EuiFlexGroup justifyContent="spaceBetween" gutterSize="s">
        <EuiFlexItem grow={false}>
          <PanelTitle title="Traces" totalItems={totalItems} />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty onClick={() => setShowAttributes(!showAttributes)}>
            {showAttributes ? 'Hide Attributes' : 'Show Attributes'}
          </EuiButtonEmpty>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  const dynamicColumns = columnItems
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
              <EuiText size="s">
                {item.length < 36 ? item : <div title={item}>{truncate(item, { length: 36 })}</div>}
              </EuiText>
            </EuiToolTip>
          </EuiText>
        ) : (
          '-'
        ),
    }));

  const columns = useMemo(() => {
    if (mode === 'custom_data_prepper' || mode === 'data_prepper') {
      return [
        {
          field: 'traceId',
          name: 'Trace ID',
          align: 'left',
          sortable: true,
          truncateText: false,
          render: (item) => (
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
                    <EuiButtonIcon
                      aria-label="Copy trace id"
                      iconType="copyClipboard"
                      onClick={copy}
                    >
                      Click to copy
                    </EuiButtonIcon>
                  )}
                </EuiCopy>
              </EuiFlexItem>
            </EuiFlexGroup>
          ),
        },
        {
          field: 'traceGroup',
          name: 'Trace group',
          align: 'left',
          sortable: true,
          truncateText: true,
          className: 'trace-group-column',
          render: (item) =>
            item ? (
              <EuiText size="s">
                {item.length < 36 ? item : <div title={item}>{truncate(item, { length: 36 })}</div>}
              </EuiText>
            ) : (
              '-'
            ),
        },
        {
          field: 'durationInNanos',
          name: 'Duration (ms)',
          align: 'right',
          sortable: true,
          truncateText: true,
          render: (item) =>
            item ? <EuiText size="s">{round(nanoToMilliSec(Math.max(0, item)), 2)}</EuiText> : '-',
        },
        {
          field: 'status.code',
          name: 'Errors',
          align: 'right',
          sortable: true,
          render: (item) =>
            item == null ? (
              '-'
            ) : +item === 2 ? (
              <EuiText color="danger" size="s">
                Yes
              </EuiText>
            ) : (
              'No'
            ),
        },
        {
          field: 'endTime',
          name: 'Last updated',
          align: 'right',
          sortable: true,
          className: 'trace-group-column',
          render: (item) =>
            item === 0 || item ? moment(item).format(TRACE_ANALYTICS_DATE_FORMAT) : '-',
        },
        ...(showAttributes ? dynamicColumns : []),
      ] as Array<EuiTableFieldDataColumnType<any>>;
    } else {
      return [
        {
          field: 'trace_id',
          name: 'Trace ID',
          align: 'left',
          sortable: true,
          truncateText: true,
          render: (item) => (
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
                    <EuiButtonIcon
                      aria-label="Copy trace id"
                      iconType="copyClipboard"
                      onClick={copy}
                    >
                      Click to copy
                    </EuiButtonIcon>
                  )}
                </EuiCopy>
              </EuiFlexItem>
            </EuiFlexGroup>
          ),
        },
        {
          field: 'latency',
          name: 'Latency (ms)',
          align: 'right',
          sortable: true,
          truncateText: true,
        },
        {
          field: 'error_count',
          name: 'Errors',
          align: 'right',
          sortable: true,
          render: (item) =>
            item == null ? (
              '-'
            ) : item > 0 ? (
              <EuiText color="danger" size="s">
                Yes
              </EuiText>
            ) : (
              'No'
            ),
        },
        {
          field: 'last_updated',
          name: 'Last updated',
          align: 'left',
          sortable: true,
          render: (item) => (item === 0 || item ? item : '-'),
        },
      ] as Array<EuiTableFieldDataColumnType<any>>;
    }
  }, [showAttributes, items]);

  const titleBar = useMemo(() => renderTitleBar(items?.length), [showAttributes, items]);

  const [sorting, setSorting] = useState<{ sort: PropertySort }>({
    sort: {
      field: 'trace_id',
      direction: 'asc',
    },
  });

  const onTableChange = async ({ sort }: CriteriaWithPagination<unknown>) => {
    if (typeof sort?.field !== 'string') return;

    // maps table column key to DSL aggregation name
    const fieldMappings = {
      trace_id: '_key',
      trace_group: null,
      latency: 'latency',
      percentile_in_trace_group: null,
      error_count: 'error_count',
      last_updated: 'last_updated',
    };
    const field = fieldMappings[sort.field as keyof typeof fieldMappings];
    if (!field || items?.length < TRACES_MAX_NUM) {
      setSorting({ sort });
      return;
    }

    // using await when sorting the default sorted field leads to a bug in UI,
    // user needs to click one time more to change sort back to ascending
    if (sort.field === 'trace_id') {
      refresh({ ...sort, field });
      setSorting({ sort });
      return;
    }

    await refresh({ ...sort, field });
    setSorting({ sort });
  };

  return (
    <>
      <EuiPanel>
        {titleBar}
        <EuiSpacer size="m" />
        <EuiHorizontalRule margin="none" />
        {!(
          mode === 'custom_data_prepper' ||
          (mode === 'data_prepper' && props.dataPrepperIndicesExist) ||
          (mode === 'jaeger' && props.jaegerIndicesExist)
        ) ? (
          <MissingConfigurationMessage mode={mode} />
        ) : items?.length > 0 || loading ? (
          <EuiInMemoryTable
            className="traces-scrollable-table"
            tableLayout="auto"
            allowNeutralSort={true}
            items={items}
            columns={columns}
            pagination={{
              initialPageSize: 10,
              pageSizeOptions: [5, 10, 15],
            }}
            sorting={sorting}
            onTableChange={onTableChange}
            loading={loading}
          />
        ) : (
          <NoMatchMessage size="xl" />
        )}
      </EuiPanel>
    </>
  );
}
