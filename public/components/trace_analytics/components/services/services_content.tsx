/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import { EuiButton, EuiComboBox, EuiSpacer } from '@elastic/eui';
import _ from 'lodash';
import React, { useEffect, useState } from 'react';
import {
  handleServiceMapRequest,
  handleServicesRequest,
  handleTraceGroupsRequest,
} from '../../requests/services_request_handler';
import { FilterType } from '../common/filters/filters';
import { getValidFilterFields } from '../common/filters/filter_helpers';
import { filtersToDsl, processTimeStamp } from '../common/helper_functions';
import { ServiceMap, ServiceObject } from '../common/plots/service_map';
import { SearchBar } from '../common/search_bar';
import { ServicesProps } from './services';
import { ServicesTable } from './services_table';
import { OptionType } from '../../../../../common/types/application_analytics';
import { EuiComboBoxOption } from '@opensearch-project/oui';
import { data } from 'jquery';
import { trace } from 'console';

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
    nameColumnAction,
    traceColumnAction,
    setFilters,
    setQuery,
    setStartTime,
    setEndTime,
    mode,
    dataPrepperIndicesExist,
    jaegerIndicesExist,
  } = props;
  const [tableItems, setTableItems] = useState([]);
  const [traceGroups, setTraceGroups] = useState<OptionType[]>([]);
  const [selectedTraceGroup, setSelectedTraceGroup] = useState<OptionType[]>();
  const [serviceMap, setServiceMap] = useState<ServiceObject>({});
  const [serviceMapIdSelected, setServiceMapIdSelected] = useState<
    'latency' | 'error_rate' | 'throughput'
  >('latency');
  const [redirect, setRedirect] = useState(true);
  const [loading, setLoading] = useState(false);
  const [filteredService, setFilteredService] = useState('');

  const onTraceGroupChange = (selectedOptions: OptionType[]) => {
    // We should only get back either 0 or 1 options.
    if (selectedOptions && selectedOptions.length) {
      addFilter({field: 'traceGroup', operator: 'is', value: selectedOptions[0].label, inverted: false, disabled: false})
    } else {
      //remove traceGroup filter
      setFilters(filters.filter((filter) => !(filter.field === 'traceGroup')));
    }
    setSelectedTraceGroup(selectedOptions);
  };

  useEffect(() => {
    chrome.setBreadcrumbs([parentBreadcrumb, ...childBreadcrumbs]);
    const validFilters = getValidFilterFields(mode, 'services');

    setFilters([
      ...filters.map((filter) => ({
        ...filter,
        locked: validFilters.indexOf(filter.field) === -1,
      })),
    ]);
    setRedirect(false);
  }, [mode]);

  // Get trace groups at start and don't refresh on selection
  useEffect(() => {
    const DSL = filtersToDsl(
      mode,
      filters,
      query,
      processTimeStamp(startTime, mode),
      processTimeStamp(endTime, mode),
      page,
      appConfigs
    );
    if (mode === 'data_prepper' && dataPrepperIndicesExist) {
      handleTraceGroupsRequest(http, DSL, mode, setTraceGroups)
    }
  }, [mode, jaegerIndicesExist, dataPrepperIndicesExist])

  useEffect(() => {
    let traceGroupFilter = ''
    for (const filter of filters) {
      if (filter.field === 'traceGroup') {
        traceGroupFilter = filter.value
        break;
      }
    }
    if (traceGroupFilter){
      setSelectedTraceGroup([{label: traceGroupFilter}])
    } else {
      setSelectedTraceGroup([])
    }
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
      ((mode === 'data_prepper' && dataPrepperIndicesExist) ||
        (mode === 'jaeger' && jaegerIndicesExist))
    )
      refresh(newFilteredService);
  }, [filters, appConfigs, redirect, mode, jaegerIndicesExist, dataPrepperIndicesExist]);

  const refresh = async (currService?: string) => {
    setLoading(true);
    const DSL = filtersToDsl(
      mode,
      filters,
      query,
      processTimeStamp(startTime, mode),
      processTimeStamp(endTime, mode),
      page,
      appConfigs
    );
    // service map should not be filtered by service name
    const serviceMapDSL = _.cloneDeep(DSL);
    serviceMapDSL.query.bool.must = serviceMapDSL.query.bool.must.filter(
      (must: any) => must?.term?.serviceName == null
    );
    await Promise.all([
      handleServicesRequest(http, DSL, setTableItems, mode),
      handleServiceMapRequest(
        http,
        serviceMapDSL,
        mode,
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

  return (
    <>
      {mode === 'data_prepper' && dataPrepperIndicesExist && traceGroups ? (<EuiComboBox
            aria-label="Select trace group"
            placeholder="Select trace group"
            options={traceGroups}
            singleSelection={{ asPlainText: true }}
            selectedOptions={selectedTraceGroup}
            onChange={onTraceGroupChange}
            // onCreateOption={onCreateTrace}
            isClearable={true}
            data-test-subj="traceGroupsComboBox"
          />)
      : null}
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
      />
      <EuiSpacer size="m" />
      <ServicesTable
        items={tableItems}
        addFilter={addFilter}
        setRedirect={setRedirect}
        mode={mode}
        loading={loading}
        nameColumnAction={nameColumnAction}
        traceColumnAction={traceColumnAction}
        jaegerIndicesExist={jaegerIndicesExist}
        dataPrepperIndicesExist={dataPrepperIndicesExist}
      />
      <EuiSpacer size="m" />
      {mode === 'data_prepper' && dataPrepperIndicesExist ? (
        <ServiceMap
          addFilter={addFilter}
          serviceMap={serviceMap}
          idSelected={serviceMapIdSelected}
          setIdSelected={setServiceMapIdSelected}
          currService={filteredService}
          page={page}
        />
      ) : (
        <div />
      )}
    </>
  );
}
