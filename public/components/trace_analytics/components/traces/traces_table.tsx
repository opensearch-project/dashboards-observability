/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import {
  EuiCopy,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiInMemoryTable,
  EuiLink,
  EuiPanel,
  EuiSmallButtonIcon,
  EuiSpacer,
  EuiTableFieldDataColumnType,
  EuiText,
  PropertySort,
} from '@elastic/eui';
import { CriteriaWithPagination } from '@opensearch-project/oui/src/eui_components/basic_table';
import round from 'lodash/round';
import truncate from 'lodash/truncate';
import React, { useMemo, useState } from 'react';
import { TRACES_MAX_NUM } from '../../../../../common/constants/trace_analytics';
import { TraceAnalyticsMode } from '../../../../../common/types/trace_analytics';
import { MAX_DISPLAY_ROWS } from '../common/constants';
import {
  appendModeToTraceViewUri,
  MissingConfigurationMessage,
  NoMatchMessage,
  PanelTitle,
} from '../common/helper_functions';

interface TracesTableProps {
  items: any[];
  refresh: (sort?: PropertySort) => Promise<void>;
  mode: TraceAnalyticsMode;
  loading: boolean;
  getTraceViewUri?: (traceId: string) => string;
  openTraceFlyout?: (traceId: string) => void;
  jaegerIndicesExist: boolean;
  page?: 'traces' | 'app';
  uniqueTraces: number;
}

export function TracesTable(props: TracesTableProps) {
  const { items, refresh, mode, loading, getTraceViewUri, openTraceFlyout, uniqueTraces } = props;
  const renderTitleBar = (rowCount: number, totalCount: number) => {
    const totalCountText = totalCount > MAX_DISPLAY_ROWS ? `${MAX_DISPLAY_ROWS}+` : totalCount;

    return (
      <EuiFlexGroup alignItems="center" gutterSize="s">
        <EuiFlexItem grow={10}>
          <PanelTitle title="Traces" totalItems={rowCount} />
        </EuiFlexItem>
        {totalCount > rowCount && (
          <span className="trace-table-warning">{`Results out of ${totalCountText}`}</span>
        )}
      </EuiFlexGroup>
    );
  };

  const columns = useMemo(() => {
    // Extract the current mode from the URL or session storage
    const currentUrl = window.location.href;
    const traceMode =
      new URLSearchParams(currentUrl.split('?')[1]).get('mode') ||
      sessionStorage.getItem('TraceAnalyticsMode');

    if (mode === 'data_prepper') {
      return [
        {
          field: 'trace_id',
          name: 'Trace Id',
          align: 'left',
          sortable: true,
          truncateText: false,
          render: (item) => (
            <EuiFlexGroup gutterSize="s" alignItems="center">
              <EuiFlexItem grow={false}>
                <EuiLink
                  data-test-subj="trace-link"
                  {...(props.page !== 'app' && {
                    href: appendModeToTraceViewUri(item, getTraceViewUri, traceMode),
                  })}
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
                    <EuiSmallButtonIcon
                      aria-label="Copy trace id"
                      iconType="copyClipboard"
                      onClick={copy}
                    >
                      Click to copy
                    </EuiSmallButtonIcon>
                  )}
                </EuiCopy>
              </EuiFlexItem>
            </EuiFlexGroup>
          ),
        },
        {
          field: 'trace_group',
          name: 'Trace group',
          align: 'left',
          sortable: true,
          truncateText: true,
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
          field: 'latency',
          name: 'Duration (ms)',
          align: 'right',
          sortable: true,
          truncateText: true,
          render: (item) => (item === 0 || item ? item : '-'),
        },
        {
          field: 'percentile_in_trace_group',
          name: <div>Percentile in trace group</div>,
          align: 'right',
          sortable: true,
          render: (item) =>
            item === 0 || item ? <EuiText size="s">{`${round(item, 2)}th`}</EuiText> : '-',
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
    } else {
      return [
        {
          field: 'trace_id',
          name: 'Trace Id',
          align: 'left',
          sortable: true,
          truncateText: true,
          render: (item) => (
            <EuiFlexGroup gutterSize="s" alignItems="center">
              <EuiFlexItem grow={false}>
                <EuiLink
                  data-test-subj="trace-link"
                  href={appendModeToTraceViewUri(item, getTraceViewUri, traceMode)}
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
                    <EuiSmallButtonIcon
                      aria-label="Copy trace id"
                      iconType="copyClipboard"
                      onClick={copy}
                    >
                      Click to copy
                    </EuiSmallButtonIcon>
                  )}
                </EuiCopy>
              </EuiFlexItem>
              <EuiFlexItem grow={3} />
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
  }, [items]);

  const titleBar = useMemo(() => renderTitleBar(items?.length, uniqueTraces), [
    items,
    uniqueTraces,
  ]);

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
        {!(mode === 'data_prepper' || (mode === 'jaeger' && props.jaegerIndicesExist)) ? (
          <MissingConfigurationMessage mode={mode} />
        ) : items?.length > 0 || loading ? (
          <EuiInMemoryTable
            tableLayout="auto"
            allowNeutralSort={false}
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
          <NoMatchMessage size="xl" mode={mode} />
        )}
      </EuiPanel>
    </>
  );
}
