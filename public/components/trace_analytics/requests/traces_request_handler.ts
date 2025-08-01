/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PropertySort } from '@elastic/eui';
import { isArray, isObject } from 'lodash';
import get from 'lodash/get';
import omitBy from 'lodash/omitBy';
import round from 'lodash/round';
import moment from 'moment';
import { v1 as uuid } from 'uuid';
import { HttpSetup } from '../../../../../../src/core/public';
import { BarOrientation } from '../../../../common/constants/shared';
import { TRACE_ANALYTICS_DATE_FORMAT } from '../../../../common/constants/trace_analytics';
import { TraceAnalyticsMode, TraceQueryMode } from '../../../../common/types/trace_analytics';
import { coreRefs } from '../../../../public/framework/core_refs';
import { MILI_TO_SEC } from '../components/common/constants';
import {
  getTimestampPrecision,
  microToMilliSec,
  nanoToMilliSec,
  parseIsoToNano,
} from '../components/common/helper_functions';
import { SpanSearchParams } from '../components/traces/span_detail_table';
import {
  getCustomIndicesTracesQuery,
  getPayloadQuery,
  getSpanFlyoutQuery,
  getSpansQuery,
  getTraceGroupPercentilesQuery,
  getTracesQuery,
} from './queries/traces_queries';
import { handleDslRequest } from './request_handler';

export const handleCustomIndicesTracesRequest = async (
  http: HttpSetup,
  DSL: any,
  items: any,
  setItems: (items: any) => void,
  mode: TraceAnalyticsMode,
  pageIndex: number = 0,
  pageSize: number = 10,
  setTotalHits: any,
  dataSourceMDSId?: string,
  sort?: PropertySort,
  queryMode?: TraceQueryMode,
  isUnderOneHour?: boolean
) => {
  try {
    const response = await handleDslRequest(
      http,
      DSL,
      getCustomIndicesTracesQuery(
        mode,
        undefined,
        pageIndex,
        pageSize,
        sort,
        queryMode,
        isUnderOneHour
      ),
      mode,
      dataSourceMDSId
    );

    const hits = response?.hits?.hits || [];
    const totalHits = response?.hits?.total?.value ?? 0;

    setTotalHits(totalHits);

    if (!hits.length) {
      setItems([]);
      return;
    }

    if (mode === 'data_prepper') {
      const keys = new Set();
      const results = hits.map((val) => {
        const source = omitBy(val._source, isArray || isObject);
        Object.keys(source).forEach((key) => keys.add(key));
        return { ...source };
      });

      setItems(results);
    } else {
      const buckets = response?.aggregations?.traces?.buckets || [];
      const results = buckets.map((bucket: any) => ({
        trace_id: bucket.key,
        latency: bucket.latency.value,
        last_updated: moment(bucket.last_updated.value).format(TRACE_ANALYTICS_DATE_FORMAT),
        error_count: bucket.error_count.doc_count,
        actions: '#',
      }));
      setItems(results);
    }
  } catch (error) {
    console.error('Error in handleCustomIndicesTracesRequest:', error);
    coreRefs.core?.notifications.toasts.addError(error, {
      title: 'Failed to retrieve custom indices traces',
      toastLifeTimeMs: 10000,
    });
  }
};

