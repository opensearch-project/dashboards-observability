/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import { EuiFlexGroup, EuiFlexItem, EuiPage, EuiPageBody, EuiSpacer } from '@elastic/eui';
import cloneDeep from 'lodash/cloneDeep';
import React, { useEffect, useRef, useState } from 'react';
import { ServiceTrends } from '../../../../../common/types/trace_analytics';
import { coreRefs } from '../../../../framework/core_refs';
import {
  handleServicesRequest,
  handleServiceTrendsRequest,
} from '../../requests/services_request_handler';
import { getValidFilterFields } from '../common/filters/filter_helpers';
import { Filters, FilterType } from '../common/filters/filters';
import { filtersToDsl, processTimeStamp } from '../common/helper_functions';
import { ServiceMap, ServiceObject } from '../common/plots/service_map';
import { SearchBar } from '../common/search_bar';
import { DataSourcePicker } from '../dashboard/mode_picker';
import { ServicesProps } from './services';
import { ServicesTable } from './services_table';

export function ServicesContent(props: ServicesProps) {
  const {
    page,
    http,
    chrome,
    filters,
    query,
    startTime,
    endTime,
    appConfigs = [],
    childBreadcrumbs,
    parentBreadcrumb,
    traceColumnAction,
    setCurrentSelectedService,
    setFilters,
    setQuery,
    setStartTime,
    setEndTime,
    mode,
    jaegerIndicesExist,
    dataSourceMDSId,
    attributesFilterFields,
  } = props;
  const [tableItems, setTableItems] = useState([]);

  const [serviceMap, setServiceMap] = useState<ServiceObject>({});
  const [serviceMapIdSelected, setServiceMapIdSelected] = useState<
    'latency' | 'error_rate' | 'throughput'
  >('latency');
  const [redirect, setRedirect] = useState(true);
  const [filteredService, setFilteredService] = useState('');
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [isServiceTrendEnabled, setIsServiceTrendEnabled] = useState(false);
  const [serviceTrends, setServiceTrends] = useState<ServiceTrends>({});
  const searchBarRef = useRef<{ updateQuery: (newQuery: string) => void }>(null);
  const [isServicesTableDataLoading, setIsServicesTableDataLoading] = useState(false);
  const [isServicesDataLoading, setIsServicesDataLoading] = useState(false);

  useEffect(() => {
    const isNavGroupEnabled = coreRefs?.chrome?.navGroup.getNavGroupEnabled();
    chrome.setBreadcrumbs([...(isNavGroupEnabled ? [] : [parentBreadcrumb]), ...childBreadcrumbs]);
    const validFilters = getValidFilterFields(mode, 'services', attributesFilterFields);

    setFilters([
      ...filters.map((filter) => ({
        ...filter,
        locked: validFilters.indexOf(filter.field) === -1,
      })),
    ]);
    setRedirect(false);
    props.setDataSourceMenuSelectable?.(true);
  }, [mode, props.setDataSourceMenuSelectable, props.currentSelectedService]);

  useEffect(() => {
    let newFilteredService = '';
    for (const filter of filters) {
      if (filter.field === 'serviceName') {
        newFilteredService = filter.value;
        break;
      }
    }
    setFilteredService(newFilteredService);
    if (!redirect && (mode === 'data_prepper' || (mode === 'jaeger' && jaegerIndicesExist)))
      refresh(newFilteredService);
  }, [
    filters,
    appConfigs,
    redirect,
    mode,
    jaegerIndicesExist,
    isServiceTrendEnabled,
    startTime,
    endTime,
    props.dataSourceMDSId,
  ]);

  const refresh = (currService?: string, overrideQuery?: string) => {
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
    // service map should not be filtered by service name
    const serviceMapDSL = cloneDeep(DSL);
    serviceMapDSL.query.bool.must = serviceMapDSL.query.bool.must.filter(
      (must: any) => must?.term?.serviceName == null
    );

    setIsServicesTableDataLoading(true);
    handleServicesRequest(
      http,
      DSL,
      setTableItems,
      mode,
      setServiceMap,
      dataSourceMDSId[0].id
    ).finally(() => setIsServicesTableDataLoading(false));

    setIsServicesDataLoading(true);
    if (isServiceTrendEnabled) {
      handleServiceTrendsRequest(
        http,
        '1h',
        setServiceTrends,
        mode,
        [],
        dataSourceMDSId[0].id
      ).finally(() => setIsServicesDataLoading(false));
    } else {
      setIsServicesDataLoading(false);
    }
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

  const updateSearchQuery = (newQuery: string) => {
    if (searchBarRef.current) {
      searchBarRef.current.updateQuery(newQuery);
    }
  };

  const addServicesGroupFilter = () => {
    const groupFilter = selectedItems.map(
      (row) => (mode === 'jaeger' ? 'process.serviceName: ' : 'serviceName: ') + row.name
    );
    const filterQuery = groupFilter.join(' OR ');
    const newQuery = query ? `(${query}) AND (${filterQuery})` : `(${filterQuery})`;
    updateSearchQuery(newQuery);
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
                ref={searchBarRef}
                filters={filters}
                setFilters={setFilters}
                query={query}
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
          <ServicesTable
            items={tableItems}
            selectedItems={selectedItems}
            setSelectedItems={setSelectedItems}
            addServicesGroupFilter={addServicesGroupFilter}
            addFilter={addFilter}
            setRedirect={setRedirect}
            mode={mode}
            loading={isServicesTableDataLoading}
            traceColumnAction={traceColumnAction}
            setCurrentSelectedService={setCurrentSelectedService}
            jaegerIndicesExist={jaegerIndicesExist}
            isServiceTrendEnabled={isServiceTrendEnabled}
            setIsServiceTrendEnabled={setIsServiceTrendEnabled}
            serviceTrends={serviceTrends}
            dataSourceMDSId={props.dataSourceMDSId}
            page={page}
            startTime={startTime}
            endTime={endTime}
          />
          <EuiSpacer size="s" />
          {mode === 'data_prepper' ? (
            <ServiceMap
              addFilter={addFilter}
              filters={filters}
              setFilters={setFilters}
              serviceMap={serviceMap}
              isServicesDataLoading={isServicesDataLoading}
              idSelected={serviceMapIdSelected}
              setIdSelected={setServiceMapIdSelected}
              currService={filteredService}
              page={page}
              setCurrentSelectedService={setCurrentSelectedService}
              mode={mode}
            />
          ) : (
            <div />
          )}
        </EuiPageBody>
      </EuiPage>
    </>
  );
}
