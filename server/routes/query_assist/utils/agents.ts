/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ApiResponse } from '@opensearch-project/opensearch/.';
import { SearchResponse, SearchTotalHits } from '@opensearch-project/opensearch/api/types';
import { RequestBody } from '@opensearch-project/opensearch/lib/Transport';
import { OpenSearchClient } from '../../../../../../src/core/server';
import { isResponseError } from '../../../../../../src/core/server/opensearch/client/errors';
import { ML_COMMONS_API_PREFIX } from '../../../../common/constants/query_assist';

const AGENT_REQUEST_OPTIONS = {
  /**
   * It is time-consuming for LLM to generate final answer
   * Give it a large timeout window
   */
  requestTimeout: 5 * 60 * 1000,
  /**
   * Do not retry
   */
  maxRetries: 0,
};

type AgentResponse = ApiResponse<{
  inference_results: Array<{
    output: Array<{ name: string; result?: string }>;
  }>;
}>;

export const agentIdMap: Record<string, string> = {};

export const searchAgentIdByName = async (
  opensearchClient: OpenSearchClient,
  name: string
): Promise<string> => {
  try {
    const response = (await opensearchClient.transport.request({
      method: 'GET',
      path: `${ML_COMMONS_API_PREFIX}/agents/_search`,
      body: {
        query: {
          term: {
            'name.keyword': name,
          },
        },
        sort: {
          created_time: 'desc',
        },
      },
    })) as ApiResponse<SearchResponse>;

    if (
      !response ||
      (typeof response.body.hits.total === 'number' && response.body.hits.total === 0) ||
      (response.body.hits.total as SearchTotalHits).value === 0
    ) {
      throw new Error('cannot find any agent by name: ' + name);
    }
    const id = response.body.hits.hits[0]._id;
    agentIdMap[name] = id;
    return id;
  } catch (error) {
    const errorMessage = JSON.stringify(error.meta?.body) || error;
    throw new Error(`search agent '${name}' failed, reason: ` + errorMessage);
  }
};

export const requestWithRetryAgentSearch = async (options: {
  client: OpenSearchClient;
  agentName: string;
  shouldRetryAgentSearch: boolean;
  body: RequestBody;
}): Promise<AgentResponse> =>
  options.client.transport
    .request(
      {
        method: 'POST',
        path: `${ML_COMMONS_API_PREFIX}/agents/${agentIdMap[options.agentName]}/_execute`,
        body: options.body,
      },
      AGENT_REQUEST_OPTIONS
    )
    .catch((error) =>
      options.shouldRetryAgentSearch && isResponseError(error) && error.statusCode === 404
        ? searchAgentIdByName(options.client, options.agentName).then(() =>
            requestWithRetryAgentSearch({ ...options, shouldRetryAgentSearch: false })
          )
        : Promise.reject(error)
    ) as Promise<AgentResponse>;
