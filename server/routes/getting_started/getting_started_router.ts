/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import {
  IOpenSearchDashboardsResponse,
  IRouter,
  ResponseError,
} from '../../../../../src/core/server';

export function registerGettingStartedRoutes(router: IRouter) {
  // Fetch all the custom panels available
  router.get(
    {
      path: `/api/observability/gettingstarted`,
      validate: {},
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      try {
        const filePath = path.join(__dirname, 'tutorial-1.0.0.ndjson');
        const fileData = await fs.promises.readFile(filePath, 'utf8');
        return response.ok({
          body: {
            data: fileData,
          },
        });
      } catch (error) {
        console.error('Issue in fetching NDJSON file:', error);
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );
}
