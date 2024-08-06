/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { schema } from '@osd/config-schema';
import {
  IOpenSearchDashboardsResponse,
  IRouter,
  ResponseError,
} from '../../../../../src/core/server';
import { QueryService } from '../../services/queryService';

export function registerSqlRoute(
  server: IRouter,
  service: QueryService,
  _dataSourceEnabled: boolean
) {
  server.post(
    {
      path: '/api/sql/sqlquery',
      validate: {
        body: schema.any(),
        query: schema.object({
          dataSourceMDSId: schema.maybe(schema.string({ defaultValue: '' })),
        }),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      const retVal = await service.describeSQLQuery(context, request);
      return response.ok({
        body: retVal,
      });
    }
  );

  server.post(
    {
      path: '/api/sql/pplquery',
      validate: {
        body: schema.any(),
        query: schema.object({
          dataSourceMDSId: schema.maybe(schema.string({ defaultValue: '' })),
        }),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      const retVal = await service.describePPLQuery(context, request);
      return response.ok({
        body: retVal,
      });
    }
  );
}
