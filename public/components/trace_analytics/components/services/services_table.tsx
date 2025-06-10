/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import {
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiI18nNumber,
  EuiIcon,
  EuiInMemoryTable,
  EuiLink,
  EuiPanel,
  EuiSpacer,
  EuiTableFieldDataColumnType,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import truncate from 'lodash/truncate';
import React, { useMemo } from 'react';
import { DataSourceOption } from '../../../../../../../src/plugins/data_source_management/public';
import { ServiceTrends, TraceAnalyticsMode } from '../../../../../common/types/trace_analytics';
import { FilterType } from '../common/filters/filters';
import {
  generateServiceUrl,
  MissingConfigurationMessage,
  NoMatchMessage,
  PanelTitle,
} from '../common/helper_functions';
import { redirectToServiceLogs, redirectToServiceTraces } from '../common/redirection_helpers';
import { ServiceTrendsPlots } from './service_trends_plots';

interface ServicesTableProps {
  items: any[];
  selectedItems: any[];
  setSelectedItems: React.Dispatch<React.SetStateAction<any[]>>;
  addServicesGroupFilter: () => void;
  loading: boolean;
  traceColumnAction: any;
  setCurrentSelectedService: (value: React.SetStateAction<string>) => void;
  addFilter: (filter: FilterType) => void;
  setRedirect: (redirect: boolean) => void;
  mode: TraceAnalyticsMode;
  jaegerIndicesExist: boolean;
  isServiceTrendEnabled: boolean;
  setIsServiceTrendEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  serviceTrends: ServiceTrends;
  dataSourceMDSId: DataSourceOption[];
  startTime: string;
  endTime: string;
  page: 'app' | 'services';
}

export function ServicesTable(props: ServicesTableProps) {
  const {
    items,
    selectedItems,
    setSelectedItems,
    addServicesGroupFilter,
    mode,
    loading,
    traceColumnAction,
    setCurrentSelectedService,
    addFilter,
    setRedirect,
    jaegerIndicesExist,
    isServiceTrendEnabled,
    setIsServiceTrendEnabled,
    serviceTrends,
    dataSourceMDSId,
    startTime,
    endTime,
    page,
  } = props;

  const selectionValue = {
    onSelectionChange: (selections: any[]) => setSelectedItems(selections),
  };

  const nameColumnAction = (serviceName: string) => {
    if (page === 'app') {
      setCurrentSelectedService(serviceName);
    } else {
      window.location.href = generateServiceUrl(serviceName, dataSourceMDSId[0].id, props.mode);
    }
  };

  const renderTitleBar = (totalItems?: number) => {
    return (
      <EuiFlexGroup justifyContent="spaceBetween">
        <EuiFlexItem grow={false}>
          <PanelTitle title="Services" totalItems={totalItems} />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup>
            <EuiFlexItem>
              <EuiToolTip position="top" content="Select services to filter">
                <EuiButtonEmpty
                  size="xs"
                  onClick={addServicesGroupFilter}
                  isDisabled={selectedItems.length < 1}
                >
                  Filter services
                </EuiButtonEmpty>
              </EuiToolTip>
            </EuiFlexItem>
            {mode === 'data_prepper' && (
              <EuiFlexItem>
                <EuiButtonEmpty
                  size="xs"
                  onClick={() => setIsServiceTrendEnabled(!isServiceTrendEnabled)}
                >
                  {isServiceTrendEnabled ? 'Hide 24 hour trends' : 'Show 24 hour trends'}
                </EuiButtonEmpty>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  const columns = useMemo(() => {
    const baseColumns = [
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
        render: (item: any, row: any) => (
          <ServiceTrendsPlots
            item={item}
            row={row}
            isServiceTrendEnabled={isServiceTrendEnabled}
            fieldType="average_latency"
            serviceTrends={serviceTrends}
          />
        ),
      },
      {
        field: 'error_rate',
        name: 'Error rate',
        align: 'right',
        sortable: true,
        render: (item: any, row: any) => (
          <ServiceTrendsPlots
            item={item}
            row={row}
            isServiceTrendEnabled={isServiceTrendEnabled}
            fieldType="error_rate"
            serviceTrends={serviceTrends}
          />
        ),
      },
      {
        field: 'throughput',
        name: 'Request rate',
        align: 'right',
        sortable: true,
        truncateText: true,
        render: (item: any, row: any) => (
          <ServiceTrendsPlots
            item={item}
            row={row}
            isServiceTrendEnabled={isServiceTrendEnabled}
            fieldType="throughput"
            serviceTrends={serviceTrends}
          />
        ),
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
              page === 'app' ? (
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
                <EuiI18nNumber value={item} />
              )
            ) : (
              '-'
            )}
          </>
        ),
      },
    ];

    if (page !== 'app') {
      baseColumns.push({
        field: 'actions',
        name: 'Actions',
        align: 'center',
        render: (_item: any, row: any) => (
          <EuiFlexGroup justifyContent="center" gutterSize="m">
            <EuiFlexItem grow={false} onClick={() => setCurrentSelectedService(row.name)}>
              <EuiToolTip content="View service details">
                <EuiLink data-test-subj={'service-flyout-action-btn' + row.itemId}>
                  <EuiIcon type="inspect" color="primary" />
                </EuiLink>
              </EuiToolTip>
            </EuiFlexItem>
            <EuiFlexItem
              grow={false}
              onClick={() => {
                if (setCurrentSelectedService) setCurrentSelectedService('');
                setRedirect(true);
                redirectToServiceTraces({
                  mode,
                  addFilter,
                  dataSourceMDSId,
                  serviceName: row.name,
                });
              }}
            >
              <EuiToolTip content="View service traces">
                <EuiLink data-test-subj={'service-traces-redirection-btn' + row.itemId}>
                  <EuiIcon type="apmTrace" color="primary" />
                </EuiLink>
              </EuiToolTip>
            </EuiFlexItem>
            {mode === 'data_prepper' && (
              <>
                <EuiFlexItem
                  grow={false}
                  onClick={() =>
                    redirectToServiceLogs({
                      fromTime: startTime,
                      toTime: endTime,
                      dataSourceMDSId,
                      serviceName: row.name,
                    })
                  }
                >
                  <EuiToolTip content="View service logs">
                    <EuiLink data-test-subj={'service-logs-redirection-btn' + row.itemId}>
                      <EuiIcon type="discoverApp" color="primary" />
                    </EuiLink>
                  </EuiToolTip>
                </EuiFlexItem>
              </>
            )}
          </EuiFlexGroup>
        ),
        sortable: false,
      });
    }

    return baseColumns as Array<EuiTableFieldDataColumnType<any>>;
  }, [items, page]);

  const titleBar = useMemo(() => renderTitleBar(items?.length), [
    items,
    selectedItems,
    isServiceTrendEnabled,
  ]);

  return (
    <>
      <EuiPanel>
        {titleBar}
        <EuiSpacer size="m" />
        <EuiHorizontalRule margin="none" />
        {!(mode === 'data_prepper' || (mode === 'jaeger' && jaegerIndicesExist)) ? (
          <MissingConfigurationMessage mode={mode} />
        ) : items?.length > 0 || loading ? (
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
            selection={selectionValue}
            isSelectable={true}
            itemId="itemId"
          />
        ) : (
          <NoMatchMessage size="xl" mode={mode} />
        )}
      </EuiPanel>
    </>
  );
}
