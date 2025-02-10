/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { get } from 'lodash';
import moment from 'moment';
import { MILI_TO_SEC, NANOS_TO_MS, pieChartColors } from '../common/constants';

export function getOverviewFields(parsed: any, mode: string) {
  if (parsed.length === 0) return null;
  const firstSpan = parsed[0]._source;
  if (!firstSpan) return null;

  let fallbackValueUsed = false;

  if (mode === 'jaeger') {
    const lastUpdated =
      Number(firstSpan.startTime) / MILI_TO_SEC + Number(firstSpan.duration) / MILI_TO_SEC;
    return {
      trace_id: firstSpan.traceID || '-',
      trace_group: firstSpan.operationName || '-',
      last_updated: moment(lastUpdated).format('MM/DD/YYYY HH:mm:ss.SSS'),
      latency: firstSpan.duration
        ? `${(Number(firstSpan.duration) / MILI_TO_SEC).toFixed(2)} ms`
        : 'N/A',
      error_count: firstSpan.tag && firstSpan.tag.error ? 1 : 0,
      fallbackValueUsed: false,
    };
  } else {
    let computedLatency: number | null = null;
    const tgDuration = get(firstSpan, 'traceGroupFields.durationInNanos');
    if (firstSpan.traceGroupFields && firstSpan.traceGroupFields.durationInNanos != null) {
      computedLatency = Number(firstSpan.traceGroupFields.durationInNanos) / NANOS_TO_MS;
    } else if (tgDuration != null) {
      computedLatency = Number(tgDuration) / NANOS_TO_MS;
    } else if (firstSpan.durationInNanos != null) {
      computedLatency = Number(firstSpan.durationInNanos) / NANOS_TO_MS;
      fallbackValueUsed = true;
    } else if (firstSpan.startTime && firstSpan.endTime) {
      computedLatency = moment(firstSpan.endTime).diff(
        moment(firstSpan.startTime),
        'milliseconds',
        true
      );
      fallbackValueUsed = true;
    }

    const computedLastUpdated =
      get(firstSpan, 'traceGroupFields.endTime') || firstSpan.endTime || null;
    const tgStatus = get(firstSpan, 'traceGroupFields.statusCode');
    const errorCount = tgStatus != null ? (Number(tgStatus) !== 0 ? 1 : 0) : 0;

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
        latency = Number(source.traceGroupFields.durationInNanos) / NANOS_TO_MS;
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
