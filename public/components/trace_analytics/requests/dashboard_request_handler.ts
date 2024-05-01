/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import _ from 'lodash';
import moment from 'moment';
import { TRACE_ANALYTICS_PLOTS_DATE_FORMAT } from '../../../../common/constants/trace_analytics';
import {
  fixedIntervalToMilli,
  microToMilliSec,
  nanoToMilliSec,
} from '../components/common/helper_functions';
import {
  getDashboardQuery,
  getDashboardThroughputPltQuery,
  getDashboardTraceGroupPercentiles,
  getErrorRatePltQuery,
  getJaegerDashboardQuery,
  getJaegerErrorDashboardQuery,
  getJaegerErrorTrendQuery,
  getJaegerLatencyTrendQuery,
  getLatencyTrendQuery,
} from './queries/dashboard_queries';
import { handleDslRequest } from './request_handler';

export const handleDashboardRequest = async (
  http,
  DSL,
  timeFilterDSL,
  latencyTrendDSL,
  items,
  setItems,
  mode,
  setShowTimeoutToast,
  dataSourceMDSId?,
  setPercentileMap?
) => {
  // latency_variance should only be affected by timefilter
  const latencyVariances = await handleDslRequest(
    http,
    timeFilterDSL,
    getDashboardTraceGroupPercentiles(mode),
    mode,
    dataSourceMDSId
  )
    .then((response) => {
      const map: any = {};
      response.aggregations.trace_group.buckets.forEach((traceGroup) => {
        map[traceGroup.key] = Object.values(
          traceGroup.latency_variance_nanos.values
        ).map((nano: number) => _.round(nanoToMilliSec(Math.max(0, nano)), 2));
      });
      return map;
    })
    .catch((error) => console.error(error));
  if (setPercentileMap) setPercentileMap(latencyVariances);

  const latencyTrends = await handleDslRequest(
    http,
    latencyTrendDSL,
    getLatencyTrendQuery(),
    mode,
    setShowTimeoutToast
  )
    .then((response) => {
      const map: any = {};
      response.aggregations.trace_group_name.buckets.map((bucket) => {
        const latencyTrend = bucket.group_by_hour.buckets
          .slice(-24)
          .filter((bucket) => bucket.average_latency?.value || bucket.average_latency?.value === 0);
        const values = {
          x: latencyTrend.map((bucket) => bucket.key),
          y: latencyTrend.map((bucket) => bucket.average_latency?.value || 0),
        };
        const latencyTrendData =
          values.x?.length > 0
            ? {
                '24_hour_latency_trend': {
                  trendData: [
                    {
                      ...values,
                      type: 'scatter',
                      mode: 'lines',
                      hoverinfo: 'none',
                      line: {
                        color: '#000000',
                        width: 1,
                      },
                    },
                  ],
                  popoverData: [
                    {
                      ...values,
                      type: 'scatter',
                      mode: 'lines+markers',
                      hovertemplate: '%{x}<br>Average latency: %{y}<extra></extra>',
                      hoverlabel: {
                        bgcolor: '#d7c2ff',
                      },
                      marker: {
                        color: '#987dcb',
                        size: 8,
                      },
                      line: {
                        color: '#987dcb',
                        size: 2,
                      },
                    },
                  ],
                },
              }
            : {};
        map[bucket.key] = latencyTrendData;
      });
      return map;
    })
    .catch((error) => console.error(error));

  await handleDslRequest(http, DSL, getDashboardQuery(), mode, dataSourceMDSId, setShowTimeoutToast)
    .then((response) => {
      return Promise.all(
        response.aggregations.trace_group_name.buckets.map((bucket) => {
          const latencyTrend = latencyTrends?.[bucket.key] || {};
          return {
            dashboard_trace_group_name: bucket.key,
            dashboard_average_latency: bucket.average_latency?.value,
            dashboard_traces: bucket.trace_count.value,
            dashboard_latency_variance: latencyVariances[bucket.key],
            dashboard_error_rate: bucket.error_rate.value,
            ...latencyTrend,
          };
        })
      );
    })
    .then((newItems) => {
      setItems(newItems);
    })
    .catch((error) => console.error(error));
};

