/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { formatPPLTimestamp } from '../../shared/utils/time_utils';
import { escapePPLString } from './escape_utils';

/** Row cap for otherwise-unbounded list/topology PPL queries. */
const DEFAULT_ROW_LIMIT = 1000;

/**
 * PPL queries for APM topology data
 *
 * Data comes from otel-apm-service-map index with a unified document structure.
 * Each document represents a connection between a sourceNode and an optional targetNode,
 * with optional sourceOperation and targetOperation fields.
 *
 * Key fields:
 * - sourceNode.keyAttributes (name, environment, type)
 * - sourceNode.groupByAttributes (telemetry SDK info, etc.)
 * - targetNode.keyAttributes (name, environment, type) — null for leaf services
 * - targetNode.groupByAttributes
 * - sourceOperation.name — the operation on the source side
 * - targetOperation.name — the operation on the target side
 * - nodeConnectionHash — dedup key for topology connections
 * - operationConnectionHash — dedup key for operation-level connections
 *
 * Timestamps use 'YYYY-MM-DD HH:mm:ss.SSS' format for backward compatibility with all PPL versions.
 */

/**
 * Converts a timestamp to a Date object for formatting
 */
function toDate(timestamp: string | Date): Date {
  if (timestamp instanceof Date) {
    return timestamp;
  }
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${timestamp}`);
  }
  return date;
}

/**
 * Builds a time filter clause for PPL queries using 'YYYY-MM-DD HH:mm:ss.SSS' format
 *
 * @param startTime - Start time as Date object or ISO string
 * @param endTime - End time as Date object or ISO string
 * @returns PPL WHERE clause filtering by timestamp, or empty string if either time is missing
 */
function buildTimeFilterClause(startTime?: string | Date, endTime?: string | Date): string {
  if (startTime && endTime) {
    const startStr = formatPPLTimestamp(toDate(startTime));
    const endStr = formatPPLTimestamp(toDate(endTime));
    return ` | where timestamp >= '${startStr}' and timestamp <= '${endStr}'`;
  }
  return '';
}

/**
 * Query to list all services in the time range
 * Fetches unique connections and extracts services from both source and target nodes
 *
 * @param queryIndex - Index name (default: otel-apm-service-map)
 * @param startTime - Start time for filtering (Date or ISO string)
 * @param endTime - End time for filtering (Date or ISO string)
 * @returns PPL query string
 *
 * @example
 * ```
 * source=otel-apm-service-map
 * | where timestamp >= '2026-01-19 05:44:00.000' and timestamp <= '2026-01-19 05:49:00.000'
 * | dedup nodeConnectionHash
 * | fields sourceNode.keyAttributes, sourceNode.groupByAttributes, targetNode.keyAttributes, targetNode.groupByAttributes
 * ```
 */
export function getQueryListServices(
  queryIndex: string,
  startTime?: string | Date,
  endTime?: string | Date
): string {
  let query = `source=${queryIndex}`;
  query += buildTimeFilterClause(startTime, endTime);
  query += ` | dedup nodeConnectionHash`;
  query += ` | fields sourceNode.keyAttributes, sourceNode.groupByAttributes, targetNode.keyAttributes, targetNode.groupByAttributes`;
  query += ` | head ${DEFAULT_ROW_LIMIT}`;
  return query;
}

/**
 * Query to get service details by key attributes
 *
 * @param queryIndex - Index name
 * @param startTime - Start time for filtering (Date or ISO string)
 * @param endTime - End time for filtering (Date or ISO string)
 * @param environment - Service environment (e.g., "generic:default", "production")
 * @param serviceName - Service name
 * @returns PPL query string
 *
 * @example
 * ```
 * source=otel-apm-service-map
 * | where timestamp >= '2026-01-19 05:44:00.000' and timestamp <= '2026-01-19 05:49:00.000'
 * | where sourceNode.keyAttributes.environment = 'generic:default'
 * | where sourceNode.keyAttributes.name = 'frontend'
 * | dedup nodeConnectionHash
 * | fields sourceNode.keyAttributes, sourceNode.groupByAttributes
 * ```
 */
export function getQueryGetService(
  queryIndex: string,
  startTime?: string | Date,
  endTime?: string | Date,
  environment?: string,
  serviceName?: string
): string {
  let query = `source=${queryIndex}`;
  query += buildTimeFilterClause(startTime, endTime);

  // Filter by service keyAttributes if provided
  if (environment) {
    query += ` | where sourceNode.keyAttributes.environment = '${escapePPLString(environment)}'`;
  }
  if (serviceName) {
    query += ` | where sourceNode.keyAttributes.name = '${escapePPLString(serviceName)}'`;
  }

  query += ` | dedup nodeConnectionHash`;
  query += ` | fields sourceNode.keyAttributes, sourceNode.groupByAttributes`;
  query += ` | head ${DEFAULT_ROW_LIMIT}`;
  return query;
}

/**
 * Query to get service attributes (groupByAttributes) for a specific service
 *
 * Sorts by timestamp descending to get the most recent attributes.
 *
 * @param queryIndex - Index name (from APM config serviceMapDataset)
 * @param startTime - Start time for filtering (Date or ISO string)
 * @param endTime - End time for filtering (Date or ISO string)
 * @param environment - Service environment
 * @param serviceName - Service name
 * @returns PPL query string
 *
 * @example
 * ```
 * source=otel-apm-service-map
 * | where timestamp >= '2026-01-19 05:44:00.000' and timestamp <= '2026-01-19 05:49:00.000'
 * | where sourceNode.keyAttributes.environment = 'generic:default'
 * | where sourceNode.keyAttributes.name = 'frontend'
 * | fields sourceNode.keyAttributes, sourceNode.groupByAttributes, timestamp
 * | sort - timestamp
 * | head 1
 * ```
 */
export function getQueryServiceAttributes(
  queryIndex: string,
  startTime: string | Date,
  endTime: string | Date,
  environment: string,
  serviceName: string
): string {
  let query = `source=${queryIndex}`;
  query += buildTimeFilterClause(startTime, endTime);
  query += ` | where sourceNode.keyAttributes.environment = '${escapePPLString(environment)}'`;
  query += ` | where sourceNode.keyAttributes.name = '${escapePPLString(serviceName)}'`;
  query += ` | fields sourceNode.keyAttributes, sourceNode.groupByAttributes, timestamp`;
  query += ` | sort - timestamp`;
  query += ` | head 1`;
  return query;
}

/**
 * Query to list service operations for a given service
 *
 * @param queryIndex - Index name
 * @param startTime - Start time for filtering (Date or ISO string)
 * @param endTime - End time for filtering (Date or ISO string)
 * @param environment - Service environment
 * @param serviceName - Service name
 * @returns PPL query string
 *
 * @example
 * ```
 * source=otel-apm-service-map
 * | where timestamp >= '2026-01-19 05:44:00.000' and timestamp <= '2026-01-19 05:49:00.000'
 * | where sourceNode.keyAttributes.environment = 'generic:default'
 * | where sourceNode.keyAttributes.name = 'frontend'
 * | dedup operationConnectionHash
 * | fields sourceNode.keyAttributes, sourceOperation.name, targetNode.keyAttributes, targetOperation.name
 * ```
 */
export function getQueryListServiceOperations(
  queryIndex: string,
  startTime?: string | Date,
  endTime?: string | Date,
  environment?: string,
  serviceName?: string
): string {
  let query = `source=${queryIndex}`;
  query += buildTimeFilterClause(startTime, endTime);

  // Filter by service keyAttributes if provided
  if (environment) {
    query += ` | where sourceNode.keyAttributes.environment = '${escapePPLString(environment)}'`;
  }
  if (serviceName) {
    query += ` | where sourceNode.keyAttributes.name = '${escapePPLString(serviceName)}'`;
  }

  query += ` | dedup operationConnectionHash`;
  query += ` | fields sourceNode.keyAttributes, sourceOperation.name, targetNode.keyAttributes, targetOperation.name`;
  query += ` | head ${DEFAULT_ROW_LIMIT}`;
  return query;
}

/**
 * Query to list service dependencies for a given service
 *
 * @param queryIndex - Index name
 * @param startTime - Start time for filtering (Date or ISO string)
 * @param endTime - End time for filtering (Date or ISO string)
 * @param environment - Service environment
 * @param serviceName - Service name
 * @returns PPL query string
 *
 * @example
 * ```
 * source=otel-apm-service-map
 * | where timestamp >= '2026-01-19 05:44:00.000' and timestamp <= '2026-01-19 05:49:00.000'
 * | where sourceNode.keyAttributes.environment = 'generic:default'
 * | where sourceNode.keyAttributes.name = 'frontend'
 * | dedup operationConnectionHash
 * | fields sourceNode.keyAttributes, sourceOperation.name, targetNode.keyAttributes, targetOperation.name
 * ```
 */
export function getQueryListServiceDependencies(
  queryIndex: string,
  startTime?: string | Date,
  endTime?: string | Date,
  environment?: string,
  serviceName?: string
): string {
  let query = `source=${queryIndex}`;
  query += buildTimeFilterClause(startTime, endTime);

  // Filter by service keyAttributes if provided
  if (environment) {
    query += ` | where sourceNode.keyAttributes.environment = '${escapePPLString(environment)}'`;
  }
  if (serviceName) {
    query += ` | where sourceNode.keyAttributes.name = '${escapePPLString(serviceName)}'`;
  }

  query += ` | dedup operationConnectionHash`;
  query += ` | fields sourceNode.keyAttributes, sourceOperation.name, targetNode.keyAttributes, targetOperation.name`;
  query += ` | head ${DEFAULT_ROW_LIMIT}`;
  return query;
}

/**
 * Query to get service map (topology) data
 * Fetches unique connections showing service-to-service relationships
 *
 * @param queryIndex - Index name
 * @param startTime - Start time for filtering (Date or ISO string)
 * @param endTime - End time for filtering (Date or ISO string)
 * @returns PPL query string
 *
 * @example
 * ```
 * source=otel-apm-service-map
 * | where timestamp >= '2026-01-19 05:44:00.000' and timestamp <= '2026-01-19 05:49:00.000'
 * | dedup nodeConnectionHash
 * | fields sourceNode.keyAttributes, targetNode.keyAttributes, sourceNode.groupByAttributes, targetNode.groupByAttributes
 * ```
 */
export function getQueryGetServiceMap(
  queryIndex: string,
  startTime?: string | Date,
  endTime?: string | Date
): string {
  let query = `source=${queryIndex}`;
  query += buildTimeFilterClause(startTime, endTime);
  query += ` | dedup nodeConnectionHash`;
  query += ` | fields sourceNode.keyAttributes, targetNode.keyAttributes, sourceNode.groupByAttributes, targetNode.groupByAttributes`;
  query += ` | head ${DEFAULT_ROW_LIMIT}`;
  return query;
}
