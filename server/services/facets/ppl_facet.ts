/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PPLDataSource } from '../../adaptors/ppl_datasource';

export class PPLFacet {
  constructor(private client: any) {
    this.client = client;
  }

  private fetch = async (context: any, request: any, format: string, _responseFormat: string) => {
    const res = {
      success: false,
      data: {},
    };
    try {
      const dataSourceMDSId = request.query.dataSourceMDSId;
      const params = {
        body: {
          query: request.body.query,
        },
      };
      if (request.body.format !== 'jdbc') {
        params.format = request.body.format;
      }
      let queryRes;
      if (dataSourceMDSId) {
        const mdsClient = context.dataSource.opensearch.legacy.getClient(dataSourceMDSId);
        queryRes = await mdsClient.callAPI(format, params);
      } else {
        queryRes = await this.client.asScoped(request).callAsCurrentUser(format, params);
      }
      const pplDataSource = new PPLDataSource(queryRes, request.body.format);
      res.success = true;
      res.data = pplDataSource.getDataSource();
    } catch (err: any) {
      console.error('PPL query fetch err: ', err);
      res.data = err;
    }
    return res;
  };

  describeQuery = async (context, request: any) => {
    return this.fetch(context, request, 'ppl.pplQuery', 'json');
  };
}
