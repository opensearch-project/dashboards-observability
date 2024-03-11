/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreStart } from '../../../../../src/core/public';
import {
  DSL_BASE,
  DSL_SEARCH,
  DSL_CAT,
  DSL_MAPPING,
  DSL_SETTINGS,
} from '../../../common/constants/shared';

export default class DSLService {
  private http;
  constructor(http: CoreStart['http']) {
    this.http = http;
  }
  fetch = async (request: any) => {
    return this.http
      .post(`${DSL_BASE}${DSL_SEARCH}`, {
        body: JSON.stringify(request),
      })
      .catch((error) => console.error(error));
  };

  fetchIndices = async () => {
    return this.http
      .get(`${DSL_BASE}${DSL_CAT}`, {
        query: {
          format: 'json',
        },
      })
      .catch((error) => console.error(error));
  };

  fetchFields = async (index: string) => {
    console.log('index: ', index);
    return this.http.get(`${DSL_BASE}${DSL_MAPPING}`, {
      query: {
        index,
      },
    });
  };

  fetchSettings = async (index: string) => {
    return this.http.get(`${DSL_BASE}${DSL_SETTINGS}`, {
      query: {
        index,
      },
    });
  };
}
