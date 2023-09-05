/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { schema } from '@osd/config-schema';
import { IRouter } from '../../../../../src/core/server';
import { DATASOURCES_BASE } from '../../../common/constants/shared';

export function registerDatasourcesRoute(router: IRouter) {
  router.get(
    {
      path: `${DATASOURCES_BASE}/{name}`,
      validate: {
        params: schema.object({
          name: schema.string(),
        }),
      },
    },
    async (context, request, response): Promise<any> => {
      try {
        const dataSourcesresponse = await context.observability_plugin.observabilityClient
          .asScoped(request)
          .callAsCurrentUser('observability.getDatasourceById', {
            datasource: request.params.name,
          });
        return response.ok({
          body: dataSourcesresponse,
        });
      } catch (error: any) {
        console.error('Issue in fetching datasource:', error);
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );
}
