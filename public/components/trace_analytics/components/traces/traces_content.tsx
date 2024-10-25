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
  const [loading, setLoading] = useState(false);
  const [trigger, setTrigger] = useState<'open' | 'closed'>('closed');
  const [serviceMap, setServiceMap] = useState<ServiceObject>({});
  const [filteredService, setFilteredService] = useState('');
  const [serviceMapIdSelected, setServiceMapIdSelected] = useState<
    'latency' | 'error_rate' | 'throughput'
  >('');
  const [includeMetrics, setIncludeMetrics] = useState(false);
  const isNavGroupEnabled = coreRefs?.chrome?.navGroup.getNavGroupEnabled();

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

  const refresh = async (sort?: PropertySort, overrideQuery?: string) => {
    const filterQuery = overrideQuery ?? query;
    setLoading(true);
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

    if (mode === 'custom_data_prepper') {
      // service map should not be filtered by service name
      const serviceMapDSL = cloneDeep(DSL);
      serviceMapDSL.query.bool.must = serviceMapDSL.query.bool.must.filter(
        (must: any) => must?.term?.serviceName == null
      );

      if (tracesTableMode !== 'traces')
        await handleCustomIndicesTracesRequest(
          http,
          DSL,
          tableItems,
          setTableItems,
          setColumns,
          mode,
          props.dataSourceMDSId[0].id,
          sort,
          tracesTableMode,
          isUnderOneHour
        );
      else {
        await handleTracesRequest(
          http,
          DSL,
          timeFilterDSL,
          tableItems,
          setTableItems,
          mode,
          props.dataSourceMDSId[0].id,
          sort,
          isUnderOneHour
        );
      }
      await handleServiceMapRequest(
        http,
        serviceMapDSL,
        mode,
        props.dataSourceMDSId[0].id,
        setServiceMap,
        filteredService,
        includeMetrics
      );
    } else {
      await handleTracesRequest(
        http,
        DSL,
        timeFilterDSL,
        tableItems,
        setTableItems,
        mode,
        props.dataSourceMDSId[0].id,
        sort,
        isUnderOneHour
      );
    }

    setLoading(false);
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
              refresh={refresh}
              mode={mode}
              loading={loading}
              getTraceViewUri={getTraceViewUri}
              openTraceFlyout={openTraceFlyout}
              jaegerIndicesExist={jaegerIndicesExist}
              dataPrepperIndicesExist={dataPrepperIndicesExist}
              tracesTableMode={tracesTableMode}
              setTracesTableMode={setTracesTableMode}
            />
          ) : (
            <TracesTable
              items={tableItems}
              refresh={refresh}
              mode={mode}
              loading={loading}
              getTraceViewUri={getTraceViewUri}
              openTraceFlyout={openTraceFlyout}
              jaegerIndicesExist={jaegerIndicesExist}
              dataPrepperIndicesExist={dataPrepperIndicesExist}
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
                    serviceMap={serviceMap}
                    filteredService={filteredService}
                    setFilteredService={setFilteredService}
                  />
                  <EuiSpacer size="m" />
                </EuiFlexItem>
                <EuiFlexItem grow={8}>
                  <ServiceMap
                    addFilter={addFilter}
                    serviceMap={serviceMap}
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