export const handleJaegerDashboardRequest = async (
  http,
  DSL,
  timeFilterDSL,
  latencyTrendDSL,
  items,
  setItems,
  mode,
  setShowTimeoutToast,
  dataSourceMDSId?,
  setPercentileMap?
) => {
  const latencyTrends = await handleDslRequest(
    http,
    latencyTrendDSL,
    getJaegerLatencyTrendQuery(),
    mode,
    dataSourceMDSId,
    setShowTimeoutToast
  )
    .then((response) => {
      const map: any = {};
      response.aggregations.trace_group_name.buckets.map((bucket) => {
        const latencyTrend = bucket.group_by_hour.buckets
          .slice(-24)
          .filter((bucket) => bucket.average_latency?.value || bucket.average_latency?.value === 0);
        const values = {
          x: latencyTrend.map((bucket) => bucket.key),
          y: latencyTrend.map((bucket) => bucket.average_latency?.value || 0),
        };
        const latencyTrendData =
          values.x?.length > 0
            ? {
                '24_hour_latency_trend': {
                  trendData: [
                    {
                      ...values,
                      type: 'scatter',
                      mode: 'lines',
                      hoverinfo: 'none',
                      line: {
                        color: '#000000',
                        width: 1,
                      },
                    },
                  ],
                  popoverData: [
                    {
                      ...values,
                      type: 'scatter',
                      mode: 'lines+markers',
                      hovertemplate: '%{x}<br>Average latency: %{y}<extra></extra>',
                      hoverlabel: {
                        bgcolor: '#d7c2ff',
                      },
                      marker: {
                        color: '#987dcb',
                        size: 8,
                      },
                      line: {
                        color: '#987dcb',
                        size: 2,
                      },
                    },
                  ],
                },
              }
            : {};
        map[bucket.key] = latencyTrendData;
      });
      return map;
    })
    .catch((error) => {
      console.error(error);
    });

  await handleDslRequest(
    http,
    DSL,
    getJaegerDashboardQuery(),
    mode,
    dataSourceMDSId,
    setShowTimeoutToast
  )
    .then((response) => {
      return Promise.all(
        response.aggregations.trace_group_name.buckets.map((bucket) => {
          const latencyTrend = latencyTrends?.[bucket.key] || {};
          return {
            dashboard_key_as_string: bucket.key_as_string,
            dashboard_trace_group_name: bucket.key,
            dashboard_average_latency: bucket.average_latency?.value,
            dashboard_traces: bucket.trace_count.value,
            dashboard_error_rate: bucket.error_rate.value,
            ...latencyTrend,
          };
        })
      );
    })
    .then(async (newItems) => {
      const latencies = await handleDslRequest(
        http,
        timeFilterDSL,
        getDashboardTraceGroupPercentiles(
          mode,
          newItems.map((a) => a.dashboard_trace_group_name)
        ),
        mode,
        true,
        setShowTimeoutToast
      )
        .then((response) => {
          const map: any = {};
          response.aggregations.trace_group.buckets.forEach((traceGroup) => {
            map[traceGroup.key_as_string] = Object.values(
              traceGroup.latency_variance_micros.values
            ).map((nano: number) => _.round(microToMilliSec(Math.max(0, nano)), 2));
          });
          return map;
        })
        .catch((error) => console.error(error));
      newItems.forEach((item) => {
        item.dashboard_latency_variance = latencies[item.dashboard_key_as_string];
      });
      setItems(newItems);
    })
    .catch((error) => console.error(error));
};

