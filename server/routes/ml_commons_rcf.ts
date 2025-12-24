/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { schema } from '@osd/config-schema';
import { IRouter, IOpenSearchDashboardsResponse, ResponseError, RequestHandlerContext, OpenSearchDashboardsRequest, OpenSearchDashboardsResponseFactory } from '../../../../src/core/server';
import { MLCommonsRCFFacet } from '../services/facets/ml_commons_rcf_facet';

/**
 * Register ML Commons RCF API routes
 * Provides RESTful interface for anomaly detection operations
 */
export function registerMLCommonsRCFRoute({ 
  router, 
  facet 
}: { 
  router: IRouter; 
  facet: MLCommonsRCFFacet 
}) {
  router.post(
    {
      path: '/api/observability/ml-commons/rcf/predict',
      validate: {
        body: schema.object({
          // Time series data for anomaly detection
          data: schema.arrayOf(schema.object({
            timestamp: schema.string(),
            category: schema.maybe(schema.string()),
            value: schema.number(),
          })),
          // RCF algorithm parameters
          parameters: schema.object({
            number_of_trees: schema.maybe(schema.number({ defaultValue: 100 })),
            shingle_size: schema.maybe(schema.number({ defaultValue: 8 })),
            sample_size: schema.maybe(schema.number({ defaultValue: 256 })),
            output_after: schema.maybe(schema.number({ defaultValue: 32 })),
            time_decay: schema.maybe(schema.number({ defaultValue: 0.0001 })),
            anomaly_rate: schema.maybe(schema.number({ defaultValue: 0.005 })),
            time_field: schema.string({ defaultValue: 'timestamp' }),
            category_field: schema.maybe(schema.string()),
          }),
        }),
        query: schema.object({
          // Multi-data source support
          dataSourceMDSId: schema.maybe(schema.string({ defaultValue: '' })),
        }),
      },
    },
    async (
      context: RequestHandlerContext, 
      req: OpenSearchDashboardsRequest, 
      res: OpenSearchDashboardsResponseFactory
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      try {
        const result = await facet.predictAnomalies(context, req);
        
        if (result.success) {
          return res.ok({ 
            body: result.data,
            headers: {
              'content-type': 'application/json',
            },
          });
        }
        
        return res.custom({
          statusCode: 400,
          body: {
            error: 'RCF anomaly detection failed',
            details: result.data?.metadata?.error || 'Unknown error occurred',
          },
        });
      } catch (error) {
        console.error('ML Commons RCF route error:', error);
        return res.custom({
          statusCode: 500,
          body: {
            error: 'Internal server error',
            message: error.message,
          },
        });
      }
    }
  );
}