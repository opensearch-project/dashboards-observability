/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getQueryListServices,
  getQueryGetService,
  getQueryListServiceOperations,
  getQueryListServiceDependencies,
  getQueryGetServiceMap,
  getQueryDistinctEdgeCount,
  getQueryServiceMapEnvironmentSizes,
  getQueryServiceMapNodes,
  getQueryServiceMapFields,
  getQueryServiceMapSlice,
  getQuerySliceDistinctEdgeCount,
  getQueryServiceMapSliceEdges,
  ServiceMapSide,
  ServiceMapSliceFilter,
  DEFAULT_ROW_LIMIT,
} from './query_requests/ppl_queries';
import { APPLICATION_MAP_CONSTANTS } from '../common/constants';
import { ResponseProcessor } from './query_requests/response_processor';
import { coreRefs } from '../../../framework/core_refs';
import {
  ListServicesRequest,
  GetServiceRequest,
  ListServiceOperationsRequest,
  ListServiceDependenciesRequest,
  GetServiceMapRequest,
  DatasetConfig,
} from '../common/types/apm_types';

/**
 * PPLSearchService - Frontend service for executing PPL queries
 *
 * This service makes direct HTTP calls to the query enhancements PPL API.
 * Browser-based HTTP requests include authentication cookies automatically.
 *
 * Pattern: React Component → PPLSearchService → HTTP POST → Query Enhancements API → OpenSearch PPL
 *
 * Each method receives the dataset configuration which includes the OpenSearch
 * datasource ID for multi-datasource routing (empty means local cluster).
 */
export class PPLSearchService {
  constructor() {}

  /**
   * List all services in the time range
   */
  async listServices(params: ListServicesRequest, signal?: AbortSignal): Promise<any> {
    const { queryIndex, startTime, endTime, dataset } = params;

    const {
      response: searchResponse,
      truncated,
      partialError,
    } = await this.executePagedEdgeQuery(
      (offset) => getQueryListServices(queryIndex, startTime, endTime, offset),
      dataset,
      signal,
      getQueryDistinctEdgeCount(queryIndex, startTime, endTime)
    );

    // The full transformed response including AvailableGroupByAttributes, plus whether the
    // catalog is partial (page cap reached, or a later page failed).
    return {
      ...ResponseProcessor.transformListServices(searchResponse),
      truncated,
      partialError,
    };
  }

  /**
   * Get service details by keyAttributes
   */
  async getService(params: GetServiceRequest): Promise<any> {
    const { queryIndex, startTime, endTime, keyAttributes, dataset } = params;

    const pplQuery = getQueryGetService(
      queryIndex,
      startTime,
      endTime,
      keyAttributes?.Environment,
      keyAttributes?.Name
    );

    const searchResponse = await this.executePPLQuery(pplQuery, dataset);

    // Transform the response
    return ResponseProcessor.transformGetService(searchResponse);
  }

  /**
   * List service operations for a given service
   */
  async listServiceOperations(
    params: ListServiceOperationsRequest,
    signal?: AbortSignal
  ): Promise<any> {
    const { queryIndex, startTime, endTime, keyAttributes, dataset } = params;

    const pplQuery = getQueryListServiceOperations(
      queryIndex,
      startTime,
      endTime,
      keyAttributes?.Environment,
      keyAttributes?.Name
    );

    const searchResponse = await this.executePPLQuery(pplQuery, dataset, signal);

    // Transform the response
    return ResponseProcessor.transformListServiceOperations(searchResponse);
  }

  /**
   * List service dependencies for a given service
   */
  async listServiceDependencies(
    params: ListServiceDependenciesRequest,
    signal?: AbortSignal
  ): Promise<any> {
    const { queryIndex, startTime, endTime, keyAttributes, dataset } = params;

    const pplQuery = getQueryListServiceDependencies(
      queryIndex,
      startTime,
      endTime,
      keyAttributes?.Environment,
      keyAttributes?.Name
    );

    const searchResponse = await this.executePPLQuery(pplQuery, dataset, signal);

    // Transform the response
    return ResponseProcessor.transformListServiceDependencies(searchResponse);
  }

