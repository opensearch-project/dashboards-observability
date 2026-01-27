/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MetricDataPoint } from '../../common/types/service_map_types';

/**
 * Extract a single numeric value from a Prometheus response
 * Handles data frame format, instantData format, and standard Prometheus format
 */
export function extractSingleValue(response: any): number {
  if (!response) {
    return 0;
  }

  // Check for data frame format (query enhancements plugin)
  if (response?.type === 'data_frame' && response?.fields && Array.isArray(response.fields)) {
    const valueField = response.fields.find((f: any) => f.name === 'Value');
    if (valueField && valueField.values && valueField.values.length > 0) {
      // Get the latest value
      const value = valueField.values[valueField.values.length - 1];
      return parseFloat(value) || 0;
    }
  }

  // Check for instantData format
  if (response?.meta?.instantData?.rows && Array.isArray(response.meta.instantData.rows)) {
    const rows = response.meta.instantData.rows;
    if (rows.length > 0 && rows[0].Value !== undefined) {
      return parseFloat(rows[0].Value) || 0;
    }
  }

  // Standard Prometheus response format
  const result = response?.data?.result || response?.result || [];

  if (result.length > 0) {
    const r = result[0];

    // Handle range query format (values array) - get the latest value
    if (r.values && Array.isArray(r.values) && r.values.length > 0) {
      const latestValue = r.values[r.values.length - 1];
      if (latestValue) {
        return parseFloat(latestValue[1]) || 0;
      }
    }

    // Handle instant query format (value array)
    if (r.value && Array.isArray(r.value)) {
      return parseFloat(r.value[1]) || 0;
    }
  }

  return 0;
}

/**
 * Extract metric data for a specific service from Prometheus response
 * Handles data frame format, instantData format, and standard Prometheus format
 */
export function extractServiceData(response: any, serviceName: string): MetricDataPoint[] {
  if (!response) {
    return [];
  }

  // Check for data frame format (query enhancements plugin)
  if (response?.type === 'data_frame' && response?.fields && Array.isArray(response.fields)) {
    const timeField = response.fields.find((f: any) => f.name === 'Time');
    const seriesField = response.fields.find((f: any) => f.name === 'Series');
    const valueField = response.fields.find((f: any) => f.name === 'Value');

    if (timeField && seriesField && valueField) {
      const dataPoints: MetricDataPoint[] = [];

      // Iterate through all data points and filter by service
      for (let i = 0; i < seriesField.values.length; i++) {
        const seriesLabel = seriesField.values[i];
        // Parse series label: {service="ad"} -> ad
        const match = seriesLabel.match(/service="([^"]+)"/);
        const service = match ? match[1] : null;

        if (service === serviceName) {
          dataPoints.push({
            timestamp: timeField.values[i] / 1000, // Convert ms to seconds
            value: parseFloat(valueField.values[i]) || 0,
          });
        }
      }

      if (dataPoints.length > 0) {
        return dataPoints;
      }
    }
  }

  // Check for instantData format (fallback for instant queries)
  if (response?.meta?.instantData?.rows && Array.isArray(response.meta.instantData.rows)) {
    const rows = response.meta.instantData.rows.filter((row: any) => row.service === serviceName);

    if (rows.length > 0) {
      return rows.map((row: any) => ({
        timestamp: row.Time / 1000, // Convert ms to seconds
        value: parseFloat(row.Value) || 0,
      }));
    }
  }

  // Standard Prometheus response format
  const result = response?.data?.result || response?.result || [];

  const serviceResult = result.find((r: any) => r.metric?.service === serviceName);

  if (!serviceResult) {
    return [];
  }

  // Handle range query format (values array)
  if (serviceResult.values && Array.isArray(serviceResult.values)) {
    return serviceResult.values.map(([timestamp, value]: [number, string]) => ({
      timestamp,
      value: parseFloat(value) || 0,
    }));
  }

  // Handle instant query format (value array)
  if (serviceResult.value && Array.isArray(serviceResult.value)) {
    const [timestamp, value] = serviceResult.value;
    return [
      {
        timestamp,
        value: parseFloat(value) || 0,
      },
    ];
  }

  return [];
}

/**
 * Extract edge metric data from Prometheus response
 * Returns a Map with edge keys (service::env->remoteService) and their values
 */
