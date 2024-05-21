/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiI18nNumber,
  EuiInMemoryTable,
  EuiLink,
  EuiPanel,
  EuiSpacer,
  EuiTableFieldDataColumnType,
  EuiText,
} from '@elastic/eui';
import round from 'lodash/round';
import truncate from 'lodash/truncate';
import React, { useMemo } from 'react';
import { TraceAnalyticsMode } from '../../home';
import { FilterType } from '../common/filters/filters';
import {
  MissingConfigurationMessage,
  NoMatchMessage,
  PanelTitle,
} from '../common/helper_functions';

interface ServicesTableProps {
  items: any[];
  loading: boolean;
  nameColumnAction: (item: any) => any;
  traceColumnAction: any;
  addFilter: (filter: FilterType) => void;
  setRedirect: (redirect: boolean) => void;
  mode: TraceAnalyticsMode;
  jaegerIndicesExist: boolean;
  dataPrepperIndicesExist: boolean;
}

export function ServicesTable(props: ServicesTableProps) {
  const {
    items,
    mode,
    loading,
    nameColumnAction,
    traceColumnAction,
    addFilter,
    setRedirect,
    jaegerIndicesExist,
    dataPrepperIndicesExist,
  } = props;
  const renderTitleBar = (totalItems?: number) => {
    return (
      <EuiFlexGroup alignItems="center" gutterSize="s">
        <EuiFlexItem grow={10}>
          <PanelTitle title="Services" totalItems={totalItems} />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  const columns = useMemo(
    () =>
      [
        {
          field: 'name',
          name: 'Name',
          align: 'left',
          sortable: true,
          render: (item: any) => (
            <EuiLink data-test-subj="service-link" onClick={() => nameColumnAction(item)}>
              {item.length < 24 ? item : <div title={item}>{truncate(item, { length: 24 })}</div>}
            </EuiLink>
          ),
        },
        {
          field: 'average_latency',
          name: 'Average duration (ms)',
          align: 'right',
          sortable: true,
          render: (item: any) => (item === 0 || item ? round(item, 2) : '-'),
        },
        {
          field: 'error_rate',
          name: 'Error rate',
          align: 'right',
          sortable: true,
          render: (item) =>
            item === 0 || item ? <EuiText size="s">{`${round(item, 2)}%`}</EuiText> : '-',
        },
        {
          field: 'throughput',
          name: 'Request rate',
          align: 'right',
          sortable: true,
          truncateText: true,
          render: (item: any) => (item === 0 || item ? <EuiI18nNumber value={item} /> : '-'),
        },
        ...(mode === 'data_prepper'
          ? [
              {
                field: 'number_of_connected_services',
                name: 'No. of connected services',
                align: 'right',
                sortable: true,
                truncateText: true,
                width: '80px',
                render: (item: any) => (item === 0 || item ? item : '-'),
              },
            ]
          : []),
        ...(mode === 'data_prepper'
          ? [
              {
                field: 'connected_services',
                name: 'Connected services',
                align: 'left',
                sortable: true,
                truncateText: true,
                render: (item: any) =>
                  item ? (
                    <EuiText size="s">{truncate(item.join(', '), { length: 50 })}</EuiText>
                  ) : (
                    '-'
                  ),
              },
            ]
          : []),
        {
          field: 'traces',
          name: 'Traces',
          align: 'right',
          sortable: true,
          truncateText: true,
          render: (item: any, row: any) => (
            <>
              {item === 0 || item ? (
                <EuiLink
                  onClick={() => {
                    setRedirect(true);
                    addFilter({
                      field: mode === 'jaeger' ? 'process.serviceName' : 'serviceName',
                      operator: 'is',
                      value: row.name,
                      inverted: false,
                      disabled: false,
                    });
                    traceColumnAction();
                  }}
                >
                  <EuiI18nNumber value={item} />
                </EuiLink>
              ) : (
                '-'
              )}
            </>
          ),
        },
      ] as Array<EuiTableFieldDataColumnType<any>>,
    [items]
  );

  const titleBar = useMemo(() => renderTitleBar(items?.length), [items]);

  return (
    <>
      <EuiPanel>
        {titleBar}
        <EuiSpacer size="m" />
        <EuiHorizontalRule margin="none" />
        {!(
          (mode === 'data_prepper' && dataPrepperIndicesExist) ||
          (mode === 'jaeger' && jaegerIndicesExist)
        ) ? (
          <MissingConfigurationMessage mode={mode} />
        ) : items?.length > 0 ? (
          <EuiInMemoryTable
            tableLayout="auto"
            items={items}
            columns={columns}
            pagination={{
              initialPageSize: 10,
              pageSizeOptions: [5, 10, 15],
            }}
            sorting={{
              sort: {
                field: 'name',
                direction: 'asc',
              },
            }}
            loading={loading}
          />
        ) : (
          <NoMatchMessage size="xl" />
        )}
      </EuiPanel>
    </>
  );
}
