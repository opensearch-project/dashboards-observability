/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import 'core-js/stable';
import _ from 'lodash';
import 'regenerator-runtime/runtime';

export class QueryService {
  private client: any;
  constructor(client: any) {
    this.client = client;
  }

  describeQueryInternal = async (
    request: any,
    format: string,
    responseFormat: string,
    context: any
  ) => {
    try {
      const queryRequest = {
        query: request.body,
      };
      const params = {
        body: JSON.stringify(queryRequest),
      };

      let client = this.client;
      let queryResponse;

      const { dataSourceMDSId } = request.query;
      if (dataSourceMDSId) {
        client = context.dataSource.opensearch.legacy.getClient(dataSourceMDSId);
        queryResponse = await client.callAPI(format, params);
      } else {
        queryResponse = await this.client.asScoped(request).callAsCurrentUser(format, params);
      }
      return {
        data: {
          ok: true,
          resp: _.isEqual(responseFormat, 'json') ? JSON.stringify(queryResponse) : queryResponse,
        },
      };
    } catch (err) {
      this.logger.info('error describeQueryInternal');
      this.logger.info(err);

      return {
        data: {
          ok: false,
          resp: err.message,
          body: err.body,
        },
      };
    }
  };

  describeSQLQuery = async (context: any, request: any) => {
    return this.describeQueryInternal(request, 'ppl.sqlQuery', 'json', context);
  };

  describePPLQuery = async (context: any, request: any) => {
    return this.describeQueryInternal(request, 'ppl.pplQuery', 'json', context);
  };
}
