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
import React, { useEffect, useState } from 'react';
import { coreRefs } from '../../../../framework/core_refs';
import { handleTracesRequest } from '../../requests/traces_request_handler';
import { getValidFilterFields } from '../common/filters/filter_helpers';
import { Filters } from '../common/filters/filters';
import { filtersToDsl, processTimeStamp } from '../common/helper_functions';
import { SearchBar } from '../common/search_bar';
import { DashboardContent } from '../dashboard/dashboard_content';
import { DataSourcePicker } from '../dashboard/mode_picker';
import { TracesProps } from './traces';
import { TracesTable } from './traces_table';

export function TracesContent(props: TracesProps) {
  const {
    page,
    http,
    chrome,
    query,
    filters,
    appConfigs,
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
  } = props;
  const [tableItems, setTableItems] = useState([]);
  const [redirect, setRedirect] = useState(true);
  const [loading, setLoading] = useState(false);
  const [trigger, setTrigger] = useState<'open' | 'closed'>('closed');
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
    if (
      !redirect &&
      (mode === 'custom_data_prepper' ||
        (mode === 'data_prepper' && dataPrepperIndicesExist) ||
        (mode === 'jaeger' && jaegerIndicesExist))
    )
      refresh();
  }, [filters, appConfigs, redirect, mode, dataPrepperIndicesExist, jaegerIndicesExist]);

  const onToggle = (isOpen: boolean) => {
    const newState = isOpen ? 'open' : 'closed';
    setTrigger(newState);
  };

  const refresh = async (sort?: PropertySort) => {
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
    const timeFilterDSL = filtersToDsl(
      mode,
      [],
      '',
      processTimeStamp(startTime, mode),
      processTimeStamp(endTime, mode),
      page
    );
    await handleTracesRequest(
      http,
      DSL,
      timeFilterDSL,
      tableItems,
      setTableItems,
      mode,
      props.dataSourceMDSId[0].id,
      sort
    );
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
          <EuiSpacer size="s" />
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
        </EuiPageBody>
      </EuiPage>
    </>
  );
}
