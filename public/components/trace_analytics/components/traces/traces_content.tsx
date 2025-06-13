/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import {
  EuiAccordion,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPage,
  EuiPageBody,
  EuiPanel,
  EuiSpacer,
  PropertySort,
} from '@elastic/eui';
import cloneDeep from 'lodash/cloneDeep';
import React, { useEffect, useState } from 'react';
import { coreRefs } from '../../../../framework/core_refs';
import { handleServiceMapRequest } from '../../requests/services_request_handler';
import {
  handleCustomIndicesTracesRequest,
  handleTracesRequest,
} from '../../requests/traces_request_handler';
import { getValidFilterFields } from '../common/filters/filter_helpers';
import { Filters, FilterType } from '../common/filters/filters';
import { filtersToDsl, isUnderOneHourRange, processTimeStamp } from '../common/helper_functions';
import { ServiceMap, ServiceObject } from '../common/plots/service_map';
import { SearchBar } from '../common/search_bar';
import { DashboardContent } from '../dashboard/dashboard_content';
import { DataSourcePicker } from '../dashboard/mode_picker';
import { ServicesList } from './services_list';
import { TracesProps } from './traces';
import { TracesCustomIndicesTable } from './traces_custom_indices_table';
import { TracesTable } from './traces_table';

export function TracesContent(props: TracesProps) {
  const {
    page,
    http,
    chrome,
    query,
    filters,
    appConfigs = [],
    startTime,
    endTime,
    childBreadcrumbs,
    getTraceViewUri,
    openTraceFlyout,
    setQuery,
    setFilters,
    setStartTime,
    setEndTime,
    mode,
    jaegerIndicesExist,
    attributesFilterFields,
    setCurrentSelectedService,
    tracesTableMode,
    setTracesTableMode,
  } = props;
  const [tableItems, setTableItems] = useState([]);
  const [redirect, setRedirect] = useState(true);
  const [isTraceTableLoading, setIsTraceTableLoading] = useState(false);
  const [isServicesDataLoading, setIsServicesDataLoading] = useState(false);
  const [trigger, setTrigger] = useState<'open' | 'closed'>('closed');
  const [serviceMap, setServiceMap] = useState<ServiceObject>({});
  const [filteredService, setFilteredService] = useState('');
  const [serviceMapIdSelected, setServiceMapIdSelected] = useState<
    'latency' | 'error_rate' | 'throughput'
  >('');
  const [includeMetrics, setIncludeMetrics] = useState(false);
  const isNavGroupEnabled = coreRefs?.chrome?.navGroup.getNavGroupEnabled();
  const [maxTraces, setMaxTraces] = useState(500);
  const [uniqueTraces, setUniqueTraces] = useState(0);
  const [sortingColumns, setSortingColumns] = useState<
    Array<{ id: string; direction: 'desc' | 'asc' }>
  >([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const getDefaultSort = () => {
    return tracesTableMode === 'traces'
      ? { field: 'last_updated', direction: 'desc' as const }
      : { field: 'endTime', direction: 'desc' as const };
  };

  const onSort = (sortColumns: Array<{ id: string; direction: 'desc' | 'asc' }>) => {
    if (!sortColumns || sortColumns.length === 0) {
      setSortingColumns([]);
      return;
    }

    const sortField = sortColumns[0]?.id;
    const sortDirection = sortColumns[0]?.direction;

    if (!sortField || !sortDirection) {
      console.error('Invalid sorting column:', sortColumns);
      return;
    }

    setSortingColumns(sortColumns);

    if (tracesTableMode === 'traces') {
      const sort = { field: sortField, direction: sortDirection };
      refreshTracesTableData(sort, 0, pageSize);
    } else {
      const { DSL, isUnderOneHour } = generateDSLs();
      refreshSpanTableData(pageIndex, pageSize, DSL, isUnderOneHour, {
        field: sortField,
        direction: sortDirection,
      });
    }
  };

  const [totalHits, setTotalHits] = useState(0);

  const generateDSLs = () => {
    return {
      DSL: filtersToDsl(
        mode,
        filters,
        query,
        processTimeStamp(startTime, mode),
        processTimeStamp(endTime, mode, true),
        page,
        appConfigs
      ),
      isUnderOneHour: isUnderOneHourRange(startTime, endTime),
    };
  };

  const pagination = {
    pageIndex,
    pageSize,
    pageSizeOptions: [10, 20, 50],
    totalItemCount: totalHits,
    onChangePage: (newPage) => {
      if (tracesTableMode === 'traces') {
        setPageIndex(newPage);
      } else {
        const { DSL, isUnderOneHour } = generateDSLs();
        const currentSort = sortingColumns[0]
          ? { field: sortingColumns[0].id, direction: sortingColumns[0].direction }
          : undefined;
        refreshSpanTableData(newPage, pageSize, DSL, isUnderOneHour, currentSort);
      }
    },
    onChangeItemsPerPage: (newSize) => {
      if (tracesTableMode === 'traces') {
        setPageSize(newSize);
      } else {
        const { DSL, isUnderOneHour } = generateDSLs();
        const currentSort = sortingColumns[0]
          ? { field: sortingColumns[0].id, direction: sortingColumns[0].direction }
          : undefined;
        refreshSpanTableData(0, newSize, DSL, isUnderOneHour, currentSort);
      }
    },
  };

  useEffect(() => {
    chrome.setBreadcrumbs([
      ...(isNavGroupEnabled ? [] : [props.parentBreadcrumb]),
      ...childBreadcrumbs,
    ]);
    const validFilters = getValidFilterFields(mode, 'traces', attributesFilterFields);
    setFilters([
      ...filters.map((filter) => ({
        ...filter,
        locked: validFilters.indexOf(filter.field) === -1,
      })),
    ]);
    setRedirect(false);
  }, []);

  useEffect(() => {
    setPageIndex(0);
    let newFilteredService = '';
    for (const filter of filters) {
      if (filter.field === 'serviceName') {
        newFilteredService = filter.value;
        break;
      }
    }
    setFilteredService(newFilteredService);
    if (!redirect && (mode === 'data_prepper' || (mode === 'jaeger' && jaegerIndicesExist)))
      props.setDataSourceMenuSelectable?.(true);
    refresh();
  }, [
    filters,
    appConfigs,
    redirect,
    mode,
    jaegerIndicesExist,
    includeMetrics,
    tracesTableMode,
    props.setDataSourceMenuSelectable,
    startTime,
    endTime,
    props.dataSourceMDSId,
  ]);

  useEffect(() => {
    if (tracesTableMode !== 'traces') return;

    const currentSort = sortingColumns[0];

    const sort = currentSort
      ? { field: currentSort.id, direction: currentSort.direction }
      : undefined;

    refreshTracesTableData(sort, pageIndex, pageSize);
  }, [maxTraces]);

  const onToggle = (isOpen: boolean) => {
    const newState = isOpen ? 'open' : 'closed';
    setTrigger(newState);
  };

  const addFilter = (filter: FilterType) => {
    for (let i = 0; i < filters.length; i++) {
      const addedFilter = filters[i];
      if (addedFilter.field === filter.field) {
        if (addedFilter.operator === filter.operator && addedFilter.value === filter.value) return;
        const newFilters = [...filters];
        newFilters.splice(i, 1, filter);
        setFilters(newFilters);
        return;
      }
    }
    const newFilters = [...filters, filter];
    setFilters(newFilters);
  };

  const refreshSpanTableData = async (
    newPageIndex: number,
    newPageSize: number,
    DSL: any,
    isUnderOneHour: boolean,
    sortParams?: { field: string; direction: 'desc' | 'asc' }
  ) => {
    setPageIndex(newPageIndex);
    setPageSize(newPageSize);
    setIsTraceTableLoading(true);
    const sort = sortParams ?? getDefaultSort();

    handleCustomIndicesTracesRequest(
      http,
      DSL,
      tableItems,
      setTableItems,
      mode,
      newPageIndex,
      newPageSize,
      setTotalHits,
      props.dataSourceMDSId[0]?.id,
      sort,
      tracesTableMode,
      isUnderOneHour
    ).finally(() => setIsTraceTableLoading(false));
  };

  const refreshTracesTableData = async (
    sortParams?: { field: string; direction: 'desc' | 'asc' },
    newPageIndex: number = pageIndex,
    newPageSize: number = pageSize
  ) => {
    setPageIndex(newPageIndex);
    setPageSize(newPageSize);
    setIsTraceTableLoading(true);
    const sort = sortParams ?? getDefaultSort();

    const DSL = filtersToDsl(
      mode,
      filters,
      query,
      processTimeStamp(startTime, mode),
      processTimeStamp(endTime, mode, true),
      page,
      appConfigs
    );

    const timeFilterDSL = filtersToDsl(
      mode,
      [],
      '',
      processTimeStamp(startTime, mode),
      processTimeStamp(endTime, mode, true),
      page
    );

    const isUnderOneHour = isUnderOneHourRange(startTime, endTime);

    await handleTracesRequest(
      http,
      DSL,
      timeFilterDSL,
      tableItems,
      setTableItems,
      mode,
      maxTraces,
      props.dataSourceMDSId[0].id,
      sort,
      isUnderOneHour
    ).finally(() => setIsTraceTableLoading(false));
  };

  const refresh = async (
    sort?: PropertySort,
    overrideQuery?: string,
    newPageIndex: number = pageIndex,
    newPageSize: number = pageSize
  ) => {
    const filterQuery = overrideQuery ?? query;
    const DSL = filtersToDsl(
      mode,
      filters,
      filterQuery,
      processTimeStamp(startTime, mode),
      processTimeStamp(endTime, mode, true),
      page,
      appConfigs
    );
    const timeFilterDSL = filtersToDsl(
      mode,
      [],
      '',
      processTimeStamp(startTime, mode),
      processTimeStamp(endTime, mode, true),
      page
    );
    const isUnderOneHour = isUnderOneHourRange(startTime, endTime);
    const newSort = sort ?? getDefaultSort();

    setIsTraceTableLoading(true);

    if (mode === 'data_prepper') {
      // Remove serviceName filter from service map query
      const serviceMapDSL = cloneDeep(DSL);
      serviceMapDSL.query.bool.must = serviceMapDSL.query.bool.must.filter(
        (must: any) => !must?.term?.serviceName
      );

      const tracesRequest =
        tracesTableMode !== 'traces'
          ? handleCustomIndicesTracesRequest(
              http,
              DSL,
              tableItems,
              setTableItems,
              mode,
              newPageIndex,
              newPageSize,
              setTotalHits,
              props.dataSourceMDSId[0]?.id,
              newSort,
              tracesTableMode,
              isUnderOneHour
            )
          : handleTracesRequest(
              http,
              DSL,
              timeFilterDSL,
              tableItems,
              setTableItems,
              mode,
              maxTraces,
              props.dataSourceMDSId[0].id,
              newSort,
              isUnderOneHour,
              setUniqueTraces
            );
      tracesRequest.finally(() => setIsTraceTableLoading(false));

      setIsServicesDataLoading(true);
      handleServiceMapRequest(
        http,
        serviceMapDSL,
        mode,
        props.dataSourceMDSId[0].id,
        setServiceMap,
        includeMetrics
      ).finally(() => setIsServicesDataLoading(false));
    } else {
      handleTracesRequest(
        http,
        DSL,
        timeFilterDSL,
        tableItems,
        setTableItems,
        mode,
        maxTraces,
        props.dataSourceMDSId[0].id,
        sort,
        isUnderOneHour,
        setUniqueTraces
      ).finally(() => setIsTraceTableLoading(false));
    }
  };

  const dashboardContent = () => {
    return <DashboardContent {...props} />;
  };

  return (
    <>
      <EuiPage paddingSize="m">
        <EuiPageBody>
          <EuiFlexGroup gutterSize="s" alignItems="center" justifyContent="spaceBetween">
            <EuiFlexItem grow={false}>
              <DataSourcePicker
                modes={props.modes}
                selectedMode={props.mode}
                setMode={props.setMode!}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={true}>
              <SearchBar
                query={query}
                filters={filters}
                appConfigs={appConfigs}
                setFilters={setFilters}
                setQuery={setQuery}
                startTime={startTime}
                setStartTime={setStartTime}
                endTime={endTime}
                setEndTime={setEndTime}
                refresh={refresh}
                page={page}
                mode={mode}
                attributesFilterFields={attributesFilterFields}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
          <Filters
            page={page}
            filters={filters}
            setFilters={setFilters}
            appConfigs={appConfigs}
            mode={mode}
            attributesFilterFields={attributesFilterFields}
          />
          <EuiSpacer size="s" />

          {/* Switch between data prepper and Jaeger table */}
          {mode === 'data_prepper' && page !== 'app' ? (
            <TracesCustomIndicesTable
              columnItems={attributesFilterFields}
              items={tableItems}
              totalHits={totalHits}
              mode={mode}
              loading={isTraceTableLoading}
              getTraceViewUri={getTraceViewUri}
              openTraceFlyout={openTraceFlyout}
              jaegerIndicesExist={jaegerIndicesExist}
              tracesTableMode={tracesTableMode}
              setTracesTableMode={(tableMode) => {
                setTracesTableMode(tableMode);
                setSortingColumns([]);
                setPageIndex(0);
              }}
              sorting={sortingColumns}
              pagination={pagination}
              onSort={onSort}
              maxTraces={maxTraces}
              setMaxTraces={setMaxTraces}
              uniqueTraces={uniqueTraces}
            />
          ) : (
            <TracesTable
              items={tableItems}
              refresh={refresh}
              mode={mode}
              loading={isTraceTableLoading}
              getTraceViewUri={getTraceViewUri}
              openTraceFlyout={openTraceFlyout}
              jaegerIndicesExist={jaegerIndicesExist}
              page={page}
              uniqueTraces={uniqueTraces}
            />
          )}

          {/* Show services list and graph when mode is data prepper */}
          {mode === 'data_prepper' && page !== 'app' && (
            <>
              <EuiSpacer size="m" />
              <EuiFlexGroup>
                <EuiFlexItem grow={2}>
                  <ServicesList
                    addFilter={addFilter}
                    filters={filters}
                    setFilters={setFilters}
                    serviceMap={serviceMap}
                    isServicesDataLoading={isServicesDataLoading}
                    filteredService={filteredService}
                    setFilteredService={setFilteredService}
                  />
                  <EuiSpacer size="m" />
                </EuiFlexItem>
                <EuiFlexItem grow={8}>
                  <ServiceMap
                    addFilter={addFilter}
                    filters={filters}
                    setFilters={setFilters}
                    serviceMap={serviceMap}
                    isServicesDataLoading={isServicesDataLoading}
                    idSelected={serviceMapIdSelected}
                    setIdSelected={setServiceMapIdSelected}
                    page={page}
                    currService={filteredService}
                    setCurrentSelectedService={setCurrentSelectedService}
                    includeMetricsCallback={() => {
                      setIncludeMetrics(true);
                    }}
                  />
                </EuiFlexItem>
              </EuiFlexGroup>
            </>
          )}

          <EuiSpacer size="s" />
          <EuiPanel>
            <EuiAccordion
              id="accordion1"
              buttonContent={mode === 'data_prepper' ? 'Trace Groups' : 'Service and Operations'}
              forceState={trigger}
              onToggle={onToggle}
              data-test-subj="trace-groups-service-operation-accordian"
            >
              <EuiSpacer size="m" />
              {trigger === 'open' && dashboardContent()}
            </EuiAccordion>
          </EuiPanel>
        </EuiPageBody>
      </EuiPage>
    </>
  );
}
