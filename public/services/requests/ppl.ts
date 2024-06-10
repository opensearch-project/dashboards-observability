/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreStart } from '../../../../../src/core/public';
import { PPL_BASE, PPL_SEARCH } from '../../../common/constants/shared';

/* eslint-disable import/no-default-export */
export default class PPLService {
  private http;

  constructor(http: CoreStart['http']) {
    this.http = http;
  }

  fetch = async (
    params: {
      query: string;
      format: string;
    },
    dataSourceMDSId?: string,
    errorHandler?: (error: any) => void
  ) => {
    return this.http
      .post(`${PPL_BASE}${PPL_SEARCH}`, {
        body: JSON.stringify(params),
        query: {
          dataSourceMDSId,
        },
      })
      .catch((error) => {
        console.error('fetch error: ', error.body);
        if (errorHandler) errorHandler(error);
        throw error;
      });
  };
}
