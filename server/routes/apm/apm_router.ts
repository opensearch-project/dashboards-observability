/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { schema } from '@osd/config-schema';
import { CoreSetup, IRouter, Logger } from '../../../../../src/core/server';
import { DataPluginStart } from '../../../../../src/plugins/data/server';

/**
 * Register APM routes
 *
 * Provides server-side API endpoints for APM functionality including:
 * - PromQL queries (proxied through server to avoid auth issues)
 * - PPL queries (proxied through server for consistency)
 */
export function registerApmRoutes(router: IRouter, core: CoreSetup, logger: Logger) {
  /**
   * POST /api/apm/ppl/query
   *
   * Execute a PPL query through the server-side search service.
   * This uses the 'ppl' search strategy for proper query handling.
   *
   * Request body:
   * - query: PPL query string
   * - datasetId: Index/dataset identifier (e.g., 'otel-apm-service-map')
   * - opensearchDataSourceId: Optional OpenSearch datasource ID for routing
   */
  router.post(
    {
      path: '/api/apm/ppl/query',
      validate: {
        body: schema.object({
          query: schema.string(),
          datasetId: schema.string(),
          opensearchDataSourceId: schema.maybe(schema.string()),
        }),
      },
    },
    async (context, request, response) => {
      try {
        const { query, datasetId, opensearchDataSourceId } = request.body;

        logger.info(
          `[APM] PPL Query: ${query}, Dataset: ${datasetId}, Datasource: ${
            opensearchDataSourceId || 'default'
          }`
        );

        // Call OpenSearch PPL endpoint directly with proper authentication
        // The PPL search strategy is designed for client-side use only
        const client = opensearchDataSourceId
          ? context.dataSource.opensearch.legacy.getClient(opensearchDataSourceId).callAPI
          : context.core.opensearch.legacy.client.callAsCurrentUser;

        const pplResponse = await client('enhancements.pplQuery', {
          body: {
            query,
          },
        });

        logger.info('[APM] PPL Query executed successfully');

        // Convert datarows to row objects for response processor compatibility
        // PPL returns: { schema: [...], datarows: [[val1, val2], ...] }
        // We need: { schema, datarows, jsonData: [{col1: val1, col2: val2}, ...] }
        const jsonData =
          pplResponse.datarows?.map((row: any[]) => {
            const rowObject: Record<string, any> = {};
            pplResponse.schema.forEach((field: any, index: number) => {
              rowObject[field.name] = row[index];
            });
            return rowObject;
          }) || [];

        return response.ok({
          body: {
            ...pplResponse,
            jsonData, // Add jsonData for response processor
          },
        });
      } catch (error) {
        logger.error(`[APM] PPL Query error: ${error.message}`);
        return response.customError({
          statusCode: error.statusCode || 500,
          body: { message: error.message, stack: error.stack },
        });
      }
    }
  );

  /**
   * POST /api/apm/promql/query
   *
   * Execute a PromQL query through the server-side search service.
   * This avoids authentication issues by handling Prometheus queries server-side.
   *
   * Request body:
   * - query: PromQL query string
   * - prometheusConnectionName: Name of Prometheus connection in SQL plugin
   * - opensearchDataSourceId: Optional OpenSearch datasource ID for routing
   * - timeRange: { from, to } - Time range for query
   * - step: Optional step size for range queries
   */
  router.post(
    {
      path: '/api/apm/promql/query',
      validate: {
        body: schema.object({
          query: schema.string(),
          prometheusConnectionName: schema.string(),
          opensearchDataSourceId: schema.maybe(schema.string()),
          timeRange: schema.object({
            from: schema.string(),
            to: schema.string(),
          }),
          step: schema.maybe(schema.string()),
          queryType: schema.maybe(
            schema.oneOf([schema.literal('range'), schema.literal('instant')])
          ),
        }),
      },
    },
    async (context, request, response) => {
      try {
        const {
          query,
          prometheusConnectionName,
          opensearchDataSourceId,
          timeRange,
          step,
          queryType,
        } = request.body;

        logger.info(
          `[APM] PromQL Query: ${query}, Connection: ${prometheusConnectionName}, Datasource: ${
            opensearchDataSourceId || 'default'
          }`
        );

        // Get data plugin from start services
        const [, startDeps] = await core.getStartServices();
        const dataPlugin = (startDeps as any).data as DataPluginStart;

        if (!dataPlugin || !dataPlugin.search) {
          logger.error('[APM] Data plugin or search service not available');
          return response.customError({
            statusCode: 503,
            body: { message: 'Search service not available' },
          });
        }

        // Use data plugin search service with 'promql' strategy
        // The server-side search handles authentication via context
        const searchResponse = await dataPlugin.search.search(
          context,
          {
            dataSourceId: opensearchDataSourceId, // OpenSearch datasource ID for routing
            body: {
              query: {
                query,
                language: 'PromQL',
                dataset: { id: prometheusConnectionName, type: 'PROMETHEUS' },
              },
              timeRange,
              step,
              queryType: queryType || 'range', // Default to range query for backwards compatibility
            },
          },
          { strategy: 'promql' }
        );

        logger.info('[APM] PromQL Query executed successfully');

        return response.ok({
          body: searchResponse.rawResponse || searchResponse.body,
        });
      } catch (error) {
        logger.error(`[APM] PromQL Query error: ${error.message}`);
        return response.customError({
          statusCode: error.statusCode || 500,
          body: { message: error.message, stack: error.stack },
        });
      }
    }
  );
}
