/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DATASOURCES_ENDPOINT,
  JOBS_ENDPOINT_BASE,
  JOB_RESULT_ENDPOINT,
  OPENSEARCH_DATASOURCES_API,
  OPENSEARCH_PANELS_API,
} from '../../common/constants/shared';

export function OpenSearchObservabilityPlugin(Client: any, config: any, components: any) {
  const clientAction = components.clientAction.factory;

  Client.prototype.observability = components.clientAction.namespaceFactory();
  const observability = Client.prototype.observability.prototype;

  // Get Object
  observability.getObject = clientAction({
    url: {
      fmt: OPENSEARCH_PANELS_API.OBJECT,
      params: {
        objectId: {
          type: 'string',
        },
        objectIdList: {
          type: 'string',
        },
        objectType: {
          type: 'string',
        },
        sortField: {
          type: 'string',
        },
        sortOrder: {
          type: 'string',
        },
        fromIndex: {
          type: 'number',
        },
        maxItems: {
          type: 'number',
        },
        name: {
          type: 'string',
        },
        lastUpdatedTimeMs: {
          type: 'string',
        },
        createdTimeMs: {
          type: 'string',
        },
      },
    },
    method: 'GET',
  });

  // Get Object by Id
  observability.getObjectById = clientAction({
    url: {
      fmt: `${OPENSEARCH_PANELS_API.OBJECT}/<%=objectId%>`,
      req: {
        objectId: {
          type: 'string',
          required: true,
        },
      },
    },
    method: 'GET',
  });

  // Create new Object
  observability.createObject = clientAction({
    url: {
      fmt: OPENSEARCH_PANELS_API.OBJECT,
    },
    method: 'POST',
    needBody: true,
  });

  // Update Object by Id
  observability.updateObjectById = clientAction({
    url: {
      fmt: `${OPENSEARCH_PANELS_API.OBJECT}/<%=objectId%>`,
      req: {
        objectId: {
          type: 'string',
          required: true,
        },
      },
    },
    method: 'PUT',
    needBody: true,
  });

  // Delete Object by Id
  observability.deleteObjectById = clientAction({
    url: {
      fmt: `${OPENSEARCH_PANELS_API.OBJECT}/<%=objectId%>`,
      req: {
        objectId: {
          type: 'string',
          required: true,
        },
      },
    },
    method: 'DELETE',
  });

  // Delete Object by Id List
  observability.deleteObjectByIdList = clientAction({
    url: {
      fmt: OPENSEARCH_PANELS_API.OBJECT,
      params: {
        objectIdList: {
          type: 'string',
          required: true,
        },
      },
    },
    method: 'DELETE',
  });

  observability.getJobStatus = clientAction({
    url: {
      fmt: `${JOBS_ENDPOINT_BASE}/<%=jobId%>/${JOB_RESULT_ENDPOINT}`,
      req: {
        jobId: {
          type: 'string',
          required: true,
        },
      },
    },
    method: 'POST',
  });

  observability.runDirectQuery = clientAction({
    url: {
      fmt: `${JOBS_ENDPOINT_BASE}`,
      params: {
        query: { type: 'string', required: true },
        datasource: { type: 'string', required: true },
        lang: { type: 'string', required: true },
      },
    },
    method: 'POST',
  });
}
