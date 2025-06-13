/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import dateMath from '@elastic/datemath';
import { EuiFlexGroup, EuiFlexItem, EuiSpacer } from '@elastic/eui';
import cloneDeep from 'lodash/cloneDeep';
import React, { useEffect, useState } from 'react';
import { useToast } from '../../../../../public/components/common/toast';
import { coreRefs } from '../../../../../public/framework/core_refs';
import {
  handleDashboardErrorRatePltRequest,
  handleDashboardRequest,
  handleDashboardThroughputPltRequest,
  handleJaegerDashboardRequest,
  handleJaegerErrorDashboardRequest,
} from '../../requests/dashboard_request_handler';
import { FilterType } from '../common/filters/filters';
import {
  MissingConfigurationMessage,
  filtersToDsl,
  getPercentileFilter,
  milliToNanoSec,
  minFixedInterval,
  processTimeStamp,
} from '../common/helper_functions';
import { ErrorRatePlt } from '../common/plots/error_rate_plt';
import { ThroughputPlt } from '../common/plots/throughput_plt';
import { DashboardProps } from './dashboard';
import { DashboardTable } from './dashboard_table';
import { TopGroupsPage } from './top_groups_page';

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
    setFilters,
    mode,
    jaegerIndicesExist,
    toasts,
    dataSourceMDSId,
  } = props;
  const [tableItems, setTableItems] = useState([]);
  const [jaegerTableItems, setJaegerTableItems] = useState([]);
  const [jaegerErrorTableItems, setJaegerErrorTableItems] = useState([]);
  const [throughputPltItems, setThroughputPltItems] = useState({ items: [], fixedInterval: '1h' });
  const [errorRatePltItems, setErrorRatePltItems] = useState({ items: [], fixedInterval: '1h' });
  const [percentileMap, setPercentileMap] = useState<{ [traceGroup: string]: number[] }>({});
  const [redirect, setRedirect] = useState(true);
  const [isTraceGroupTableLoading, setIsTraceGroupTableLoading] = useState(false);
  const [showTimeoutToast, setShowTimeoutToast] = useState(false);
  const { setToast } = useToast();
  const isNavGroupEnabled = coreRefs?.chrome?.navGroup.getNavGroupEnabled();
  const [isErrorRateTrendLoading, setIsErrorRateTrendLoading] = useState(false);
  const [isThroughputTrendLoading, setIsThroughputTrendLoading] = useState(false);

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
    if (isNavGroupEnabled) {
      chrome.setBreadcrumbs([...childBreadcrumbs]);
    } else {
      chrome.setBreadcrumbs([parentBreadcrumb, ...childBreadcrumbs]);
    }

    setRedirect(false);
  }, []);

  useEffect(() => {
    if (!redirect && (mode === 'data_prepper' || (mode === 'jaeger' && jaegerIndicesExist)))
      refresh();
  }, [filters, startTime, endTime, appConfigs, redirect, mode, jaegerIndicesExist]);

  const refresh = async () => {
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
      processTimeStamp(endTime, mode, true),
      page,
      appConfigs
    );
    const fixedInterval = minFixedInterval(startTime, endTime);
    setIsTraceGroupTableLoading(true);
    if (mode === 'jaeger') {
      Promise.all([
        handleJaegerDashboardRequest(
          http,
          DSL,
          timeFilterDSL,
          latencyTrendDSL,
          tableItems,
          setJaegerTableItems,
          mode,
          () => setShowTimeoutToast(true),
          dataSourceMDSId[0].id,
          setPercentileMap
        ),
        handleJaegerErrorDashboardRequest(
          http,
          DSL,
          timeFilterDSL,
          latencyTrendDSL,
          tableItems,
          setJaegerErrorTableItems,
          mode,
          () => setShowTimeoutToast(true),
          dataSourceMDSId[0].id,
          setPercentileMap
        ),
      ]).finally(() => setIsTraceGroupTableLoading(false));
    } else {
      handleDashboardRequest(
        http,
        DSL,
        timeFilterDSL,
        latencyTrendDSL,
        tableItems,
        setTableItems,
        mode,
        () => setShowTimeoutToast(true),
        dataSourceMDSId[0].id,
        setPercentileMap
      ).finally(() => setIsTraceGroupTableLoading(false));
      // service map should not be filtered by service name (https://github.com/opensearch-project/observability/issues/442)
      const serviceMapDSL = cloneDeep(DSL);
      serviceMapDSL.query.bool.must = serviceMapDSL.query.bool.must.filter(
        (must: any) => must?.term?.serviceName == null
      );
    }

    setIsThroughputTrendLoading(true);
    handleDashboardThroughputPltRequest(
      http,
      DSL,
      fixedInterval,
      throughputPltItems,
      setThroughputPltItems,
      mode,
      dataSourceMDSId[0].id
    ).finally(() => setIsThroughputTrendLoading(false));

    setIsErrorRateTrendLoading(true);
    handleDashboardErrorRatePltRequest(
      http,
      DSL,
      fixedInterval,
      errorRatePltItems,
      setErrorRatePltItems,
      mode,
      dataSourceMDSId[0].id
    ).finally(() => setIsErrorRateTrendLoading(false));
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
      {mode === 'data_prepper' || (mode === 'jaeger' && jaegerIndicesExist) ? (
        <div>
          {mode === 'data_prepper' ? (
            <>
              <DashboardTable
                items={tableItems}
                filters={filters}
                addFilter={addFilter}
                addPercentileFilter={addPercentileFilter}
                setRedirect={setRedirect}
                loading={isTraceGroupTableLoading}
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
                        isErrorRateTrendLoading={isErrorRateTrendLoading}
                      />
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <ThroughputPlt
                        items={throughputPltItems}
                        setStartTime={setStartTime}
                        setEndTime={setEndTime}
                        isThroughputTrendLoading={isThroughputTrendLoading}
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
              loading={isTraceGroupTableLoading}
              isErrorRateTrendLoading={isErrorRateTrendLoading}
              isThroughputTrendLoading={isThroughputTrendLoading}
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
