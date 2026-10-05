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
 * Query for the type of the node with this name (and environment, when given), read from a
 * service-map document where it is the target: dependencies only ever appear as targets,
 * and a service that is never a target is a root service. Not time-bounded, so an old link
 * still resolves.
 */
export function getQueryNodeType(queryIndex: string, name: string, environment?: string): string {
  let query = `source=${queryIndex}`;
  query += ` | where targetNode.keyAttributes.name = '${escapePPLString(name)}'`;
  if (environment) {
    query += ` and targetNode.keyAttributes.environment = '${escapePPLString(environment)}'`;
  }
  query += ` | head 1 | fields targetNode.type`;
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

// Span attribute keys (semconv plus the flattened variants seen in OTel data) that
// data-prepper reads when it names a dependency node, including the legacy keys
// `db.system` and `messaging.destination`. Only the keys mapped in the span index are
// queried (see buildDependencySpanCondition): PPL rejects a path below a mapped
// keyword (`db.system.name` where `db.system` is a keyword), and an unmapped key below a
// mapped object turns the whole filter, time range included, into a script.
const DB_SYSTEM_FIELDS = ['db.system.name', 'db_system_name', 'db_system', 'db.system'];
const MESSAGING_DESTINATION_FIELDS = ['messaging.destination.name', 'messaging.destination'];
// Keys queried when the span mapping is unknown: the current semconv keys only, since
// the legacy keys fail the query wherever their `.name` children are mapped.
const LEGACY_FIELDS = new Set(['db.system', 'messaging.destination']);
// Only the callers' outbound spans target a dependency; a SERVER span's server.address is
// its own listener, so it must not match an external dependency's host.
const DEPENDENCY_SPAN_KINDS = ['SPAN_KIND_CLIENT', 'SPAN_KIND_PRODUCER', 'SPAN_KIND_CONSUMER'];
// Same keys and order data-prepper reads the dependency host from.
const HOST_FIELDS = ['server.address', 'net.peer.name', 'network.peer.address'];
const DB_NAMESPACE_FIELDS = ['db.namespace', 'db.name'];
// Columns the Spans table reads; projecting them avoids returning every span's attributes,
// resource, events and links.
const DEPENDENCY_SPAN_COLUMNS = [
  'spanId',
  'serviceName',
  'name',
  'durationInNanos',
  'status.code',
  'startTime',
];

// A condition is built as `where` stages, each a flat expression: an OR of comparisons, or
// an AND of isnull checks. Stages are ANDed by chaining. Parentheses are avoided because
// the OpenSearch 2.x PPL grammar cannot parse a parenthesized comparison
// (`where (a = 'x' or b = 'x')`). A stage is NEVER when no span can match (none of its
// keys is mapped) and ALWAYS when it constrains nothing (isnull over unmapped keys).
const NEVER = Symbol('never');
const ALWAYS = Symbol('always');
type Stage = string | typeof NEVER | typeof ALWAYS;

const whereStages = (...stages: Stage[]): string[] | null => {
  if (stages.includes(NEVER)) return null;
  const exprs = stages.filter((p): p is string => typeof p === 'string');
  // A condition that would match every outbound span never identifies one dependency.
  return exprs.length ? exprs : null;
};

/**
 * Build the PPL `where` stages selecting the callers' spans that target a dependency node.
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
 * @param options.mappedFields - Field names mapped in the span index (see
 *   getMappedFieldNames). Only these keys are queried, so the condition never references
 *   an unmapped or invalid path; a key that is not mapped holds no value. When omitted,
 *   the current semconv keys are queried and the legacy ones skipped.
 * @returns Conditions to apply as successive `where` stages, or null when no span can match
 */
export function buildDependencySpanCondition(
  nodeType: string,
  dependencyName: string,
  attributes: Record<string, string> = {},
  options: { mappedFields?: ReadonlySet<string> } = {}
): string[] | null {
  if (!dependencyName) return null;
  const { mappedFields } = options;
  const usable = (fields: string[]) =>
    fields.filter((f) =>
      mappedFields ? mappedFields.has(`attributes.${f}`) : !LEGACY_FIELDS.has(f)
    );
  const comparisons = (fields: string[], value: string) =>
    usable(fields).map((f) => `attributes.${f} = '${escapePPLString(value)}'`);
  // Any of the comparisons (an empty list cannot match).
  const anyOf = (...lists: string[][]): Stage => {
    const all = lists.flat();
    return all.length ? all.join(' or ') : NEVER;
  };
  const fieldIn = (fields: string[], value: string): Stage => anyOf(comparisons(fields, value));
  // None of the keys holds a value (unmapped keys hold none).
  const fieldsNull = (fields: string[]): Stage => {
    const keys = usable(fields);
    return keys.length ? keys.map((f) => `isnull(attributes.${f})`).join(' and ') : ALWAYS;
  };

  const type = (nodeType || '').toLowerCase();
  const sep = dependencyName.indexOf(':');
  const namePrefix = sep >= 0 ? dependencyName.slice(0, sep) : dependencyName;
  const nameSuffix = sep >= 0 ? dependencyName.slice(sep + 1) : '';
  const hasPortSuffix = /^\d+$/.test(nameSuffix);

  if (type === 'messaging') {
    const destination = attributes['messaging.destination.name'] || nameSuffix || dependencyName;
    const system = attributes['messaging.system'] || (nameSuffix ? namePrefix : '');
    return whereStages(
      fieldIn(MESSAGING_DESTINATION_FIELDS, destination),
      system ? fieldIn(['messaging.system'], system) : ALWAYS
    );
  }

  if (type === 'database') {
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
    const systemStage = system ? fieldIn(DB_SYSTEM_FIELDS, system) : ALWAYS;
    if (host) return whereStages(systemStage, fieldIn(HOST_FIELDS, host));
    if (hostOrNamespace) {
      return whereStages(
        systemStage,
        fieldIn([...HOST_FIELDS, ...DB_NAMESPACE_FIELDS], hostOrNamespace)
      );
    }
    if (namespace) {
      return whereStages(
        systemStage,
        fieldsNull(HOST_FIELDS),
        fieldIn(DB_NAMESPACE_FIELDS, namespace)
      );
    }
    return whereStages(systemStage, fieldsNull(HOST_FIELDS), fieldsNull(DB_NAMESPACE_FIELDS));
  }

  // external
  const host = attributes['server.address'] || (hasPortSuffix ? namePrefix : dependencyName);
  const peerService = attributes['peer.service'] || dependencyName;
  return whereStages(
    anyOf(comparisons(HOST_FIELDS, host), comparisons(['peer.service'], peerService))
  );
}

/**
 * Query for the most recent caller spans targeting a dependency node within the time range.
 * Restricted to outbound (CLIENT / PRODUCER / CONSUMER) spans.
 *
 * @param tracesIndex - Traces (span) index name
 * @param conditions - `where` stages from buildDependencySpanCondition
 * @param startTime - Start time for filtering (Date or ISO string)
 * @param endTime - End time for filtering (Date or ISO string)
 * @param limit - Maximum rows
 * @returns PPL query string
 */
export function getQueryDependencySpans(
  tracesIndex: string,
  conditions: string[],
  startTime?: string | Date,
  endTime?: string | Date,
  limit = 50
): string {
  let query = `source=${tracesIndex}`;
  query += buildTimeFilterClause(startTime, endTime, 'startTime');
  query += ` | where ${DEPENDENCY_SPAN_KINDS.map((k) => `kind = '${k}'`).join(' or ')}`;
  conditions.forEach((condition) => {
    query += ` | where ${condition}`;
  });
  query += ` | sort - startTime | head ${limit}`;
  query += ` | fields ${DEPENDENCY_SPAN_COLUMNS.join(', ')}`;
  return query;
}
