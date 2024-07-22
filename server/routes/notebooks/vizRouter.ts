/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RequestParams } from '@elastic/elasticsearch';
import { schema } from '@osd/config-schema';
import {
  IOpenSearchDashboardsResponse,
  IRouter,
  ResponseError,
} from '../../../../../src/core/server';
import { NOTEBOOKS_API_PREFIX, NOTEBOOKS_FETCH_SIZE } from '../../../common/constants/notebooks';

export function registerVizRoute(router: IRouter, dataSourceEnabled: boolean) {
  // Fetches available saved visualizations for current user
  router.get(
    {
      path: `${NOTEBOOKS_API_PREFIX}/visualizations/{dataSourceMDSId?}`,
      validate: {
        params: schema.object({
          dataSourceMDSId: schema.maybe(schema.string({ defaultValue: '' })),
        }),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      const params: RequestParams.Search = {
        index: '.kibana',
        size: NOTEBOOKS_FETCH_SIZE,
        q: 'type:visualization',
      };
      try {
        let opensearchClientResponse;
        if (dataSourceEnabled && request.params.dataSourceMDSId) {
          const client = await context.dataSource.opensearch.legacy.getClient(
            request.params.dataSourceMDSId
          );
          opensearchClientResponse = await client.callAPI('search', params);
        } else {
          opensearchClientResponse = await context.core.opensearch.legacy.client.callAsCurrentUser(
            'search',
            params
          );
        }
        const savedVisualizations = opensearchClientResponse.hits.hits;
        const vizResponse = savedVisualizations.map((vizDocument) => ({
          label: vizDocument._source.visualization.title,
          key: vizDocument._id.split(':').pop(),
        }));
        return response.ok({
          body: { savedVisualizations: vizResponse },
        });
      } catch (error) {
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );
}
