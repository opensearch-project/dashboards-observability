/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PPL queries for APM topology data
 *
 * Data comes from otel-apm-service-map index with event types:
 * - ServiceOperationDetail: Service and operation level details
 * - ServiceConnection: Service-to-service connections for topology
 *
 * All queries use numeric epoch timestamps for time filtering.
 */

/**
 * Converts a timestamp to epoch seconds
 * Handles Unix timestamps (seconds or milliseconds) and ISO strings
 */
function convertToEpochSeconds(timestamp: string | number): number {
  if (typeof timestamp === 'number') {
    // Unix timestamp - determine if seconds or milliseconds
    if (timestamp > 10000000000) {
      // Milliseconds - convert to seconds
      return Math.floor(timestamp / 1000);
    } else {
      // Already in seconds
      return timestamp;
    }
  }

  // String - parse to Date and get epoch time in seconds
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${timestamp}`);
  }

  return Math.floor(date.getTime() / 1000);
}

/**
 * Builds a time filter clause for PPL queries using epoch seconds
 *
 * @param startTime - Start time as Unix timestamp (seconds/milliseconds) or ISO string
 * @param endTime - End time as Unix timestamp (seconds/milliseconds) or ISO string
 * @returns PPL WHERE clause filtering by timestamp, or empty string if either time is missing
 */
function buildTimeFilterClause(startTime?: string | number, endTime?: string | number): string {
  if (startTime && endTime) {
    const startEpoch = convertToEpochSeconds(startTime);
    const endEpoch = convertToEpochSeconds(endTime);
    return ` | where timestamp >= ${startEpoch} and timestamp <= ${endEpoch}`;
  }
  return '';
}

/**
 * Query to list all services in the time range
 * Fetches ServiceOperationDetail events and deduplicates by service identity
 *
 * @param queryIndex - Index name (default: otel-apm-service-map)
 * @param startTime - Start time for filtering
 * @param endTime - End time for filtering
 * @returns PPL query string
 *
 * @example
 * ```
 * source=otel-apm-service-map
 * | where timestamp >= 1765405560 and timestamp <= 1765405860
 * | where eventType = 'ServiceOperationDetail'
 * | dedup service.keyAttributes.name, service.keyAttributes.environment
 * | fields service.keyAttributes, service.groupByAttributes
 * ```
 */
export function getQueryListServices(
  queryIndex: string,
  startTime?: string | number,
  endTime?: string | number
): string {
  let query = `source=${queryIndex}`;
  query += buildTimeFilterClause(startTime, endTime);
  query += ` | where eventType = 'ServiceOperationDetail'`;
  query += ` | dedup service.keyAttributes.name, service.keyAttributes.environment`;
  query += ` | fields service.keyAttributes, service.groupByAttributes`;
  return query;
}

/**
 * Query to get service details by key attributes
 *
 * @param queryIndex - Index name
 * @param startTime - Start time for filtering
 * @param endTime - End time for filtering
 * @param environment - Service environment (e.g., "generic:default", "production")
 * @param serviceName - Service name
 * @returns PPL query string
 *
 * @example
 * ```
 * source=otel-apm-service-map
 * | where timestamp >= 1765405560 and timestamp <= 1765405860
 * | dedup hashCode
 * | where eventType = 'ServiceOperationDetail'
 * | where service.keyAttributes.environment = 'generic:default'
 * | where service.keyAttributes.name = 'frontend'
 * | fields service.keyAttributes, service.groupByAttributes
 * ```
 */
export function getQueryGetService(
  queryIndex: string,
  startTime?: string | number,
  endTime?: string | number,
  environment?: string,
  serviceName?: string
): string {
  let query = `source=${queryIndex}`;
  query += buildTimeFilterClause(startTime, endTime);
  query += ` | dedup hashCode`;
  query += ` | where eventType = 'ServiceOperationDetail'`;

  // Filter by service keyAttributes if provided
  if (environment) {
    query += ` | where service.keyAttributes.environment = '${environment}'`;
  }
  if (serviceName) {
    query += ` | where service.keyAttributes.name = '${serviceName}'`;
  }

  query += ` | fields service.keyAttributes, service.groupByAttributes`;
  return query;
}

/**
 * Query to list service operations for a given service
 *
 * @param queryIndex - Index name
 * @param startTime - Start time for filtering
 * @param endTime - End time for filtering
 * @param environment - Service environment
 * @param serviceName - Service name
 * @returns PPL query string
 *
 * @example
 * ```
 * source=otel-apm-service-map
 * | where timestamp >= 1765405560 and timestamp <= 1765405860
 * | dedup hashCode
 * | where eventType = 'ServiceOperationDetail'
 * | where service.keyAttributes.environment = 'generic:default'
 * | where service.keyAttributes.name = 'frontend'
 * | fields service.keyAttributes, operation.name, operation.remoteService.keyAttributes, operation.remoteOperationName
 * ```
 */
export function getQueryListServiceOperations(
  queryIndex: string,
  startTime?: string | number,
  endTime?: string | number,
  environment?: string,
  serviceName?: string
): string {
  let query = `source=${queryIndex}`;
  query += buildTimeFilterClause(startTime, endTime);
  query += ` | dedup hashCode`;
  query += ` | where eventType = 'ServiceOperationDetail'`;

  // Filter by service keyAttributes if provided
  if (environment) {
    query += ` | where service.keyAttributes.environment = '${environment}'`;
  }
  if (serviceName) {
    query += ` | where service.keyAttributes.name = '${serviceName}'`;
  }

  query += ` | fields service.keyAttributes, operation.name, operation.remoteService.keyAttributes, operation.remoteOperationName`;
  return query;
}

/**
 * Query to list service dependencies for a given service
 *
 * @param queryIndex - Index name
 * @param startTime - Start time for filtering
 * @param endTime - End time for filtering
 * @param environment - Service environment
 * @param serviceName - Service name
 * @returns PPL query string
 *
 * @example
 * ```
 * source=otel-apm-service-map
 * | where timestamp >= 1765405560 and timestamp <= 1765405860
 * | dedup hashCode
 * | where eventType = 'ServiceOperationDetail'
 * | where service.keyAttributes.environment = 'generic:default'
 * | where service.keyAttributes.name = 'frontend'
 * | fields service.keyAttributes, operation.remoteService.keyAttributes, operation.remoteOperationName
 * ```
 */
export function getQueryListServiceDependencies(
  queryIndex: string,
  startTime?: string | number,
  endTime?: string | number,
  environment?: string,
  serviceName?: string
): string {
  let query = `source=${queryIndex}`;
  query += buildTimeFilterClause(startTime, endTime);
  query += ` | dedup hashCode`;
  query += ` | where eventType = 'ServiceOperationDetail'`;

  // Filter by service keyAttributes if provided
  if (environment) {
    query += ` | where service.keyAttributes.environment = '${environment}'`;
  }
  if (serviceName) {
    query += ` | where service.keyAttributes.name = '${serviceName}'`;
  }

  query += ` | fields service.keyAttributes, operation.name, operation.remoteService.keyAttributes, operation.remoteOperationName`;
  return query;
}

/**
 * Query to get service map (topology) data
 * Fetches ServiceConnection events showing service-to-service relationships
 *
 * @param queryIndex - Index name
 * @param startTime - Start time for filtering
 * @param endTime - End time for filtering
 * @returns PPL query string
 *
 * @example
 * ```
 * source=otel-apm-service-map
 * | where timestamp >= 1765405560 and timestamp <= 1765405860
 * | dedup hashCode
 * | where eventType = 'ServiceConnection'
 * | fields service.keyAttributes, remoteService.keyAttributes, service.groupByAttributes, remoteService.groupByAttributes
 * ```
 */
export function getQueryGetServiceMap(
  queryIndex: string,
  startTime?: string | number,
  endTime?: string | number
): string {
  let query = `source=${queryIndex}`;
  query += buildTimeFilterClause(startTime, endTime);
  query += ` | dedup hashCode`;
  query += ` | where eventType = 'ServiceConnection'`;
  query += ` | fields service.keyAttributes, remoteService.keyAttributes, service.groupByAttributes, remoteService.groupByAttributes`;
  return query;
}

/**
 * Query to count distinct downstream dependencies for a specific operation
 * Returns the count of unique remote services that the operation calls
 *
 * @param queryIndex - Index name
 * @param startTime - Start time for filtering
 * @param endTime - End time for filtering
 * @param environment - Service environment
 * @param serviceName - Service name
 * @param operationName - Operation name to count dependencies for
 * @returns PPL query string
 *
 * @example
 * ```
 * source=otel-apm-service-map
 * | where timestamp >= 1765405560 and timestamp <= 1765405860
 * | dedup hashCode
 * | where eventType = 'ServiceOperationDetail'
 * | where service.keyAttributes.environment = 'generic:default'
 * | where service.keyAttributes.name = 'frontend'
 * | where operation.name = 'GET /api/users'
 * | stats dc(operation.remoteService.keyAttributes.name) as dependency_count
 * ```
 */
export function getQueryOperationDependenciesCount(
  queryIndex: string,
  startTime?: string | number,
  endTime?: string | number,
  environment?: string,
  serviceName?: string,
  operationName?: string
): string {
  let query = `source=${queryIndex}`;
  query += buildTimeFilterClause(startTime, endTime);
  query += ` | dedup hashCode`;
  query += ` | where eventType = 'ServiceOperationDetail'`;

  // Filter by service keyAttributes if provided
  if (environment) {
    query += ` | where service.keyAttributes.environment = '${environment}'`;
  }
  if (serviceName) {
    query += ` | where service.keyAttributes.name = '${serviceName}'`;
  }
  if (operationName) {
    query += ` | where operation.name = '${operationName}'`;
  }

  // Count distinct remote services (dependencies)
  query += ` | stats dc(operation.remoteService.keyAttributes.name) as dependency_count`;
  return query;
}

/**
 * Get downstream dependency count for a service
 *
 * Counts how many downstream services a given dependency service calls.
 * This is used in the dependencies table to show how many services each dependency connects to.
 *
 * @param index Index name
 * @param startTime Start time in seconds
 * @param endTime End time in seconds
 * @param environment Environment filter
 * @param dependencyServiceName The dependency service name to count downstream services for
 */
export function getQueryDependencyDownstreamCount(
  index: string,
  startTime: number,
  endTime: number,
  environment: string,
  dependencyServiceName: string
): string {
  let query = `source=${index}`;
  query += ` | where timestamp >= ${startTime} and timestamp <= ${endTime}`;
  query += ` | dedup hashCode`;
  query += ` | where eventType = 'ServiceOperationDetail'`;
  query += ` | where service.keyAttributes.environment = '${environment}'`;
  query += ` | where service.keyAttributes.name = '${dependencyServiceName}'`;

  // Count distinct downstream services this dependency calls
  query += ` | stats dc(operation.remoteService.keyAttributes.name) as dependency_count`;
  return query;
}
