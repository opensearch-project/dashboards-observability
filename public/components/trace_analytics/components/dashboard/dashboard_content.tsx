/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import dateMath from '@elastic/datemath';
import { EuiFlexGroup, EuiFlexItem, EuiSpacer } from '@elastic/eui';
import _ from 'lodash';
import React, { useEffect, useState } from 'react';
import {
  handleDashboardErrorRatePltRequest,
  handleDashboardRequest,
  handleDashboardThroughputPltRequest,
  handleJaegerDashboardRequest,
  handleJaegerErrorDashboardRequest,
} from '../../requests/dashboard_request_handler';
import { handleServiceMapRequest } from '../../requests/services_request_handler';
import { FilterType } from '../common/filters/filters';
import { getValidFilterFields } from '../common/filters/filter_helpers';
import {
  filtersToDsl,
  getPercentileFilter,
  milliToNanoSec,
  minFixedInterval,
  MissingConfigurationMessage,
  processTimeStamp,
} from '../common/helper_functions';
import { ErrorRatePlt } from '../common/plots/error_rate_plt';
import { ServiceMap, ServiceObject } from '../common/plots/service_map';
import { ThroughputPlt } from '../common/plots/throughput_plt';
import { SearchBar } from '../common/search_bar';
import { DashboardProps } from './dashboard';
import { DashboardTable } from './dashboard_table';
import { TopGroupsPage } from './top_groups_page';
import { useToast } from '../../../../../public/components/common/toast';

