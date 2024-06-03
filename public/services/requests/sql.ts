/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreStart } from '../../../../../src/core/public';
import { DirectQueryRequest } from '../../../common/types/explorer';

export class SQLService {
  private http;
  constructor(http: CoreStart['http']) {
    this.http = http;
  }

  fetch = async (
    params: DirectQueryRequest,
    dataSourceMDSId?: string,
    errorHandler?: (error: any) => void
  ) => {
    const query = {
      dataSourceMDSId,
    };
    return this.http
      .post('/api/observability/query/jobs', {
        body: JSON.stringify(params),
        query,
      })
      .catch((error) => {
        console.error('fetch error: ', error.body);
        if (errorHandler) errorHandler(error);
        throw error;
      });
  };

  fetchWithJobId = async (
    params: { queryId: string },
    dataSourceMDSId?: string,
    errorHandler?: (error: any) => void
  ) => {
    return this.http
      .get(`/api/observability/query/jobs/${params.queryId}/${dataSourceMDSId ?? ''}`)
      .catch((error) => {
        console.error('fetch error: ', error.body);
        if (errorHandler) errorHandler(error);
        throw error;
      });
  };

  deleteWithJobId = async (params: { queryId: string }, errorHandler?: (error: any) => void) => {
    return this.http.delete(`/api/observability/query/jobs/${params.queryId}`).catch((error) => {
      console.error('delete error: ', error.body);
      if (errorHandler) errorHandler(error);
      throw error;
    });
  };
}
