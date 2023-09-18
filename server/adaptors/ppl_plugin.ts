/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  OPENSEARCH_DATACONNECTIONS_API,
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

  ppl.getDataConnectionById = ca({
    url: {
      fmt: `${OPENSEARCH_DATACONNECTIONS_API.DATACONNECTION}/<%=dataconnection%>`,
      req: {
        dataconnection: {
          type: 'string',
          required: true,
        },
      },
    },
    method: 'GET',
  });

  ppl.modifyDataConnection = ca({
    url: {
      fmt: `${OPENSEARCH_DATACONNECTIONS_API.DATACONNECTION}`,
    },
    needBody: true,
    method: 'PUT',
  });

  ppl.getDataConnections = ca({
    url: {
      fmt: `${OPENSEARCH_DATACONNECTIONS_API.DATACONNECTION}`,
    },
    method: 'GET',
  });
};