export function DashboardContent(props: DashboardProps) {
  const {
    http,
    chrome,
    page,
    query,
    appConfigs,
    startTime,
    endTime,
    childBreadcrumbs,
    parentBreadcrumb,
    filters,
    setStartTime,
    setEndTime,
    setQuery,
    setFilters,
    mode,
    dataPrepperIndicesExist,
    jaegerIndicesExist,
    toasts,
  } = props;
  const [tableItems, setTableItems] = useState([]);
  const [jaegerTableItems, setJaegerTableItems] = useState([]);
  const [jaegerErrorTableItems, setJaegerErrorTableItems] = useState([]);
  const [throughputPltItems, setThroughputPltItems] = useState({ items: [], fixedInterval: '1h' });
  const [errorRatePltItems, setErrorRatePltItems] = useState({ items: [], fixedInterval: '1h' });
  const [percentileMap, setPercentileMap] = useState<{ [traceGroup: string]: number[] }>({});
  const [filteredService, setFilteredService] = useState('');
  const [redirect, setRedirect] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showTimeoutToast, setShowTimeoutToast] = useState(false);
  const { setToast } = useToast();

  useEffect(() => {
    if (showTimeoutToast === true && (!toasts || toasts.length === 0)) {
      setToast!(
        'Query took too long to execute.',
        'danger',
        'Reduce time range or filter your data. If issue persists, consider increasing your cluster size.'
      );
    }
    setShowTimeoutToast(false);
  }, [showTimeoutToast]);

  useEffect(() => {
    chrome.setBreadcrumbs([parentBreadcrumb, ...childBreadcrumbs]);
    const validFilters = getValidFilterFields(mode, page);
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
      if (mode === 'data_prepper') {
        if (filter.field === 'serviceName') {
          newFilteredService = filter.value;
          break;
        }
      } else if (mode === 'jaeger') {
        if (filter.field === 'process.serviceName') {
          newFilteredService = filter.value;
          break;
        }
      }
    }
    setFilteredService(newFilteredService);
    if (
      !redirect &&
      ((mode === 'data_prepper' && dataPrepperIndicesExist) ||
        (mode === 'jaeger' && jaegerIndicesExist))
    )
      refresh(newFilteredService);
  }, [
    filters,
    startTime,
    endTime,
    appConfigs,
    redirect,
    mode,
    dataPrepperIndicesExist,
    jaegerIndicesExist,
  ]);

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
    const timeFilterDSL = filtersToDsl(
      mode,
      [],
      '',
      processTimeStamp(startTime, mode),
      processTimeStamp(endTime, mode),
      page,
      appConfigs
    );
    const latencyTrendStartTime = dateMath
      .parse(endTime, { roundUp: true })
      ?.subtract(24, 'hours')
      .toISOString()!;
    const latencyTrendDSL = filtersToDsl(
      mode,
      filters,
      query,
      processTimeStamp(latencyTrendStartTime, mode),
      processTimeStamp(endTime, mode),
      page,
      appConfigs
    );
    const fixedInterval = minFixedInterval(startTime, endTime);
    if (mode === 'jaeger') {
      handleJaegerDashboardRequest(
        http,
        DSL,
        timeFilterDSL,
        latencyTrendDSL,
        tableItems,
        setJaegerTableItems,
        mode,
        () => setShowTimeoutToast(true),
        // () => {
        //   if (toasts.length === 0) {
        //     setToast!('Query took too long to execute.', 'danger', 'Reduce time range or filter your data. If issue persists, consider increasing your cluster size.');
        //   }
        // },
        setPercentileMap
      ).finally(() => setLoading(false));
      handleJaegerErrorDashboardRequest(
        http,
        DSL,
        timeFilterDSL,
        latencyTrendDSL,
        tableItems,
        setJaegerErrorTableItems,
        mode,
        () => setShowTimeoutToast(true),
        // () => {
        //   if (toasts.length === 0) {
        //     setToast!('Query took too long to execute.', 'danger', 'Reduce time range or filter your data. If issue persists, consider increasing your cluster size.');
        //   }
        // },
        setPercentileMap
      ).finally(() => setLoading(false));
    } else if (mode === 'data_prepper') {
      handleDashboardRequest(
        http,
        DSL,
        timeFilterDSL,
        latencyTrendDSL,
        tableItems,
        setTableItems,
        mode,
        () => setShowTimeoutToast(true),
        setPercentileMap
      ).then(() => setLoading(false));
      // service map should not be filtered by service name (https://github.com/opensearch-project/observability/issues/442)
      const serviceMapDSL = _.cloneDeep(DSL);
      serviceMapDSL.query.bool.must = serviceMapDSL.query.bool.must.filter(
        (must: any) => must?.term?.serviceName == null
      );
    }

    handleDashboardThroughputPltRequest(
      http,
      DSL,
      fixedInterval,
      throughputPltItems,
      setThroughputPltItems,
      mode
    );

    handleDashboardErrorRatePltRequest(
      http,
      DSL,
      fixedInterval,
      errorRatePltItems,
      setErrorRatePltItems,
      mode
    );
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

  const addFilters = (filterArr: FilterType[]) => {
    const newFilters = [...filters, ...filterArr];
    setFilters(newFilters);
  };

  const addPercentileFilter = (condition = 'gte', additionalFilters = [] as FilterType[]) => {
    if (tableItems.length === 0 || Object.keys(percentileMap).length === 0) return;
    for (let i = 0; i < filters.length; i++) {
      if (filters[i].custom) {
        const newFilter = JSON.parse(JSON.stringify(filters[i]));
        newFilter.custom.query.bool.should.forEach((should: any) =>
          should.bool.must.forEach((must: any) => {
            const range = must?.range?.['traceGroupFields.durationInNanos'];
            if (range) {
              const duration = range.lt || range.lte || range.gt || range.gte;
              if (duration || duration === 0) {
                must.range['traceGroupFields.durationInNanos'] = {
                  [condition]: duration,
                };
              }
            }
          })
        );
        newFilter.value = condition === 'gte' ? '>= 95th' : '< 95th';
        const newFilters = [...filters, ...additionalFilters];
        newFilters.splice(i, 1, newFilter);
        setFilters(newFilters);
        return;
      }
    }

    const percentileMaps = Object.keys(percentileMap).map((traceGroup) => ({
      traceGroupName: traceGroup,
      durationFilter: { [condition]: milliToNanoSec(percentileMap[traceGroup][1]) },
    }));
    const percentileFilter = getPercentileFilter(
      percentileMaps,
      condition === 'gte' ? '>= 95th' : '< 95th'
    );
    const newFilters = [...filters, percentileFilter, ...additionalFilters];
    setFilters(newFilters);
  };

  return (
    <>
      {(mode === 'data_prepper' && dataPrepperIndicesExist) ||
      (mode === 'jaeger' && jaegerIndicesExist) ? (
        <div>
          {mode === 'data_prepper' ? (
            <>
              <DashboardTable
                items={tableItems}
                filters={filters}
                addFilter={addFilter}
                addPercentileFilter={addPercentileFilter}
                setRedirect={setRedirect}
                loading={loading}
                page={page}
              />
              <EuiSpacer />
              <EuiFlexGroup alignItems="baseline">
                <EuiFlexItem>
                  <EuiFlexGroup direction="row">
                    <EuiFlexItem>
                      <ErrorRatePlt
                        items={errorRatePltItems}
                        setStartTime={setStartTime}
                        setEndTime={setEndTime}
                      />
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <ThroughputPlt
                        items={throughputPltItems}
                        setStartTime={setStartTime}
                        setEndTime={setEndTime}
                      />
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiFlexItem>
              </EuiFlexGroup>
            </>
          ) : (
            <TopGroupsPage
              filters={filters}
              addFilter={addFilter}
              addFilters={addFilters}
              addPercentileFilter={addPercentileFilter}
              setRedirect={setRedirect}
              loading={loading}
              page={page}
              throughPutItems={throughputPltItems}
              jaegerErrorRatePltItems={errorRatePltItems}
              jaegerTableItems={jaegerTableItems}
              jaegerErrorTableItems={jaegerErrorTableItems}
              setStartTime={setStartTime}
              setEndTime={setEndTime}
            />
          )}
        </div>
      ) : (
        <MissingConfigurationMessage mode={mode} />
      )}
    </>
  );
}
