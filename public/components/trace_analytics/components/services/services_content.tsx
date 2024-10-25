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
  handleServiceMapRequest,
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
    dataPrepperIndicesExist,
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
  const [loading, setLoading] = useState(false);
  const [filteredService, setFilteredService] = useState('');
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [isServiceTrendEnabled, setIsServiceTrendEnabled] = useState(false);
  const [serviceTrends, setServiceTrends] = useState<ServiceTrends>({});
  const searchBarRef = useRef<{ updateQuery: (newQuery: string) => void }>(null);

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
    if (
      !redirect &&
      (mode === 'custom_data_prepper' ||
        (mode === 'data_prepper' && dataPrepperIndicesExist) ||
        (mode === 'jaeger' && jaegerIndicesExist))
    )
      refresh(newFilteredService);
  }, [
    filters,
    appConfigs,
    redirect,
    mode,
    jaegerIndicesExist,
    dataPrepperIndicesExist,
    isServiceTrendEnabled,
  ]);

  const refresh = async (currService?: string, overrideQuery?: string) => {
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
    // service map should not be filtered by service name
    const serviceMapDSL = cloneDeep(DSL);
    serviceMapDSL.query.bool.must = serviceMapDSL.query.bool.must.filter(
      (must: any) => must?.term?.serviceName == null
    );

    if (isServiceTrendEnabled) {
      await handleServiceTrendsRequest(
        http,
        '1h',
        setServiceTrends,
        mode,
        [],
        dataSourceMDSId[0].id
      );
    }
    await Promise.all([
      handleServicesRequest(http, DSL, setTableItems, mode, dataSourceMDSId[0].id),
      handleServiceMapRequest(
        http,
        serviceMapDSL,
        mode,
        dataSourceMDSId[0].id,
        setServiceMap,
        currService || filteredService
      ),
    ]);

    setLoading(false);
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
            loading={loading}
            traceColumnAction={traceColumnAction}
            setCurrentSelectedService={setCurrentSelectedService}
            jaegerIndicesExist={jaegerIndicesExist}
            dataPrepperIndicesExist={dataPrepperIndicesExist}
            isServiceTrendEnabled={isServiceTrendEnabled}
            setIsServiceTrendEnabled={setIsServiceTrendEnabled}
            serviceTrends={serviceTrends}
          />
          <EuiSpacer size="s" />
          {mode === 'custom_data_prepper' ||
          (mode === 'data_prepper' && dataPrepperIndicesExist) ? (
            <ServiceMap
              addFilter={addFilter}
              serviceMap={serviceMap}
              idSelected={serviceMapIdSelected}
              setIdSelected={setServiceMapIdSelected}
              currService={filteredService}
              page={page}
              setCurrentSelectedService={setCurrentSelectedService}
            />
          ) : (
            <div />
          )}
        </EuiPageBody>
      </EuiPage>
    </>
  );
}