export function extractEdgeData(response: any): Map<string, number> {
  const edgeMap = new Map<string, number>();

  if (!response) {
    return edgeMap;
  }

  // Check for data frame format (query enhancements plugin)
  if (response?.type === 'data_frame' && response?.fields && Array.isArray(response.fields)) {
    const seriesField = response.fields.find((f: any) => f.name === 'Series');
    const valueField = response.fields.find((f: any) => f.name === 'Value');

    if (seriesField && valueField) {
      // Iterate through all data points
      for (let i = 0; i < seriesField.values.length; i++) {
        const seriesLabel = seriesField.values[i];
        const edgeKey = parseEdgeKey(seriesLabel);

        if (edgeKey) {
          const value = parseFloat(valueField.values[i]) || 0;
          // Keep the latest (or sum for counts)
          const existing = edgeMap.get(edgeKey) || 0;
          edgeMap.set(edgeKey, Math.max(existing, value));
        }
      }
      return edgeMap;
    }
  }

  // Check for instantData format (fallback for instant queries)
  if (response?.meta?.instantData?.rows && Array.isArray(response.meta.instantData.rows)) {
    response.meta.instantData.rows.forEach((row: any) => {
      const service = row.service;
      const environment = row.environment || 'generic:default';
      const remoteService = row.remoteService;

      if (service && remoteService) {
        const edgeKey = `${service}::${environment}->${remoteService}`;
        const value = parseFloat(row.Value) || 0;
        edgeMap.set(edgeKey, value);
      }
    });
    return edgeMap;
  }

  // Standard Prometheus response format
  const result = response?.data?.result || response?.result || [];

  result.forEach((r: any) => {
    const service = r.metric?.service;
    const environment = r.metric?.environment || 'generic:default';
    const remoteService = r.metric?.remoteService;

    if (service && remoteService) {
      const edgeKey = `${service}::${environment}->${remoteService}`;

      // Handle range query format (values array)
      if (r.values && Array.isArray(r.values)) {
        // Get the latest value
        const latestValue = r.values[r.values.length - 1];
        if (latestValue) {
          edgeMap.set(edgeKey, parseFloat(latestValue[1]) || 0);
        }
      }

      // Handle instant query format (value array)
      if (r.value && Array.isArray(r.value)) {
        edgeMap.set(edgeKey, parseFloat(r.value[1]) || 0);
      }
    }
  });

  return edgeMap;
}

/**
 * Parse edge key from series label string
 * e.g., '{service="ad",environment="generic:default",remoteService="frontend"}' -> 'ad::generic:default->frontend'
 */
export function parseEdgeKey(seriesLabel: string): string | null {
  const serviceMatch = seriesLabel.match(/service="([^"]+)"/);
  const envMatch = seriesLabel.match(/environment="([^"]+)"/);
  const remoteMatch = seriesLabel.match(/remoteService="([^"]+)"/);

  if (serviceMatch && remoteMatch) {
    const service = serviceMatch[1];
    const environment = envMatch ? envMatch[1] : 'generic:default';
    const remoteService = remoteMatch[1];
    return `${service}::${environment}->${remoteService}`;
  }

  return null;
}

/**
 * Extract aggregated metric data from Prometheus response
 * Handles data frame format and standard Prometheus format
 * Used for group-level aggregated metrics
 */
export function extractAggregatedData(response: any): MetricDataPoint[] {
  if (!response) {
    return [];
  }

  // Check for data frame format (query enhancements plugin)
  if (response?.type === 'data_frame' && response?.fields && Array.isArray(response.fields)) {
    const timeField = response.fields.find((f: any) => f.name === 'Time');
    const valueField = response.fields.find((f: any) => f.name === 'Value');

    if (timeField && valueField) {
      const dataPoints: MetricDataPoint[] = [];

      for (let i = 0; i < valueField.values.length; i++) {
        const value = parseFloat(valueField.values[i]);
        if (!isNaN(value)) {
          dataPoints.push({
            timestamp: timeField.values[i] / 1000, // Convert ms to seconds
            value,
          });
        }
      }

      return dataPoints;
    }
  }

  // Check for instantData format (fallback for instant queries)
  if (response?.meta?.instantData?.rows && Array.isArray(response.meta.instantData.rows)) {
    const rows = response.meta.instantData.rows;

    if (rows.length > 0) {
      return rows.map((row: any) => ({
        timestamp: row.Time / 1000, // Convert ms to seconds
        value: parseFloat(row.Value) || 0,
      }));
    }
  }

  // Standard Prometheus response format
  const result = response?.data?.result || response?.result || [];

  if (result.length === 0) {
    return [];
  }

  // For aggregated queries, there should be only one result (no grouping labels)
  const aggregatedResult = result[0];

  if (!aggregatedResult) {
    return [];
  }

  // Handle range query format (values array)
  if (aggregatedResult.values && Array.isArray(aggregatedResult.values)) {
    return aggregatedResult.values.map(([timestamp, value]: [number, string]) => ({
      timestamp,
      value: parseFloat(value) || 0,
    }));
  }

  // Handle instant query format (value array)
  if (aggregatedResult.value && Array.isArray(aggregatedResult.value)) {
    const [timestamp, value] = aggregatedResult.value;
    return [
      {
        timestamp,
        value: parseFloat(value) || 0,
      },
    ];
  }

  return [];
}

/**
 * Calculate average of data points
 */
export function calculateAverage(data: MetricDataPoint[]): number {
  if (data.length === 0) return 0;
  // Filter out NaN values
  const validData = data.filter((point) => !isNaN(point.value) && isFinite(point.value));
  if (validData.length === 0) return 0;
  const sum = validData.reduce((acc, point) => acc + point.value, 0);
  return sum / validData.length;
}

/**
 * Calculate sum of data points (for totals)
 */
export function calculateSum(data: MetricDataPoint[]): number {
  if (data.length === 0) return 0;
  // Filter out NaN values
  const validData = data.filter((point) => !isNaN(point.value) && isFinite(point.value));
  return validData.reduce((acc, point) => acc + point.value, 0);
}
