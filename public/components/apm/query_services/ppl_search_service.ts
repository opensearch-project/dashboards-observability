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
  getQueryServiceMapNodes,
  getQueryGroupByAttributeSample,
  getQueryServiceMapSlice,
  getQuerySliceDistinctEdgeCount,
  ServiceMapSide,
  ServiceMapSliceFilter,
  DEFAULT_ROW_LIMIT,
} from './query_requests/ppl_queries';
import { APPLICATION_MAP_CONSTANTS } from '../common/constants';

/** Paged rows below this share of the distinct-connection count mean the result was cut short. */
const EDGE_COUNT_TOLERANCE = 0.97;
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
   * Overview of a large map without reading its topology: every node (from two node-list
   * aggregations, one per connection side) and the
   * attributes the map can group by (from a sample). `groupByAttribute` adds that attribute's
   * value to each node, for grouping the overview by it.
   */
  async getServiceMapOverview(
    params: GetServiceMapRequest & { groupByAttribute?: string },
    signal?: AbortSignal
  ): Promise<{
    Nodes: any[];
    AvailableGroupByAttributes: Record<string, string[]>;
  }> {
    const { queryIndex, startTime, endTime, dataset, groupByAttribute } = params;
    const run = (q: string) => this.executePPLQuery(q, dataset, signal);
    const [sources, targets, sample] = await Promise.all([
      run(getQueryServiceMapNodes(queryIndex, 'source', startTime, endTime, groupByAttribute)),
      run(getQueryServiceMapNodes(queryIndex, 'target', startTime, endTime, groupByAttribute)),
      run(getQueryGroupByAttributeSample(queryIndex, startTime, endTime)),
    ]);

    // Node-list rows in the shape of service-map rows (one side set), so the map transform
    // builds the same node objects as for a full topology.
    const asRows = (response: any, side: ServiceMapSide) =>
      (response?.jsonData ?? []).map((row: Record<string, any>) => {
        const n = `${side}Node`;
        const value = groupByAttribute
          ? row[`${n}.groupByAttributes.${groupByAttribute}`]
          : undefined;
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
    const { Nodes } = ResponseProcessor.transformGetServiceMap({
      jsonData: [...asRows(sources, 'source'), ...asRows(targets, 'target')],
    } as any);
    const { AvailableGroupByAttributes } = ResponseProcessor.transformGetServiceMap(sample);
    return {
      Nodes: Nodes ?? [],
      AvailableGroupByAttributes: AvailableGroupByAttributes ?? {},
    };
  }

  /**
   * The exact topology of a slice of a large map: the connections whose source or target is in
   * an environment, has a group-by attribute value, or is one of some names (a neighborhood).
   * Paged and truncation-checked like getServiceMap.
   */
  async getServiceMapSlice(
    params: GetServiceMapRequest,
    filter: ServiceMapSliceFilter,
    signal?: AbortSignal
  ): Promise<any> {
    const { queryIndex, startTime, endTime, dataset } = params;
    const { response, truncated, partialError } = await this.executePagedEdgeQuery(
      (offset) => getQueryServiceMapSlice(queryIndex, filter, startTime, endTime, offset),
      dataset,
      signal,
      getQuerySliceDistinctEdgeCount(queryIndex, filter, startTime, endTime)
    );
    return { ...ResponseProcessor.transformGetServiceMap(response), truncated, partialError };
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
          // distinct_count is approximate (within ~1% in testing), so allow a margin.
          truncated: Number.isFinite(count) && rows.length < count * EDGE_COUNT_TOLERANCE,
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
