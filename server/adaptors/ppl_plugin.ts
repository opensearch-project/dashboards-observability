/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  OPENSEARCH_DATASOURCES_API,
  PPL_ENDPOINT,
  SQL_ENDPOINT,
} from '../../common/constants/shared';

export const PPLPlugin = function (Client, config, components) {
  const ca = components.clientAction.factory;
  Client.prototype.ppl = components.clientAction.namespaceFactory();
  const ppl = Client.prototype.ppl.prototype;

  ppl.pplQuery = ca({
    url: {
      fmt: `${PPL_ENDPOINT}`,
      params: {
        format: {
          type: 'string',
          required: true,
        },
      },
    },
    needBody: true,
    method: 'POST',
  });

  ppl.sqlQuery = ca({
    url: {
      fmt: `${SQL_ENDPOINT}`,
      params: {
        format: {
          type: 'string',
          required: true,
        },
      },
    },
    needBody: true,
    method: 'POST',
  });

  ppl.datasourceQuery = ca({
    url: {
      fmt: `${OPENSEARCH_DATASOURCES_API.DATASOURCE}/<%=datasource%>`,
      req: {
        datasource: {
          type: 'string',
          required: false,
        },
      },
    },
    method: 'GET',
  });
};
