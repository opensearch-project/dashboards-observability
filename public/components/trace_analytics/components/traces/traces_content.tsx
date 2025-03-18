/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import datemath from '@elastic/datemath';
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
  handleCustomTracesRequest,
  handleTracesRequest,
} from '../../requests/traces_request_handler';
import { getValidFilterFields } from '../common/filters/filter_helpers';
import { Filters, FilterType } from '../common/filters/filters';
import { filtersToDsl, processTimeStamp } from '../common/helper_functions';
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
    dataPrepperIndicesExist,
    jaegerIndicesExist,
    attributesFilterFields,
    setCurrentSelectedService,
    tracesTableMode,
    setTracesTableMode,
  } = props;
  const [tableItems, setTableItems] = useState([]);
  const [columns, setColumns] = useState([]);
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

  //ADAM TESITNG DELETE console.log
  // const defaultSortField = props.tracesTableMode === 'traces' ? 'last_updated' : 'endTime';
  // const [sortingColumns, setSortingColumns] = useState<{ id: string; direction: "desc" | "asc" }[]>([{ id: defaultSortField, direction: "desc"}]);

  const [sortingColumns, setSortingColumns] = useState<{ id: string; direction: "desc" | "asc" }[]>([]);

  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const onSort = (sortColumns: { id: string; direction: "desc" | "asc" }[]) => {

    if (!sortColumns || sortColumns.length === 0) {
      setSortingColumns([]);
      refresh(undefined, query, pageIndex, pageSize);
      return;
    }

    const sortField = sortColumns[0]?.id;
    const sortDirection = sortColumns[0]?.direction;

    if (!sortField || !sortDirection) {
      console.error("Invalid sorting column:", sortColumns);
      return;
    }

    setSortingColumns(sortColumns);
    refresh(
      { field: sortField, direction: sortDirection },
      query,
      pageIndex,
      pageSize
    );
  };

  const [totalHits, setTotalHits] = useState(0);

  const generateDSLs = () => {
    return {
      DSL: filtersToDsl(
        mode,
        filters,
        query,
        processTimeStamp(startTime, mode),
        processTimeStamp(endTime, mode),
        page,
        appConfigs
      ),
      timeFilterDSL: filtersToDsl(
        mode,
        [],
        '',
        processTimeStamp(startTime, mode),
        processTimeStamp(endTime, mode),
        page
      ),
      isUnderOneHour: datemath.parse(endTime)?.diff(datemath.parse(startTime), 'hours')! < 1,
    };
  };
  
  const pagination = {
    pageIndex,
    pageSize,
    pageSizeOptions: [5, 10, 15],
    totalItemCount: totalHits,
    onChangePage: (newPage) => {
      const { DSL, isUnderOneHour, timeFilterDSL } = generateDSLs();
      refreshTableDataOnly(newPage, pageSize, DSL, isUnderOneHour, timeFilterDSL);
    },
    onChangeItemsPerPage: (newSize) => {
      const { DSL, isUnderOneHour, timeFilterDSL } = generateDSLs();
      refreshTableDataOnly(0, newSize, DSL, isUnderOneHour, timeFilterDSL);
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
    let newFilteredService = '';
    for (const filter of filters) {
      if (filter.field === 'serviceName') {
        newFilteredService = filter.value;
        break;
      }
    }
    setFilteredService(newFilteredService);
    if (
      !redirect &&
      (mode === 'custom_data_prepper' ||
        (mode === 'data_prepper' && dataPrepperIndicesExist) ||
        (mode === 'jaeger' && jaegerIndicesExist))
    )
      props.setDataSourceMenuSelectable?.(true);
    refresh();
  }, [
    filters,
    appConfigs,
    redirect,
    mode,
    jaegerIndicesExist,
    dataPrepperIndicesExist,
    includeMetrics,
    tracesTableMode,
    props.setDataSourceMenuSelectable,
    startTime,
    endTime,
    props.dataSourceMDSId,
  ]);

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

  const refreshTableDataOnly = async (
    newPageIndex: number,
    newPageSize: number,
    DSL: any,
    isUnderOneHour: boolean,
    timeFilterDSL: any
  ) => {
    setPageIndex(newPageIndex);
    setPageSize(newPageSize);
    setIsTraceTableLoading(true);
  
    const sortParams = sortingColumns.length > 0
      ? { field: sortingColumns[0].id, direction: sortingColumns[0].direction }
      : undefined;
  
    const tracesRequest =
      tracesTableMode !== 'traces'
        ? handleCustomIndicesTracesRequest(
            http,
            DSL,
            tableItems,
            setTableItems,
            setColumns,
            mode,
            newPageIndex,
            newPageSize,
            setTotalHits,
            props.dataSourceMDSId[0]?.id,
            sortParams,
            tracesTableMode,
            isUnderOneHour
          )
        : handleCustomTracesRequest(
            http,
            DSL,
            timeFilterDSL,
            tableItems,
            setTableItems,
            setTotalHits,
            mode,
            newPageIndex,
            newPageSize,
            props.dataSourceMDSId[0]?.id,
            sortParams,
            isUnderOneHour
          );
  
    tracesRequest.finally(() => setIsTraceTableLoading(false));
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
      processTimeStamp(endTime, mode),
      page,
      appConfigs
    );
    const timeFilterDSL = filtersToDsl(
      mode,
      [],
      '',
      processTimeStamp(startTime, mode),
      processTimeStamp(endTime, mode),
      page
    );
    const isUnderOneHour = datemath.parse(endTime)?.diff(datemath.parse(startTime), 'hours')! < 1;

    setIsTraceTableLoading(true);

    if (mode === 'custom_data_prepper') {
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
            setColumns,
            mode,
            newPageIndex,
            newPageSize,
            setTotalHits,
            props.dataSourceMDSId[0]?.id,
            sort,
            tracesTableMode,
            isUnderOneHour
          )
          : handleCustomTracesRequest(
            http,
            DSL,
            timeFilterDSL,
            tableItems,
            setTableItems,
            setTotalHits,
            mode,
            pageIndex,
            pageSize,
            props.dataSourceMDSId[0]?.id,
            sort,
            isUnderOneHour
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
        props.dataSourceMDSId[0].id,
        sort,
        isUnderOneHour
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

          {/* Switch between custom data prepper and regular table */}
          {mode === 'custom_data_prepper' ? (
            <TracesCustomIndicesTable
              columnItems={columns}
              items={tableItems}
              totalHits={totalHits}
              refresh={refresh}
              mode={mode}
              loading={isTraceTableLoading}
              getTraceViewUri={getTraceViewUri}
              openTraceFlyout={openTraceFlyout}
              jaegerIndicesExist={jaegerIndicesExist}
              dataPrepperIndicesExist={dataPrepperIndicesExist}
              tracesTableMode={tracesTableMode}
              setTracesTableMode={setTracesTableMode}
              sorting={sortingColumns}
              pagination={pagination}
              onSort={onSort}
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
              dataPrepperIndicesExist={dataPrepperIndicesExist}
              page={page}
            />
          )}

          {/* Show services list and graph when mode is custom data prepper */}
          {mode === 'custom_data_prepper' && (
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
              buttonContent={
                mode === 'data_prepper' || mode === 'custom_data_prepper'
                  ? 'Trace Groups'
                  : 'Service and Operations'
              }
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
