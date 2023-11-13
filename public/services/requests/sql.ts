/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreStart } from '../../../../../src/core/public';
import { PPL_BASE, PPL_SEARCH } from '../../../common/constants/shared';

export class SQLService {
  private http;
  constructor(http: CoreStart['http']) {
    this.http = http;
  }

  fetch = async (
    params: {
      query: string;
      lang: string;
      datasource: string;
    },
    errorHandler?: (error: any) => void
  ) => {
    return this.http
      .post('/api/observability/query/jobs', {
        body: JSON.stringify(params),
      })
      .catch((error) => {
        console.error('fetch error: ', error.body);
        if (errorHandler) errorHandler(error);
        throw error;
      });
  };

  fetchWithJobId = async (params: { queryId: string }, errorHandler?: (error: any) => void) => {
    return this.http.get(`/api/observability/query/jobs/${params.queryId}`).catch((error) => {
      console.error('fetch error: ', error.body);
      if (errorHandler) errorHandler(error);
      throw error;
    });
  };
}