export const handleJaegerErrorDashboardRequest = async (
  http,
  DSL,
  timeFilterDSL,
  latencyTrendDSL,
  items,
  setItems,
  mode,
  setShowTimeoutToast,
  dataSourceMDSId?,
  setPercentileMap?
) => {
  const errorTrends = await handleDslRequest(
    http,
    latencyTrendDSL,
    getJaegerErrorTrendQuery(),
    mode,
    dataSourceMDSId,
    setShowTimeoutToast
  )
    .then((response) => {
      const map: any = {};
      response.aggregations.trace_group_name.buckets.map((bucket) => {
        const errorTrend = bucket.group_by_hour.buckets
          .slice(-24)
          .filter((bucket) => bucket.error_rate?.value || bucket.error_rate?.value === 0);
        const values = {
          x: errorTrend.map((bucket) => bucket.key),
          y: errorTrend.map((bucket) => bucket.error_rate?.value || 0),
        };
        const errorTrendData =
          values.x?.length > 0
            ? {
                '24_hour_error_trend': {
                  trendData: [
                    {
                      ...values,
                      type: 'scatter',
                      mode: 'lines',
                      hoverinfo: 'none',
                      line: {
                        color: '#000000',
                        width: 1,
                      },
                    },
                  ],
                  popoverData: [
                    {
                      ...values,
                      type: 'scatter',
                      mode: 'lines+markers',
                      hovertemplate: '%{x}<br>Average error rate: %{y}<extra></extra>',
                      hoverlabel: {
                        bgcolor: '#d7c2ff',
                      },
                      marker: {
                        color: '#987dcb',
                        size: 8,
                      },
                      line: {
                        color: '#987dcb',
                        size: 2,
                      },
                    },
                  ],
                },
              }
            : {};
        map[bucket.key] = errorTrendData;
      });
      return map;
    })
    .catch((error) => console.error(error));

  await handleDslRequest(
    http,
    DSL,
    getJaegerErrorDashboardQuery(),
    mode,
    dataSourceMDSId,
    setShowTimeoutToast
  )
    .then((response) => {
      return Promise.all(
        response.aggregations.trace_group_name.buckets.map((bucket) => {
          const latencyTrend = errorTrends?.[bucket.key] || {};
          return {
            dashboard_trace_group_name: bucket.key,
            dashboard_average_latency: bucket.average_latency?.value,
            dashboard_traces: bucket.trace_count.value,
            dashboard_error_rate: bucket.error_rate.value,
            ...latencyTrend,
          };
        })
      );
    })
    .then((newItems) => {
      setItems(newItems);
    })
    .catch((error) => console.error(error));
};

export const handleDashboardThroughputPltRequest = (
  http,
  DSL,
  fixedInterval,
  items,
  setItems,
  mode,
  dataSourceMDSId?
) => {
  return handleDslRequest(
    http,
    DSL,
    getDashboardThroughputPltQuery(mode, fixedInterval),
    mode,
    dataSourceMDSId
  )
    .then((response) => {
      const buckets = response.aggregations.throughput.buckets;
      const texts = buckets.map(
        (bucket) =>
          `${moment(bucket.key).format(TRACE_ANALYTICS_PLOTS_DATE_FORMAT)} - ${moment(
            bucket.key + fixedIntervalToMilli(fixedInterval)
          ).format(TRACE_ANALYTICS_PLOTS_DATE_FORMAT)}`
      );
      const newItems =
        buckets.length > 0
          ? [
              {
                x: buckets.map((bucket) => bucket.key),
                y: buckets.map((bucket) => bucket.trace_count.value),
                marker: {
                  color: 'rgb(171, 211, 240)',
                },
                type: 'bar',
                customdata: texts,
                hoverlabel: {
                  align: 'left',
                },
                hovertemplate: '%{customdata}<br>Throughput: %{y:,}<extra></extra>',
              },
            ]
          : [];
      setItems({ items: newItems, fixedInterval: fixedInterval });
    })
    .catch((error) => console.error(error));
};

export const handleDashboardErrorRatePltRequest = (
  http,
  DSL,
  fixedInterval,
  items,
  setItems,
  mode,
  dataSourceMDSId?
) => {
  return handleDslRequest(
    http,
    DSL,
    getErrorRatePltQuery(mode, fixedInterval),
    mode,
    dataSourceMDSId
  )
    .then((response) => {
      const buckets = response.aggregations.error_rate.buckets;
      const texts = buckets.map(
        (bucket) =>
          `${moment(bucket.key).format(TRACE_ANALYTICS_PLOTS_DATE_FORMAT)} - ${moment(
            bucket.key + fixedIntervalToMilli(fixedInterval)
          ).format(TRACE_ANALYTICS_PLOTS_DATE_FORMAT)}`
      );
      const newItems =
        buckets.length > 0
          ? [
              {
                x: buckets.map((bucket) => bucket.key),
                y: buckets.map((bucket) => _.round(bucket.error_rate?.value || 0, 2)),
                marker: {
                  color: '#fad963',
                },
                type: 'bar',
                customdata: texts,
                hoverlabel: {
                  align: 'left',
                },
                hovertemplate: '%{customdata}<br>Error rate: %{y}<extra></extra>',
              },
            ]
          : [];
      setItems({ items: newItems, fixedInterval: fixedInterval });
    })
    .catch((error) => console.error(error));
};