  /**
   * Get service map (topology) data
   */
  async getServiceMap(params: GetServiceMapRequest, signal?: AbortSignal): Promise<any> {
    const { queryIndex, startTime, endTime, dataset } = params;

    const {
      response: searchResponse,
      truncated,
      partialError,
    } = await this.executePagedEdgeQuery(
      (offset) => getQueryGetServiceMap(queryIndex, startTime, endTime, offset),
      dataset,
      signal,
      getQueryDistinctEdgeCount(queryIndex, startTime, endTime)
    );

    // `truncated`: connections are missing (page cap reached, or a later page failed), so the
    // UI should say so.
    return {
      ...ResponseProcessor.transformGetServiceMap(searchResponse),
      truncated,
      partialError,
    };
  }

  /**
   * The overview of a large map: every node (a node-list aggregation per side; where the engine
   * caps it at AGGREGATION_BUCKET_CAP, nodes per environment and then batches of environments
   * under the cap) and the group-by attribute keys (from the mapping). `groupByAttribute` adds that attribute's value to each node, for
   * grouping the overview by it. `truncated` when an aggregation may have been cut at
   * AGGREGATION_BUCKET_CAP (a single environment with more nodes, on the 2.x engine).
   */
  async getServiceMapOverview(
    params: GetServiceMapRequest & { groupByAttribute?: string },
    signal?: AbortSignal
  ): Promise<{
    Nodes: any[];
    AvailableGroupByAttributes: Record<string, string[]>;
    truncated: boolean;
  }> {
    const { queryIndex, startTime, endTime, dataset, groupByAttribute } = params;
    const run = (q: string) => this.executePPLQuery(q, dataset, signal);
    const { AGGREGATION_BUCKET_CAP: cap } = APPLICATION_MAP_CONSTANTS;
    let truncated = false;

    const nodeQuery = (side: ServiceMapSide, environments?: Array<string | null>) =>
      run(
        getQueryServiceMapNodes(
          queryIndex,
          side,
          startTime,
          endTime,
          groupByAttribute,
          environments
        )
      );
    // One aggregation per side first: complete unless it returns exactly the 2.x bucket cap
    // (fewer rows is everything; more means the engine has no cap). At the cap, batch by
    // environment instead.
    const sideParts = async (side: ServiceMapSide) => {
      const whole = await nodeQuery(side);
      if ((whole?.jsonData ?? []).length !== cap) return [whole];
      return batchedParts(side);
    };
    const batchedParts = async (side: ServiceMapSide) => {
      const n = `${side}Node`;
      const sizes = await run(
        getQueryServiceMapEnvironmentSizes(queryIndex, side, startTime, endTime)
      );
      const sizeRows: Array<Record<string, any>> = sizes?.jsonData ?? [];
      if (sizeRows.length >= cap) truncated = true;
      const batches = packEnvironments(
        sizeRows.map((r) => ({
          environment: r[`${n}.keyAttributes.environment`] ?? null,
          nodes: Number(r.nodes) || 0,
        }))
      );
      return runPool(
        batches.map((environments) => () => nodeQuery(side, environments)),
        APPLICATION_MAP_CONSTANTS.MAX_CONCURRENT_AGGREGATIONS,
        signal
      );
    };
    const sideRows = async (side: ServiceMapSide) => {
      const n = `${side}Node`;
      const parts = await sideParts(side);
      return parts.flatMap((part) => {
        const rows: Array<Record<string, any>> = part?.jsonData ?? [];
        if (rows.length === cap) truncated = true;
        return rows.map((row) => {
          const value = groupByAttribute
            ? row[`${n}.groupByAttributes.${groupByAttribute}`]
            : undefined;
          // A node-list row in the shape of a service-map row (one side set), so the map
          // transform builds the same node objects as for a full topology.
          return {
            [`${n}.keyAttributes`]: {
              name: row[`${n}.keyAttributes.name`],
              environment: row[`${n}.keyAttributes.environment`],
            },
            [`${n}.type`]: row[`${n}.type`],
            [`${n}.groupByAttributes`]:
              groupByAttribute && value !== null && value !== undefined
                ? nestAttribute(groupByAttribute, value)
                : {},
          };
        });
      });
    };

    const [sources, targets, fields] = await Promise.all([
      sideRows('source'),
      sideRows('target'),
      run(getQueryServiceMapFields(queryIndex)),
    ]);
    const { Nodes } = ResponseProcessor.transformGetServiceMap({
      jsonData: [...sources, ...targets],
    } as any);
    return {
      Nodes: Nodes ?? [],
      AvailableGroupByAttributes: groupByAttributeKeys(
        (fields?.jsonData ?? []).map((r: Record<string, unknown>) => String(r.COLUMN_NAME ?? ''))
      ),
      truncated,
    };
  }

