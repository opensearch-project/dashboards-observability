/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

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
 * All queries use ISO 8601 timestamps for time filtering.
 */

/**
 * Converts a timestamp to ISO 8601 string format
 * Handles Date objects and ISO strings
 *
 * @param timestamp - Date object or ISO string
 * @returns ISO 8601 formatted string (e.g., "2026-01-19T05:44:00.000Z")
 */
function convertToISOString(timestamp: string | Date): string {
  // Handle Date object
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }

  // Handle string - validate and normalize to ISO format
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${timestamp}`);
  }
  return date.toISOString();
}

/**
 * Builds a time filter clause for PPL queries using ISO 8601 timestamps
 *
 * @param startTime - Start time as Date object or ISO string
 * @param endTime - End time as Date object or ISO string
 * @returns PPL WHERE clause filtering by timestamp, or empty string if either time is missing
 */
function buildTimeFilterClause(startTime?: string | Date, endTime?: string | Date): string {
  if (startTime && endTime) {
    const startISO = convertToISOString(startTime);
    const endISO = convertToISOString(endTime);
    return ` | where timestamp >= '${startISO}' and timestamp <= '${endISO}'`;
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
 * | where timestamp >= '2026-01-19T05:44:00.000Z' and timestamp <= '2026-01-19T05:49:00.000Z'
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
 * | where timestamp >= '2026-01-19T05:44:00.000Z' and timestamp <= '2026-01-19T05:49:00.000Z'
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
    query += ` | where sourceNode.keyAttributes.environment = '${environment}'`;
  }
  if (serviceName) {
    query += ` | where sourceNode.keyAttributes.name = '${serviceName}'`;
  }

  query += ` | dedup nodeConnectionHash`;
  query += ` | fields sourceNode.keyAttributes, sourceNode.groupByAttributes`;
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
 * | where timestamp >= '2026-01-19T05:44:00.000Z' and timestamp <= '2026-01-19T05:49:00.000Z'
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
  query += ` | where sourceNode.keyAttributes.environment = '${environment}'`;
  query += ` | where sourceNode.keyAttributes.name = '${serviceName}'`;
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
 * | where timestamp >= '2026-01-19T05:44:00.000Z' and timestamp <= '2026-01-19T05:49:00.000Z'
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
    query += ` | where sourceNode.keyAttributes.environment = '${environment}'`;
  }
  if (serviceName) {
    query += ` | where sourceNode.keyAttributes.name = '${serviceName}'`;
  }

  query += ` | dedup operationConnectionHash`;
  query += ` | fields sourceNode.keyAttributes, sourceOperation.name, targetNode.keyAttributes, targetOperation.name`;
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
 * | where timestamp >= '2026-01-19T05:44:00.000Z' and timestamp <= '2026-01-19T05:49:00.000Z'
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
    query += ` | where sourceNode.keyAttributes.environment = '${environment}'`;
  }
  if (serviceName) {
    query += ` | where sourceNode.keyAttributes.name = '${serviceName}'`;
  }

  query += ` | dedup operationConnectionHash`;
  query += ` | fields sourceNode.keyAttributes, sourceOperation.name, targetNode.keyAttributes, targetOperation.name`;
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
 * | where timestamp >= '2026-01-19T05:44:00.000Z' and timestamp <= '2026-01-19T05:49:00.000Z'
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
  return query;
}

/**
 * Query to count distinct downstream dependencies for a specific operation
 * Returns the count of unique remote services that the operation calls
 *
 * @param queryIndex - Index name
 * @param startTime - Start time for filtering (Date or ISO string)
 * @param endTime - End time for filtering (Date or ISO string)
 * @param environment - Service environment
 * @param serviceName - Service name
 * @param operationName - Operation name to count dependencies for
 * @returns PPL query string
 *
 * @example
 * ```
 * source=otel-apm-service-map
 * | where timestamp >= '2026-01-19T05:44:00.000Z' and timestamp <= '2026-01-19T05:49:00.000Z'
 * | where sourceNode.keyAttributes.environment = 'generic:default'
 * | where sourceNode.keyAttributes.name = 'frontend'
 * | where sourceOperation.name = 'GET /api/users'
 * | stats distinct_count(targetNode.keyAttributes.name) as dependency_count
 * ```
 */
export function getQueryOperationDependenciesCount(
  queryIndex: string,
  startTime?: string | Date,
  endTime?: string | Date,
  environment?: string,
  serviceName?: string,
  operationName?: string
): string {
  let query = `source=${queryIndex}`;
  query += buildTimeFilterClause(startTime, endTime);

  // Filter by service keyAttributes if provided
  if (environment) {
    query += ` | where sourceNode.keyAttributes.environment = '${environment}'`;
  }
  if (serviceName) {
    query += ` | where sourceNode.keyAttributes.name = '${serviceName}'`;
  }
  if (operationName) {
    query += ` | where sourceOperation.name = '${operationName}'`;
  }
  // Count distinct remote services (dependencies)
  query += ` | stats distinct_count(targetNode.keyAttributes.name) as dependency_count`;
  return query;
}

/**
 * Get downstream dependency count for a service
 *
 * Counts how many downstream services a given dependency service calls.
 * This is used in the dependencies table to show how many services each dependency connects to.
 *
 * @param index Index name
 * @param startTime Start time (Date or ISO string)
 * @param endTime End time (Date or ISO string)
 * @param environment Environment filter
 * @param dependencyServiceName The dependency service name to count downstream services for
 */
export function getQueryDependencyDownstreamCount(
  index: string,
  startTime: string | Date,
  endTime: string | Date,
  environment: string,
  dependencyServiceName: string
): string {
  let query = `source=${index}`;
  query += buildTimeFilterClause(startTime, endTime);
  query += ` | where sourceNode.keyAttributes.environment = '${environment}'`;
  query += ` | where sourceNode.keyAttributes.name = '${dependencyServiceName}'`;
  // Count distinct downstream services this dependency calls
  query += ` | stats distinct_count(targetNode.keyAttributes.name) as dependency_count`;
  return query;
}
