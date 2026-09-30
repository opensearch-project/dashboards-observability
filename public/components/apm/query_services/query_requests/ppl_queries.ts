/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { formatPPLTimestamp } from '../../shared/utils/time_utils';
import { escapePPLString } from './escape_utils';

/** Row cap for otherwise-unbounded list/topology PPL queries. */
export const DEFAULT_ROW_LIMIT = 1000;

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
function buildTimeFilterClause(
  startTime?: string | Date,
  endTime?: string | Date,
  field = 'timestamp'
): string {
  if (startTime && endTime) {
    const startStr = formatPPLTimestamp(toDate(startTime));
    const endStr = formatPPLTimestamp(toDate(endTime));
    return ` | where ${field} >= '${startStr}' and ${field} <= '${endStr}'`;
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
  query += ` | fields sourceNode.keyAttributes, sourceNode.type, sourceNode.groupByAttributes, targetNode.keyAttributes, targetNode.type, targetNode.groupByAttributes`;
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
  query += ` | fields sourceNode.keyAttributes, sourceNode.type, targetNode.keyAttributes, targetNode.type, sourceNode.groupByAttributes, targetNode.groupByAttributes`;
  query += ` | head ${DEFAULT_ROW_LIMIT}`;
  return query;
}

/**
 * Query for the identifying attributes of a dependency node (database / messaging /
 * external) from its most recent service-map document. data-prepper writes them to
 * `targetNode.dependencyAttributes` (e.g. `server.address`, `db.system.name`,
 * `messaging.destination.name`); older documents have none, which the caller treats
 * as "fall back to the node name".
 *
 * @param queryIndex - Service-map index name
 * @param dependencyName - Dependency node name (e.g. `redis:valkey-cart`)
 * @param environment - Dependency node environment
 * @param startTime - Start time for filtering (Date or ISO string)
 * @param endTime - End time for filtering (Date or ISO string)
 * @returns PPL query string
 */
export function getQueryDependencyAttributes(
  queryIndex: string,
  dependencyName: string,
  environment: string,
  startTime?: string | Date,
  endTime?: string | Date
): string {
  let query = `source=${queryIndex}`;
  query += buildTimeFilterClause(startTime, endTime);
  query += ` | where targetNode.keyAttributes.name = '${escapePPLString(dependencyName)}'`;
  query += ` and targetNode.keyAttributes.environment = '${escapePPLString(environment)}'`;
  query += ` | sort - timestamp | head 1 | fields targetNode.dependencyAttributes`;
  return query;
}

/**
 * Flatten a (possibly nested) `dependencyAttributes` value into dotted keys. PPL returns
 * the dynamic object as a nested struct (`{ server: { address: 'x' } }`); `_source` may
 * already use dotted keys, and some response shapes serialize it as a JSON string.
 * Only string/number leaves are kept.
 */
export function flattenDependencyAttributes(value: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof value === 'string' && !prefix) {
    // Some response shapes serialize the struct; parse it like keyAttributes.
    try {
      return flattenDependencyAttributes(JSON.parse(value));
    } catch (_e) {
      return out;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string' || typeof child === 'number') {
      out[path] = String(child);
    } else {
      Object.assign(out, flattenDependencyAttributes(child, path));
    }
  });
  return out;
}

const spanFieldIn = (fields: string[], value: string): string =>
  `(${fields.map((f) => `attributes.${f} = '${escapePPLString(value)}'`).join(' or ')})`;
const spanFieldsNull = (fields: string[]): string =>
  fields.map((f) => `isnull(attributes.${f})`).join(' and ');

// Span attribute keys (semconv plus the flattened variants seen in OTel data) that
// data-prepper reads when it names a dependency node. PPL rejects the whole query when it
// compares an object path to a string, so the legacy keys `db.system` and
// `messaging.destination` (objects wherever `db.system.name` / `messaging.destination.name`
// are mapped) are only added on request; see includeLegacyKeys.
const DB_SYSTEM_FIELDS = ['db.system.name', 'db_system_name', 'db_system'];
const LEGACY_DB_SYSTEM_FIELD = 'db.system';
const MESSAGING_DESTINATION_FIELDS = ['messaging.destination.name'];
const LEGACY_MESSAGING_DESTINATION_FIELD = 'messaging.destination';
// Only the callers' outbound spans target a dependency; a SERVER span's server.address is
// its own listener, so it must not match an external dependency's host.
const DEPENDENCY_SPAN_KINDS = ['SPAN_KIND_CLIENT', 'SPAN_KIND_PRODUCER', 'SPAN_KIND_CONSUMER'];
// Same keys and order data-prepper reads the dependency host from.
const HOST_FIELDS = ['server.address', 'net.peer.name', 'network.peer.address'];
const DB_NAMESPACE_FIELDS = ['db.namespace', 'db.name'];