  /**
   * The exact topology of a slice of a large map: the connections whose source or target is in
   * an environment, has a group-by attribute value, or is one of some names.
   *
   * First the paged dedup with its distinct-connection check, like getServiceMap: on 3.x it is
   * exact and the cheapest read (~0.3s; the aggregation below costs ~1.6s cold on a 3-day
   * range). On 2.x the dedup only sees the first `plugins.query.size_limit` raw documents, so it
   * comes back short of the count; then the slice is read as an aggregation instead
   * (getServiceMapSliceAggregated), which every document counts toward.
   */
  async getServiceMapSlice(
    params: GetServiceMapRequest,
    filter: ServiceMapSliceFilter,
    signal?: AbortSignal,
    names?: string[]
  ): Promise<any> {
    const { queryIndex, startTime, endTime, dataset } = params;
    const paged = await this.executePagedEdgeQuery(
      (offset) => getQueryServiceMapSlice(queryIndex, filter, startTime, endTime, offset),
      dataset,
      signal,
      getQuerySliceDistinctEdgeCount(queryIndex, filter, startTime, endTime)
    );
    if (!paged.truncated) {
      return { ...ResponseProcessor.transformGetServiceMap(paged.response), truncated: false };
    }
    return this.getServiceMapSliceAggregated(params, filter, signal, names);
  }

  /**
   * A slice's connections as an aggregation over both ends' keys (exact on any engine). A
   * result at AGGREGATION_BUCKET_CAP (the 2.x engine's limit) is re-read in name chunks of
   * `names` (the slice's own node names), once per side; `truncated` if a chunk still reaches
   * the cap, or the slice reached it without `names`.
   */
  async getServiceMapSliceAggregated(
    params: GetServiceMapRequest,
    filter: ServiceMapSliceFilter,
    signal?: AbortSignal,
    names?: string[]
  ): Promise<any> {
    const { queryIndex, startTime, endTime, dataset } = params;
    const { AGGREGATION_BUCKET_CAP: cap, NAME_CHUNK_SIZE } = APPLICATION_MAP_CONSTANTS;
    const run = (chunk?: { side: ServiceMapSide; names: string[] }) =>
      this.executePPLQuery(
        getQueryServiceMapSliceEdges(queryIndex, filter, startTime, endTime, chunk),
        dataset,
        signal
      ).then((r) => (r?.jsonData ?? []) as Array<Record<string, any>>);

    let rows = await run();
    let truncated = false;
    if (rows.length === cap) {
      if (!names?.length) {
        truncated = true;
      } else {
        const chunks: Array<{ side: ServiceMapSide; names: string[] }> = [];
        for (let i = 0; i < names.length; i += NAME_CHUNK_SIZE) {
          const part = names.slice(i, i + NAME_CHUNK_SIZE);
          chunks.push({ side: 'source', names: part }, { side: 'target', names: part });
        }
        const parts = await runPool(
          chunks.map((chunk) => () => run(chunk)),
          APPLICATION_MAP_CONSTANTS.MAX_CONCURRENT_AGGREGATIONS,
          signal
        );
        truncated = parts.some((p) => p.length === cap);
        rows = parts.flat();
      }
    }
    // Connection rows in the shape of service-map rows; the transform dedupes nodes and edges.
    const jsonData = rows.map((row) => ({
      'sourceNode.keyAttributes': {
        name: row['sourceNode.keyAttributes.name'],
        environment: row['sourceNode.keyAttributes.environment'],
      },
      'sourceNode.type': row['sourceNode.type'],
      'sourceNode.groupByAttributes': {},
      ...(row['targetNode.keyAttributes.name'] != null && {
        'targetNode.keyAttributes': {
          name: row['targetNode.keyAttributes.name'],
          environment: row['targetNode.keyAttributes.environment'],
        },
        'targetNode.type': row['targetNode.type'],
        'targetNode.groupByAttributes': {},
      }),
    }));
    return { ...ResponseProcessor.transformGetServiceMap({ jsonData } as any), truncated };
  }

