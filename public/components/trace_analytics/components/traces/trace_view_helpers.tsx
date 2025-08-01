/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import moment from 'moment';
import { MILI_TO_SEC, NANOS_TO_MS, pieChartColors, TraceFilter } from '../common/constants';

export function getOverviewFields(parsed: any, mode: string) {
  if (parsed.length === 0) return null;
  const firstSpan = parsed[parsed.length - 1]._source;
  if (!firstSpan) return null;

  let fallbackValueUsed = false;

  if (mode === 'jaeger') {
    const lastUpdated =
      Number(firstSpan.startTime) / MILI_TO_SEC + Number(firstSpan.duration) / MILI_TO_SEC;

    let errorCount = 0;
    parsed.some((span: any) => {
      if (span._source.tag?.['error'] === true) {
        errorCount++;
        return true;
      }
      return false;
    });

    return {
      trace_id: firstSpan.traceID || '-',
      trace_group: firstSpan.operationName || '-',
      last_updated: moment(lastUpdated).format('MM/DD/YYYY HH:mm:ss.SSS'),
      latency: firstSpan.duration
        ? `${(Number(firstSpan.duration) / MILI_TO_SEC).toFixed(2)} ms`
        : 'N/A',
      error_count: errorCount,
      fallbackValueUsed: false,
    };
  } else {
    let computedLatency: number | null = null;
    const traceGroupFields = firstSpan.traceGroupFields;
    if (traceGroupFields && traceGroupFields.durationInNanos != null) {
      computedLatency = Number(traceGroupFields.durationInNanos) / NANOS_TO_MS;
    } else if (firstSpan.traceGroupFields?.durationInNanos != null) {
      computedLatency = Number(firstSpan.traceGroupFields?.durationInNanos) / NANOS_TO_MS;
    } else {
      const startTimes = parsed.map((span: any) => moment(span._source.startTime));
      const endTimes = parsed.map((span: any) => moment(span._source.endTime));

      const minStartTime = moment.min(startTimes);
      const maxEndTime = moment.max(endTimes);

      if (minStartTime && maxEndTime) {
        computedLatency = maxEndTime.diff(minStartTime, 'milliseconds', true);
        fallbackValueUsed = true;
      }
    }

    const computedLastUpdated = traceGroupFields?.endTime || firstSpan.endTime || null;
    const tgStatus = traceGroupFields?.statusCode;
    let errorCount = tgStatus != null ? (Number(tgStatus) === 2 ? 1 : 0) : 0;

    // If no trace group error found, check individual spans for errors
    if (errorCount === 0) {
      errorCount = parsed.some(
        (span: any) => span._source?.status?.code === 2 || span._source?.['status.code'] === 2
      )
        ? 1
        : 0;
    }

    return {
      trace_id: firstSpan.traceId || '-',
      trace_group: firstSpan.traceGroup || '-',
      last_updated: computedLastUpdated
        ? moment(computedLastUpdated).format('MM/DD/YYYY HH:mm:ss.SSS')
        : 'N/A',
      latency: computedLatency != null ? `${computedLatency.toFixed(2)} ms` : 'N/A',
      error_count: errorCount,
      fallbackValueUsed,
    };
  }
}

export function getServiceBreakdownData(parsed: any, mode: string) {
  const serviceLatencyMap = new Map<string, number>();
  let totalLatency = 0;

  parsed.forEach((hit) => {
    const source = hit._source;
    const serviceName = mode === 'jaeger' ? source.process?.serviceName : source.serviceName;
    let latency = 0;
    if (mode === 'jaeger') {
      latency = source.duration ? Number(source.duration) / 1000 : 0;
    } else {
      if (source.durationInNanos) {
        latency = Number(source.durationInNanos) / NANOS_TO_MS;
      } else if (source.traceGroupFields?.durationInNanos) {
        latency = Number(source.traceGroupFields?.durationInNanos) / NANOS_TO_MS;
      }
    }

    if (serviceName) {
      const current = serviceLatencyMap.get(serviceName) || 0;
      serviceLatencyMap.set(serviceName, current + latency);
      totalLatency += latency;
    }
  });

  const serviceBreakdownArray = [...serviceLatencyMap.entries()].sort((a, b) => b[1] - a[1]);

  const serviceBreakdownData = [
    {
      labels: serviceBreakdownArray.map(([name]) => name),
      values: serviceBreakdownArray.map(([, value]) =>
        totalLatency === 0 ? 100 : (value / totalLatency) * 100
      ),
      type: 'pie',
      textinfo: 'none',
      marker: { colors: pieChartColors.slice(0, serviceBreakdownArray.length) },
    },
  ];

  const colorMap = Object.fromEntries(
    serviceBreakdownArray.map(([name], index) => [
      name,
      pieChartColors[index % pieChartColors.length],
    ])
  );

  return { serviceBreakdownData, colorMap };
}

export const spanFiltersToDSL = (spanFilters: TraceFilter[]) => {
  const spanDSL: any = {
    query: {
      bool: {
        must: [],
        filter: [],
        should: [],
        must_not: [],
      },
    },
  };
  spanFilters.map(({ field, value }) => {
    if (value != null) {
      spanDSL.query.bool.must.push({
        term: {
          [field]: value,
        },
      });
    }
  });
  return spanDSL;
};
