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
import { ServiceTrends, TraceAnalyticsMode } from '../../../../../common/types/trace_analytics';
import { FilterType } from '../common/filters/filters';
import {
  MissingConfigurationMessage,
  NoMatchMessage,
  PanelTitle,
} from '../common/helper_functions';
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
  dataPrepperIndicesExist: boolean;
  isServiceTrendEnabled: boolean;
  setIsServiceTrendEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  serviceTrends: ServiceTrends;
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
    dataPrepperIndicesExist,
    isServiceTrendEnabled,
    setIsServiceTrendEnabled,
    serviceTrends,
  } = props;

  const selectionValue = {
    onSelectionChange: (selections: any[]) => setSelectedItems(selections),
  };

  const nameColumnAction = (serviceName: string) => {
    addFilter({
      field: mode === 'jaeger' ? 'process.serviceName' : 'serviceName',
      operator: 'is',
      value: serviceName,
      inverted: false,
      disabled: false,
    });
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
            {(mode === 'data_prepper' || mode === 'custom_data_prepper') && (
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
        ...(mode === 'data_prepper' || mode === 'custom_data_prepper'
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
        ...(mode === 'data_prepper' || mode === 'custom_data_prepper'
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
        {
          field: 'actions',
          name: 'Actions',
          align: 'center',
          render: (_item: any, row: any) => (
            <EuiFlexGroup justifyContent="center">
              <EuiFlexItem grow={false} onClick={() => setCurrentSelectedService(row.name)}>
                <EuiLink data-test-subj={'service-flyout-action-btn' + row.itemId}>
                  <EuiIcon type="inspect" color="primary" />
                </EuiLink>
              </EuiFlexItem>
            </EuiFlexGroup>
          ),
        },
      ] as Array<EuiTableFieldDataColumnType<any>>,
    [items]
  );

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
        {!(
          mode === 'custom_data_prepper' ||
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
            selection={selectionValue}
            isSelectable={true}
            itemId="itemId"
          />
        ) : (
          <NoMatchMessage size="xl" />
        )}
      </EuiPanel>
    </>
  );
}