  /**
   * Run a paged edge query (`head DEFAULT_ROW_LIMIT from <offset>`) page by page until a page
   * comes back short or APPLICATION_MAP_CONSTANTS.MAX_EDGE_PAGES is reached, and merge the rows into one response.
   * Pages run sequentially: each is a full dedup over the time range, so running them in
   * parallel would multiply the cluster load for the common single-page case.
   *
   * A failure after the first page keeps the rows already loaded and reports the result as
   * truncated (with the error), rather than discarding thousands of connections; an abort
   * (superseded time range, unmount) always rethrows.
   *
   * `countQuery` (a distinct-connection count, run alongside the first page) catches results the
   * engine cut short without a full page: on the 2.x PPL engine `dedup` only sees the first
   * `plugins.query.size_limit` raw documents. Paged rows clearly below the (approximate) count
   * mark the result truncated.
   */
  private async executePagedEdgeQuery(
    buildQuery: (offset: number) => string,
    dataset: DatasetConfig,
    signal?: AbortSignal,
    countQuery?: string
  ): Promise<{ response: any; truncated: boolean; partialError?: Error }> {
    const rows: Array<Record<string, any>> = [];
    let first: any;
    // The count is a hint: if it fails, paging alone decides.
    const expected = countQuery
      ? this.executePPLQuery(countQuery, dataset, signal)
          .then((r) => Number(r?.jsonData?.[0]?.edges))
          .catch(() => NaN)
      : Promise.resolve(NaN);
    for (let page = 0; page < APPLICATION_MAP_CONSTANTS.MAX_EDGE_PAGES; page++) {
      let response: any;
      try {
        response = await this.executePPLQuery(
          buildQuery(page * DEFAULT_ROW_LIMIT),
          dataset,
          signal
        );
      } catch (err) {
        if (page === 0 || signal?.aborted) throw err;
        return {
          response: { ...first, jsonData: rows, size: rows.length },
          truncated: true,
          partialError: err instanceof Error ? err : new Error('Unknown error'),
        };
      }
      if (page === 0) first = response;
      const pageRows: Array<Record<string, any>> = response?.jsonData ?? [];
      rows.push(...pageRows);
      const pageSize = response?.size ?? pageRows.length;
      if (pageSize < DEFAULT_ROW_LIMIT) {
        const count = await expected;
        return {
          response: page === 0 ? response : { ...first, jsonData: rows, size: rows.length },
          truncated: isShortOfCount(rows.length, count),
        };
      }
    }
    return { response: { ...first, jsonData: rows, size: rows.length }, truncated: true };
  }

  /**
   * Execute an arbitrary PPL query
   *
   * Public method to execute any PPL query. Useful for custom queries
   * that don't fit the predefined methods.
   *
   * @param pplQuery The PPL query string
   * @param dataset The dataset configuration
   */
  async executeQuery(pplQuery: string, dataset: DatasetConfig, signal?: AbortSignal): Promise<any> {
    return this.executePPLQuery(pplQuery, dataset, signal);
  }

  /**
   * Transform the new API response format to expected format
   *
   * New format uses fields array where each field has values array:
   * { fields: [{name, values: [...]}, ...], size: N }
   *
   * Expected format: { jsonData: [{field1: val, ...}, ...] }
   */
  private transformResponse(response: any): any {
    const body = response.body || response;

    // New format uses fields array where each field has values array
    if (body.fields && Array.isArray(body.fields)) {
      const size = body.size || 0;
      const jsonData: Array<Record<string, any>> = [];

      for (let i = 0; i < size; i++) {
        const row: Record<string, any> = {};
        body.fields.forEach((field: any) => {
          row[field.name] = field.values?.[i];
        });
        jsonData.push(row);
      }

      return {
        schema: body.schema,
        jsonData,
        size,
      };
    }

    // Fallback for old format (datarows)
    if (body.datarows && Array.isArray(body.datarows)) {
      const jsonData =
        body.datarows.map((row: any[]) => {
          const rowObject: Record<string, any> = {};
          body.schema?.forEach((field: any, index: number) => {
            rowObject[field.name] = row[index];
          });
          return rowObject;
        }) || [];

      return {
        ...body,
        jsonData,
      };
    }

    return body;
  }