/**
 * Build the PPL condition selecting the callers' spans that target a dependency node.
 * A dependency emits no spans of its own, so these are the callers' CLIENT / PRODUCER /
 * CONSUMER spans, matched the way data-prepper names the node:
 * database `{system}:{host}` > `{system}:{namespace}` > `{system}`; messaging
 * `{system}:{destination}`; external `{host}[:{non-default port}]`.
 * The node's `dependencyAttributes` are preferred; the name is parsed only when they are
 * absent (older documents).
 *
 * Database spans whose host is not nameable (IP, loopback, denylisted) are not matched for
 * `{system}` / `{system}:{namespace}` nodes: data-prepper ignores such hosts when naming,
 * which PPL cannot express cheaply.
 *
 * @param nodeType - database / messaging / external (case-insensitive)
 * @param dependencyName - Dependency node name
 * @param attributes - Flattened `dependencyAttributes` of the node, if known
 * @param options.includeLegacyKeys - Also match the legacy keys `db.system` and
 *   `messaging.destination`; the query fails where those paths are objects, so callers
 *   retry without them
 * @returns PPL boolean expression, or null when nothing identifies the dependency
 */
export function buildDependencySpanCondition(
  nodeType: string,
  dependencyName: string,
  attributes: Record<string, string> = {},
  options: { includeLegacyKeys?: boolean } = {}
): string | null {
  if (!dependencyName) return null;
  const type = (nodeType || '').toLowerCase();
  const sep = dependencyName.indexOf(':');
  const namePrefix = sep >= 0 ? dependencyName.slice(0, sep) : dependencyName;
  const nameSuffix = sep >= 0 ? dependencyName.slice(sep + 1) : '';
  const hasPortSuffix = /^\d+$/.test(nameSuffix);

  if (type === 'messaging') {
    const destination = attributes['messaging.destination.name'] || nameSuffix || dependencyName;
    const system = attributes['messaging.system'] || (nameSuffix ? namePrefix : '');
    const destinationFields = options.includeLegacyKeys
      ? [...MESSAGING_DESTINATION_FIELDS, LEGACY_MESSAGING_DESTINATION_FIELD]
      : MESSAGING_DESTINATION_FIELDS;
    const destinationCondition = spanFieldIn(destinationFields, destination);
    return system
      ? `${destinationCondition} and ${spanFieldIn(['messaging.system'], system)}`
      : destinationCondition;
  }

  if (type === 'database') {
    const systemFields = options.includeLegacyKeys
      ? [...DB_SYSTEM_FIELDS, LEGACY_DB_SYSTEM_FIELD]
      : DB_SYSTEM_FIELDS;
    let system = attributes['db.system.name'];
    let host = attributes['server.address'];
    const namespace = attributes['db.namespace'];
    // `{system}:{x}` parsed from the name, where x is a host or a namespace.
    let hostOrNamespace: string | undefined;
    if (!system && !host && !namespace) {
      // No attributes (older documents): parse the name. A legacy `{host}:{port}` name
      // identifies the host only.
      if (hasPortSuffix) host = namePrefix;
      else if (nameSuffix) [system, hostOrNamespace] = [namePrefix, nameSuffix];
      else system = dependencyName;
    }
    const withSystem = (condition: string) =>
      system ? `${spanFieldIn(systemFields, system)} and ${condition}` : condition;
    const noHost = spanFieldsNull(HOST_FIELDS);
    if (host) return withSystem(spanFieldIn(HOST_FIELDS, host));
    if (hostOrNamespace) {
      return withSystem(spanFieldIn([...HOST_FIELDS, ...DB_NAMESPACE_FIELDS], hostOrNamespace));
    }
    if (namespace)
      return withSystem(`${noHost} and ${spanFieldIn(DB_NAMESPACE_FIELDS, namespace)}`);
    return withSystem(`${noHost} and ${spanFieldsNull(DB_NAMESPACE_FIELDS)}`);
  }

  // external
  const host = attributes['server.address'] || (hasPortSuffix ? namePrefix : dependencyName);
  const peerService = attributes['peer.service'] || dependencyName;
  return `(${spanFieldIn(HOST_FIELDS, host)} or ${spanFieldIn(['peer.service'], peerService)})`;
}

/**
 * Query for the most recent caller spans targeting a dependency node within the time range.
 * Restricted to outbound (CLIENT / PRODUCER / CONSUMER) spans.
 *
 * @param tracesIndex - Traces (span) index name
 * @param condition - Condition from buildDependencySpanCondition
 * @param startTime - Start time for filtering (Date or ISO string)
 * @param endTime - End time for filtering (Date or ISO string)
 * @param limit - Maximum rows
 * @returns PPL query string
 */
export function getQueryDependencySpans(
  tracesIndex: string,
  condition: string,
  startTime?: string | Date,
  endTime?: string | Date,
  limit = 50
): string {
  let query = `source=${tracesIndex}`;
  query += buildTimeFilterClause(startTime, endTime, 'startTime');
  query += ` | where (${DEPENDENCY_SPAN_KINDS.map((k) => `kind = '${k}'`).join(' or ')})`;
  query += ` | where ${condition} | sort - startTime | head ${limit}`;
  return query;
}
