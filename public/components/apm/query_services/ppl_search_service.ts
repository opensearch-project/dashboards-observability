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
} from './query_requests/ppl_queries';
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
  async listServices(params: ListServicesRequest): Promise<any> {
    const { queryIndex, startTime, endTime, dataset } = params;

    const pplQuery = getQueryListServices(queryIndex, startTime, endTime);

    const searchResponse = await this.executePPLQuery(pplQuery, dataset);

    // Transform the response
    const transformedResponse = ResponseProcessor.transformListServices(searchResponse);

    // Return the full transformed response including AvailableGroupByAttributes
    return transformedResponse;
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
  async listServiceOperations(params: ListServiceOperationsRequest): Promise<any> {
    const { queryIndex, startTime, endTime, keyAttributes, dataset } = params;

    const pplQuery = getQueryListServiceOperations(
      queryIndex,
      startTime,
      endTime,
      keyAttributes?.Environment,
      keyAttributes?.Name
    );

    const searchResponse = await this.executePPLQuery(pplQuery, dataset);

    // Transform the response
    return ResponseProcessor.transformListServiceOperations(searchResponse);
  }

  /**
   * List service dependencies for a given service
   */
  async listServiceDependencies(params: ListServiceDependenciesRequest): Promise<any> {
    const { queryIndex, startTime, endTime, keyAttributes, dataset } = params;

    const pplQuery = getQueryListServiceDependencies(
      queryIndex,
      startTime,
      endTime,
      keyAttributes?.Environment,
      keyAttributes?.Name
    );

    const searchResponse = await this.executePPLQuery(pplQuery, dataset);

    // Transform the response
    return ResponseProcessor.transformListServiceDependencies(searchResponse);
  }

  /**
   * Get service map (topology) data
   */
  async getServiceMap(params: GetServiceMapRequest): Promise<any> {
    const { queryIndex, startTime, endTime, dataset } = params;

    const pplQuery = getQueryGetServiceMap(queryIndex, startTime, endTime);

    const searchResponse = await this.executePPLQuery(pplQuery, dataset);

    // Transform the response
    return ResponseProcessor.transformGetServiceMap(searchResponse);
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
  async executeQuery(pplQuery: string, dataset: DatasetConfig): Promise<any> {
    return this.executePPLQuery(pplQuery, dataset);
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
  private async executePPLQuery(pplQuery: string, dataset: DatasetConfig): Promise<any> {
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