  /**
   * Execute a PPL query via query enhancements API
   *
   * This method makes a direct HTTP call to the query enhancements PPL API.
   * Browser session cookies provide authentication automatically.
   *
   * @param pplQuery The PPL query string
   * @param dataset The dataset configuration with id, title, and optional dataSource
   */
  private async executePPLQuery(
    pplQuery: string,
    dataset: DatasetConfig,
    signal?: AbortSignal
  ): Promise<any> {
    // Build request body matching query enhancements API format
    const requestBody = {
      query: {
        query: pplQuery,
        language: 'PPL',
        dataset: {
          id: dataset.id,
          title: dataset.title,
          type: 'INDEXES',
          ...(dataset.dataSource && { dataSource: dataset.dataSource }),
        },
        format: 'jdbc',
      },
    };

    try {
      // Call query enhancements API directly - includes auth from browser session
      const response = await coreRefs.http!.post('/api/enhancements/search/ppl', {
        body: JSON.stringify(requestBody),
        ...(signal && { signal }),
      });

      // Transform response to expected format with jsonData
      return this.transformResponse(response);
    } catch (error) {
      console.error('[PPLSearchService] Query execution failed:', error);

      // Handle index not found / unauthorized errors more gracefully
      if (
        error.message?.includes('Unauthorized') ||
        error.message?.includes('index_not_found_exception') ||
        error.message?.includes('no such index')
      ) {
        console.warn(
          '[PPLSearchService] Index may not exist or user lacks permissions. Returning empty result.'
        );
        return {
          schema: [],
          jsonData: [],
          size: 0,
        };
      }

      throw error;
    }
  }
}

/** `a.b.c` = v as `{ a: { b: { c: v } } }`, the shape of groupByAttributes in service-map docs. */
function nestAttribute(path: string, value: unknown): Record<string, unknown> {
  return path
    .split('.')
    .reverse()
    .reduce<unknown>((inner, key) => ({ [key]: inner }), value) as Record<string, unknown>;
}

/**
 * Whether paged rows fall short of a distinct-connection count: any shortfall below
 * EDGE_COUNT_EXACT_BELOW (where `distinct_count` is exact), else a margin for the approximation.
 */
export function isShortOfCount(rows: number, count: number): boolean {
  if (!Number.isFinite(count)) return false;
  const { EDGE_COUNT_EXACT_BELOW, EDGE_COUNT_TOLERANCE } = APPLICATION_MAP_CONSTANTS;
  return count < EDGE_COUNT_EXACT_BELOW ? rows < count : rows < count * EDGE_COUNT_TOLERANCE;
}

/**
 * Environments (with their approximate node counts) packed into node-list batches of at most
 * NODE_LIST_BATCH_NODES nodes; an environment larger than that gets a batch of its own.
 */
export function packEnvironments(
  sizes: Array<{ environment: string | null; nodes: number }>
): Array<Array<string | null>> {
  const limit = APPLICATION_MAP_CONSTANTS.NODE_LIST_BATCH_NODES;
  const batches: Array<Array<string | null>> = [];
  let current: Array<string | null> = [];
  let total = 0;
  [...sizes]
    .sort((a, b) => b.nodes - a.nodes)
    .forEach(({ environment, nodes }) => {
      if (current.length > 0 && total + nodes > limit) {
        batches.push(current);
        current = [];
        total = 0;
      }
      current.push(environment);
      total += nodes;
    });
  if (current.length > 0) batches.push(current);
  return batches;
}

/** Leaf `<side>Node.groupByAttributes.<key>` fields of a mapping, as group-by attribute keys. */
export function groupByAttributeKeys(columns: string[]): Record<string, string[]> {
  const keys = new Set<string>();
  columns.forEach((column) => {
    const match = /^(?:source|target)Node\.groupByAttributes\.(.+)$/.exec(column);
    if (match) keys.add(match[1]);
  });
  // Object fields are listed too (`telemetry`, `telemetry.sdk`); only leaves are attributes.
  const leaves = Array.from(keys).filter(
    (key) => !Array.from(keys).some((other) => other.startsWith(`${key}.`))
  );
  return Object.fromEntries(leaves.sort().map((key) => [key, [] as string[]]));
}

/** Run tasks with at most `limit` in flight; rejects on the first failure or an abort. */
async function runPool<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
  signal?: AbortSignal
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (next < tasks.length && !failed) {
      if (signal?.aborted) throw new Error('Aborted');
      const index = next++;
      try {
        results[index] = await tasks[index]();
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}