export const handleTracesRequest = async (
  http: HttpSetup,
  DSL: any,
  timeFilterDSL: any,
  items: any,
  setItems: (items: any) => void,
  mode: TraceAnalyticsMode,
  maxTraces: number = 500,
  dataSourceMDSId?: string,
  sort?: PropertySort,
  isUnderOneHour?: boolean,
  setUniqueTraces?: (count: number) => void
) => {
  const binarySearch = (arr: number[], target: number) => {
    if (!arr) return Number.NaN;
    let low = 0;
    let high = arr.length;
    let mid;
    while (low < high) {
      mid = Math.floor((low + high) / 2);
      if (arr[mid] < target) low = mid + 1;
      else high = mid;
    }
    return Math.max(0, Math.min(100, low));
  };

  const responsePromise = handleDslRequest(
    http,
    DSL,
    getTracesQuery(mode, undefined, maxTraces, sort, isUnderOneHour),
    mode,
    dataSourceMDSId
  );

  // percentile should only be affected by timefilter
  const percentileRangesPromise =
    mode === 'data_prepper'
      ? handleDslRequest(
          http,
          timeFilterDSL,
          getTraceGroupPercentilesQuery(),
          mode,
          dataSourceMDSId
        ).then((response) => {
          const map: Record<string, number[]> = {};
          response.aggregations.trace_group_name.buckets.forEach((traceGroup: any) => {
            map[traceGroup.key] = Object.values(traceGroup.percentiles.values).map((value: any) =>
              nanoToMilliSec(value)
            );
          });
          return map;
        })
      : Promise.resolve({});

  const promises = [responsePromise, percentileRangesPromise];

  return Promise.allSettled(promises)
    .then(([responseResult, percentileRangesResult]) => {
      if (responseResult.status === 'rejected') {
        setItems([]);
        return;
      }

      const percentileRanges =
        percentileRangesResult.status === 'fulfilled' ? percentileRangesResult.value : {};
      const response = responseResult.value;

      if (setUniqueTraces) {
        const uniqueTraces = response?.aggregations?.unique_traces?.value ?? 0;
        setUniqueTraces(uniqueTraces);
      }

      if (
        !response?.aggregations?.traces?.buckets ||
        response.aggregations.traces.buckets.length === 0
      ) {
        setItems([]);
        return;
      }

      const newItems = response.aggregations.traces.buckets.map((bucket: any) => {
        if (mode === 'data_prepper') {
          return {
            trace_id: bucket.key,
            trace_group: bucket.trace_group.buckets[0]?.key,
            latency: bucket.latency.value,
            last_updated: moment(bucket.last_updated.value).format(TRACE_ANALYTICS_DATE_FORMAT),
            error_count: bucket.error_count.doc_count,
            percentile_in_trace_group: binarySearch(
              percentileRanges[bucket.trace_group.buckets[0]?.key],
              bucket.latency.value
            ),
            actions: '#',
          };
        }
        return {
          trace_id: bucket.key,
          latency: bucket.latency.value,
          last_updated: moment(bucket.last_updated.value).format(TRACE_ANALYTICS_DATE_FORMAT),
          error_count: bucket.error_count.doc_count,
          actions: '#',
        };
      });
      setItems(newItems);
    })
    .catch((error) => {
      console.error('Error in handleTracesRequest:', error);
      coreRefs.core?.notifications.toasts.addError(error, {
        title: 'Failed to retrieve traces',
        toastLifeTimeMs: 10000,
      });
    });
};

export const handleSpansFlyoutRequest = (
  http: HttpSetup,
  spanId: string,
  setItems: (items: any) => void,
  mode: TraceAnalyticsMode,
  dataSourceMDSId?: string
) => {
  return handleDslRequest(http, null, getSpanFlyoutQuery(mode, spanId), mode, dataSourceMDSId)
    .then((response) => {
      setItems(response?.hits.hits?.[0]?._source);
    })
    .catch((error) => {
      console.error('Error in handleSpansFlyoutRequest:', error);
      coreRefs.core?.notifications.toasts.addError(error, {
        title: `Failed to retrieve span details for span ID: ${spanId}`,
        toastLifeTimeMs: 10000,
      });
    });
};

