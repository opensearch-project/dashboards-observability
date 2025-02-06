/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import moment from 'moment';

export function normalizePayload(parsed: any): any[] {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (parsed.hits && Array.isArray(parsed.hits.hits)) {
    return parsed.hits.hits;
  }
  return [];
}

export function getOverviewFields(parsed: any, mode: string) {
  const hits = normalizePayload(parsed);
  if (hits.length === 0) return null;
  const firstSpan = hits[0]._source;
  if (!firstSpan) return null;

  if (mode === 'jaeger') {
    // In Jaeger mode, we assume fields:
    //   startTime: a number in microseconds
    //   duration: a number in microseconds
    const lastUpdated = Number(firstSpan.startTime) + Number(firstSpan.duration) / 1000;
    return {
      trace_id: firstSpan.traceID || '-',
      trace_group: firstSpan.operationName || '-',
      last_updated: moment(lastUpdated).format('YYYY-MM-DD HH:mm:ss'),
      latency: firstSpan.duration ? `${(Number(firstSpan.duration) / 1000).toFixed(2)} ms` : 'N/A',
      error_count: firstSpan.tag && firstSpan.tag.error ? 1 : 0,
    };
  } else {
    // Data Prepper mode: try to use traceGroupFields, but if they're null, fall back to top-level values.
    let computedLatency: number | null = null;
    if (firstSpan.traceGroupFields && firstSpan.traceGroupFields.durationInNanos != null) {
      computedLatency = Number(firstSpan.traceGroupFields.durationInNanos) / 1e6;
    } else if (firstSpan.startTime && firstSpan.endTime) {
      computedLatency = moment(firstSpan.endTime).diff(
        moment(firstSpan.startTime),
        'milliseconds',
        true
      );
    }

    const computedLastUpdated =
      firstSpan.traceGroupFields && firstSpan.traceGroupFields.endTime
        ? firstSpan.traceGroupFields.endTime
        : firstSpan.endTime || null;

    const errorCount =
      firstSpan.traceGroupFields && firstSpan.traceGroupFields.statusCode != null
        ? Number(firstSpan.traceGroupFields.statusCode) !== 0
          ? 1
          : 0
        : 0;

    return {
      trace_id: firstSpan.traceId || '-',
      trace_group: firstSpan.traceGroup || '-',
      last_updated: computedLastUpdated
        ? moment(computedLastUpdated).format('YYYY-MM-DD HH:mm:ss')
        : 'N/A',
      latency: computedLatency != null ? `${computedLatency.toFixed(2)} ms` : 'N/A',
      error_count: errorCount,
    };
  }
}

export function getServiceBreakdownData(parsed: any, mode: string) {
  const hits = normalizePayload(parsed);
  const serviceLatencyMap = new Map<string, number>();
  hits.forEach((hit) => {
    const source = hit._source;
    const serviceName = mode === 'jaeger' ? source.process?.serviceName : source.serviceName;
    let latency = 0;
    if (mode === 'jaeger') {
      latency = source.duration ? Number(source.duration) / 1000 : 0;
    } else {
      if (source.durationInNanos) {
        latency = Number(source.durationInNanos) / 1e6;
      } else if (source.traceGroupFields?.durationInNanos) {
        latency = Number(source.traceGroupFields.durationInNanos) / 1e6;
      }
    }
    if (serviceName) {
      const current = serviceLatencyMap.get(serviceName) || 0;
      serviceLatencyMap.set(serviceName, current + latency);
    }
  });

  const serviceBreakdownArray = [...serviceLatencyMap.entries()].sort((a, b) => b[1] - a[1]);

  const colors = [
    '#7492e7',
    '#c33d69',
    '#2ea597',
    '#8456ce',
    '#e07941',
    '#3759ce',
    '#ce567c',
    '#9469d6',
    '#4066df',
    '#da7596',
  ];

  const totalLatency = serviceBreakdownArray.reduce((sum, [, value]) => sum + value, 0);
  const serviceBreakdownData = [
    {
      labels: serviceBreakdownArray.map(([name]) => name),
      values: serviceBreakdownArray.map(([, value]) =>
        totalLatency === 0 ? 100 : (value / totalLatency) * 100
      ),
      type: 'pie',
      textinfo: 'none',
      marker: { colors: colors.slice(0, serviceBreakdownArray.length) },
    },
  ];

  const colorMap = Object.fromEntries(
    serviceBreakdownArray.map(([name], index) => [name, colors[index % colors.length]])
  );

  return { serviceBreakdownData, colorMap };
}
