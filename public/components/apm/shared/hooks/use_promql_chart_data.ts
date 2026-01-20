/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { PromQLSearchService } from '../../query_services/promql_search_service';
import { parseTimeRange, getTimeInSeconds } from '../utils/time_utils';
import {
  TimeRange,
  MetricDataPoint,
  ChartSeriesData,
} from '../../common/types/service_details_types';
import { CHART_COLORS } from '../../common/constants';

export interface UsePromQLChartDataParams {
  promqlQuery: string;
  timeRange: TimeRange;
  prometheusConnectionId: string;
  refreshTrigger?: number;
  enabled?: boolean;
  /** Label field to extract from Prometheus labels (e.g., 'remoteService', 'operation') */
  labelField?: string;
}

export interface UsePromQLChartDataResult {
  series: ChartSeriesData[];
  latestValue: number | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook for fetching and transforming PromQL data for charts
 *
 * Executes a PromQL range query and transforms the response into
 * chart-ready series data with timestamps and values.
 *
 * @example
 * const { series, latestValue, isLoading, error } = usePromQLChartData({
 *   promqlQuery: 'sum(rate(requests_total[5m]))',
 *   timeRange: { from: 'now-1h', to: 'now' },
 *   prometheusConnectionId: 'my-prometheus',
 * });
 */
export const usePromQLChartData = (params: UsePromQLChartDataParams): UsePromQLChartDataResult => {
  const {
    promqlQuery,
    timeRange,
    prometheusConnectionId,
    refreshTrigger,
    enabled = true,
    labelField,
  } = params;

  const [series, setSeries] = useState<ChartSeriesData[]>([]);
  const [latestValue, setLatestValue] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  // Create PromQL search service
  const promqlSearchService = useMemo(() => {
    return new PromQLSearchService(prometheusConnectionId);
  }, [prometheusConnectionId]);

  // Parse time range
  const parsedTimeRange = useMemo(() => {
    try {
      return parseTimeRange(timeRange);
    } catch (err) {
      console.error('[usePromQLChartData] Failed to parse time range:', err);
      return null;
    }
  }, [timeRange]);

  useEffect(() => {
    if (!enabled || !promqlQuery || !parsedTimeRange || !prometheusConnectionId) {
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const { startTime, endTime } = parsedTimeRange;

        const response = await promqlSearchService.executeMetricRequest({
          query: promqlQuery,
          startTime: getTimeInSeconds(startTime),
          endTime: getTimeInSeconds(endTime),
        });

        // Transform response to chart series
        const transformedSeries = transformPromQLResponse(response, labelField);
        setSeries(transformedSeries);

        // Get latest value from first series
        if (transformedSeries.length > 0 && transformedSeries[0].data.length > 0) {
          const lastDataPoint = transformedSeries[0].data[transformedSeries[0].data.length - 1];
          setLatestValue(lastDataPoint.value);
        } else {
          setLatestValue(null);
        }
      } catch (err) {
        console.error('[usePromQLChartData] Error fetching data:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setSeries([]);
        setLatestValue(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [
    promqlQuery,
    parsedTimeRange,
    prometheusConnectionId,
    promqlSearchService,
    refreshTrigger,
    refetchTrigger,
    enabled,
    labelField,
  ]);

  const refetch = useCallback(() => {
    setRefetchTrigger((prev) => prev + 1);
  }, []);

  return { series, latestValue, isLoading, error, refetch };
};

/**
 * Transform PromQL response to chart series data
 *
 * Handles multiple response formats from Prometheus/OSD core.
 * Extracts series names from metric labels and assigns colors.
 *
 * @param response - The response from the PromQL query
 * @param labelField - Optional label field to extract for series name (e.g., 'remoteService', 'operation')
 */
function transformPromQLResponse(response: any, labelField?: string): ChartSeriesData[] {
  if (!response) {
    return [];
  }

  // Handle data_frame format from OSD query enhancements API
  // Format: { type: "data_frame", fields: [{name, type, values}, ...], size: N }
  if (response.type === 'data_frame' && response.fields) {
    return transformDataFrameResponse(response, labelField);
  }

  // Handle JDBC format response from query enhancements API
  // Format: { schema: [...], datarows: [...] }
  if (response.schema && response.datarows) {
    return transformJDBCResponse(response, labelField);
  }

  // Handle raw Prometheus format (if applicable)
  if (response.data?.result) {
    return transformPrometheusResponse(response.data.result, labelField);
  }

  // Handle array of results directly
  if (Array.isArray(response)) {
    return transformPrometheusResponse(response, labelField);
  }

  console.warn('[transformPromQLResponse] Unknown response format:', response);
  return [];
}

/**
 * Transform data_frame format response to chart series
 * Format: { type: "data_frame", fields: [{name: "Time", values: [...]}, {name: "Series", values: [...]}, {name: "Value", values: [...]}] }
 */
function transformDataFrameResponse(
  response: {
    fields: Array<{ name: string; type: string; values: any[] }>;
    size: number;
  },
  labelField?: string
): ChartSeriesData[] {
  const { fields } = response;

  if (!fields || fields.length === 0) {
    return [];
  }

  // Find the Time, Series, and Value fields
  const timeField = fields.find(
    (f) => f.name === 'Time' || f.name === 'time' || f.name === '@timestamp'
  );
  const seriesField = fields.find(
    (f) => f.name === 'Series' || f.name === 'series' || f.name === 'Metric'
  );
  const valueField = fields.find((f) => f.name === 'Value' || f.name === 'value');

  if (!timeField || !valueField) {
    console.warn(
      '[transformDataFrameResponse] Missing Time or Value field:',
      fields.map((f) => f.name)
    );
    return [];
  }

  const timestamps = timeField.values;
  const seriesNames = seriesField?.values || timestamps.map(() => 'value');
  const values = valueField.values;

  // Group data points by series name
  const seriesMap = new Map<string, MetricDataPoint[]>();

  for (let i = 0; i < timestamps.length; i++) {
    const timestamp = timestamps[i];
    const value = values[i];
    const rawSeriesName = seriesNames[i] || 'value';
    // Parse the series name to extract the specified label field
    const seriesName = parseSeriesLabel(rawSeriesName, labelField);

    if (value === null || value === undefined || isNaN(value)) continue;

    if (!seriesMap.has(seriesName)) {
      seriesMap.set(seriesName, []);
    }
    seriesMap.get(seriesName)!.push({ timestamp, value });
  }

  // Convert to ChartSeriesData array
  const seriesArray: ChartSeriesData[] = [];
  let colorIndex = 0;

  seriesMap.forEach((data, name) => {
    // Sort by timestamp
    data.sort((a, b) => a.timestamp - b.timestamp);

    seriesArray.push({
      name: name || 'value',
      data,
      color: CHART_COLORS[colorIndex % CHART_COLORS.length],
    });
    colorIndex++;
  });

  return seriesArray;
}

/**
 * Transform JDBC format response to chart series
 */
function transformJDBCResponse(
  response: { schema: any[]; datarows: any[] },
  labelField?: string
): ChartSeriesData[] {
  const { schema, datarows } = response;

  if (!datarows || datarows.length === 0) {
    return [];
  }

  // Find column indices
  const timeColIndex = schema.findIndex(
    (col: any) => col.name === '@timestamp' || col.name === 'time' || col.name === 'timestamp'
  );
  const valueColIndex = schema.findIndex(
    (col: any) => col.name === 'value' || col.name === 'Value'
  );
  const labelColIndices = schema
    .map((col: any, idx: number) => ({ name: col.name, idx }))
    .filter(
      ({ name }) =>
        name !== '@timestamp' &&
        name !== 'time' &&
        name !== 'timestamp' &&
        name !== 'value' &&
        name !== 'Value'
    );

  // Group data by series labels
  const seriesMap = new Map<string, MetricDataPoint[]>();

  datarows.forEach((row: any[]) => {
    const timestamp = new Date(row[timeColIndex]).getTime();
    const value = parseFloat(row[valueColIndex]);

    if (isNaN(value)) return;

    // Build series key from labels
    let seriesKey: string;
    if (labelField) {
      // If labelField is specified, extract that specific label
      const labelCol = labelColIndices.find(({ name }) => name === labelField);
      seriesKey = labelCol ? String(row[labelCol.idx]) : 'value';
    } else {
      const labelParts = labelColIndices.map(({ name, idx }) => `${name}=${row[idx]}`);
      seriesKey = labelParts.length > 0 ? labelParts.join(',') : 'value';
    }

    if (!seriesMap.has(seriesKey)) {
      seriesMap.set(seriesKey, []);
    }
    seriesMap.get(seriesKey)!.push({ timestamp, value });
  });

  // Convert to ChartSeriesData array
  const seriesArray: ChartSeriesData[] = [];
  let colorIndex = 0;

  seriesMap.forEach((data, name) => {
    // Sort by timestamp
    data.sort((a, b) => a.timestamp - b.timestamp);

    seriesArray.push({
      name: labelField ? name : formatSeriesName(name),
      data,
      color: CHART_COLORS[colorIndex % CHART_COLORS.length],
    });
    colorIndex++;
  });

  return seriesArray;
}

/**
 * Transform raw Prometheus response format to chart series
 */
function transformPrometheusResponse(result: any[], labelField?: string): ChartSeriesData[] {
  return result.map((item, index) => {
    const labels = item.metric || {};
    const seriesName = getSeriesNameFromLabels(labels, labelField);

    // Transform values array [[timestamp, value], ...] to MetricDataPoint[]
    const data: MetricDataPoint[] = (item.values || []).map(
      ([timestamp, value]: [number, string]) => ({
        timestamp: timestamp * 1000, // Convert to milliseconds
        value: parseFloat(value),
      })
    );

    return {
      name: seriesName,
      data,
      color: CHART_COLORS[index % CHART_COLORS.length],
    };
  });
}

/**
 * Extract series name from Prometheus labels
 * @param labels - The labels object from Prometheus
 * @param labelField - Optional specific label field to extract
 */
function getSeriesNameFromLabels(labels: Record<string, string>, labelField?: string): string {
  // If a specific label field is requested, use it
  if (labelField && labels[labelField]) {
    return labels[labelField];
  }

  // Prioritize common label names for display
  const priorityLabels = [
    'remoteService',
    'operation',
    'service',
    'service_name',
    'method',
    'endpoint',
    'instance',
    'job',
  ];

  for (const labelName of priorityLabels) {
    if (labels[labelName]) {
      return labels[labelName];
    }
  }

  // Fall back to __name__ or first label value
  if (labels.__name__) {
    return labels.__name__;
  }

  const labelValues = Object.values(labels);
  return labelValues.length > 0 ? labelValues[0] : 'value';
}

/**
 * Parse a series label string to extract a specific field value
 * Handles formats like: {remoteService="ad"} or {environment="prod", operation="GET /api"}
 *
 * @param labelString - The raw label string (e.g., '{remoteService="ad"}')
 * @param labelField - The specific field to extract (e.g., 'remoteService')
 * @returns The extracted value or the original string if parsing fails
 */
function parseSeriesLabel(labelString: string, labelField?: string): string {
  if (!labelString || labelString === 'value') {
    return labelString;
  }

  // If no specific field requested, try to extract any value
  // Match pattern like: key="value"
  const labelPattern = /(\w+)="([^"]+)"/g;
  const labels: Record<string, string> = {};
  let match;

  while ((match = labelPattern.exec(labelString)) !== null) {
    labels[match[1]] = match[2];
  }

  // If a specific label field is requested
  if (labelField && labels[labelField]) {
    return labels[labelField];
  }

  // If no specific field, try priority order
  const priorityLabels = ['remoteService', 'operation', 'service', 'method'];
  for (const label of priorityLabels) {
    if (labels[label]) {
      return labels[label];
    }
  }

  // Fall back to first label value found
  const values = Object.values(labels);
  if (values.length > 0) {
    return values[0];
  }

  // If nothing matched, return original string
  return labelString;
}

/**
 * Format series name for display (clean up label format)
 */
function formatSeriesName(name: string): string {
  // If it's a label=value format, extract just the value
  if (name.includes('=')) {
    const parts = name.split(',');
    const values = parts.map((part) => {
      const [, value] = part.split('=');
      return value || part;
    });
    return values.join(', ');
  }
  return name;
}