export const hitsToSpanDetailData = async (hits: any, colorMap: any, mode: TraceAnalyticsMode) => {
  const data: { gantt: any[]; table: any[]; ganttMaxX: number } = {
    gantt: [],
    table: [],
    ganttMaxX: 0,
  };
  if (hits.length === 0) return data;

  const timestampPrecision = getTimestampPrecision(hits[hits.length - 1].sort[0]);

  const minStartTime = (() => {
    switch (timestampPrecision) {
      case 'micros':
        return microToMilliSec(hits[hits.length - 1].sort[0]);
      case 'nanos':
        return nanoToMilliSec(hits[hits.length - 1].sort[0]);
      default:
        // 'millis'
        return hits[hits.length - 1].sort[0];
    }
  })();

  let maxEndTime = 0;

  hits.forEach((hit: any) => {
    const startTime = (() => {
      switch (timestampPrecision) {
        case 'micros':
          return microToMilliSec(hit.sort[0]) - minStartTime;
        case 'nanos':
          return nanoToMilliSec(hit.sort[0]) - minStartTime;
        default:
          // 'millis'
          return hit.sort[0] - minStartTime;
      }
    })();

    const duration =
      mode === 'jaeger'
        ? round(microToMilliSec(hit._source.duration), 2)
        : round(nanoToMilliSec(hit._source.durationInNanos), 2);
    const serviceName =
      mode === 'jaeger'
        ? get(hit, ['_source', 'process']).serviceName
        : get(hit, ['_source', 'serviceName']);
    const name = mode === 'jaeger' ? get(hit, '_source.operationName') : get(hit, '_source.name');
    const error =
      mode === 'jaeger'
        ? hit._source.tag?.['error'] === true
          ? ' \u26a0 Error'
          : ''
        : hit._source.status?.code === 2 || hit._source['status.code'] === 2
        ? ' \u26a0 Error'
        : '';
    const uniqueLabel = `${serviceName} <br>${name} ` + uuid();
    maxEndTime = Math.max(maxEndTime, startTime + duration);

    data.table.push({
      service_name: serviceName,
      span_id: hit._source.spanID,
      latency: duration,
      vs_benchmark: 0,
      error,
      start_time: hit._source.startTime,
      end_time: hit._source.endTime,
    });
    data.gantt.push(
      {
        x: [startTime],
        y: [uniqueLabel],
        marker: {
          color: 'rgba(0, 0, 0, 0)',
        },
        width: 0.4,
        type: 'bar',
        orientation: BarOrientation.horizontal,
        hoverinfo: 'none',
        showlegend: false,
        spanId: mode === 'jaeger' ? hit._source.spanID : hit._source.spanId,
      },
      {
        x: [duration],
        y: [uniqueLabel],
        text: [error],
        textfont: { color: ['#c14125'] },
        textposition: 'outside',
        marker: {
          color: colorMap[serviceName],
        },
        width: 0.4,
        type: 'bar',
        orientation: BarOrientation.horizontal,
        hovertemplate: '%{x}<extra></extra>',
        spanId: mode === 'jaeger' ? hit._source.spanID : hit._source.spanId,
      }
    );
  });

  data.ganttMaxX = maxEndTime;
  return data;
};

interface Hit {
  _index: string;
  _id: string;
  _score: number;
  _source: any;
  sort?: any[];
}

interface ParsedResponse {
  hits?: {
    hits: Hit[];
  };
  [key: string]: any;
}

export function normalizePayload(parsed: ParsedResponse): Hit[] {
  if (parsed.hits && Array.isArray(parsed.hits.hits)) {
    return parsed.hits.hits;
  }
  return [];
}

export const handlePayloadRequest = (
  traceId: string,
  http: HttpSetup,
  spanDSL: any,
  setPayloadData: (payloadData: any) => void,
  mode: TraceAnalyticsMode,
  dataSourceMDSId?: string
) => {
  return handleDslRequest(http, spanDSL, getPayloadQuery(mode, traceId), mode, dataSourceMDSId)
    .then((response) => {
      const normalizedData = normalizePayload(response);
      const sortedData = normalizedData
        .map((hit) => {
          const time =
            mode === 'jaeger'
              ? Number(hit._source.startTime) * MILI_TO_SEC
              : parseIsoToNano(hit._source.startTime);

          return {
            ...hit,
            sort: hit.sort && hit.sort[0] ? hit.sort : [time],
          };
        })
        .sort((a, b) => b.sort[0] - a.sort[0]); // Sort in descending order by the sort field

      setPayloadData(JSON.stringify(sortedData, null, 2));
    })
    .catch((error) => {
      console.error('Error in handlePayloadRequest:', error);
    });
};

export const handleSpansRequest = (
  http: HttpSetup,
  setItems: (items: any) => void,
  setTotal: (total: number) => void,
  spanSearchParams: SpanSearchParams,
  DSL: any,
  mode: TraceAnalyticsMode,
  dataSourceMDSId?: string
) => {
  return handleDslRequest(http, DSL, getSpansQuery(spanSearchParams), mode, dataSourceMDSId)
    .then((response) => {
      setItems(response.hits.hits.map((hit: any) => hit._source));
      setTotal(response.hits.total?.value || 0);
    })
    .catch((error) => {
      console.error('Error in handleSpansRequest:', error);
      coreRefs.core?.notifications.toasts.addError(error, {
        title: 'Failed to retrieve spans',
        toastLifeTimeMs: 10000,
      });
    });
};
