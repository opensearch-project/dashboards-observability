/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ApiResponse } from '@opensearch-project/opensearch/.';
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

export const getAgentIdByConfig = async (
  opensearchClient: OpenSearchClient,
  configName: string
): Promise<string> => {
  try {
    const response = (await opensearchClient.transport.request({
      method: 'GET',
      path: `${ML_COMMONS_API_PREFIX}/config/${configName}`,
    })) as ApiResponse<{ type: string; configuration: { agent_id?: string } }>;

    if (!response || response.body.configuration.agent_id === undefined) {
      throw new Error('cannot find any agent by configuration: ' + configName);
    }
    return response.body.configuration.agent_id;
  } catch (error) {
    const errorMessage = JSON.stringify(error.meta?.body) || error;
    throw new Error(`Get agent '${configName}' failed, reason: ` + errorMessage);
  }
};

export const requestWithRetryAgentSearch = async (options: {
  client: OpenSearchClient;
  configName: string;
  shouldRetryAgentSearch?: boolean;
  body: RequestBody;
}): Promise<AgentResponse> => {
  const { client, configName, shouldRetryAgentSearch = true, body } = options;
  let retry = shouldRetryAgentSearch;
  if (!agentIdMap[configName]) {
    agentIdMap[configName] = await getAgentIdByConfig(client, configName);
    retry = false;
  }
  return client.transport
    .request(
      {
        method: 'POST',
        path: `${ML_COMMONS_API_PREFIX}/agents/${agentIdMap[configName]}/_execute`,
        body,
      },
      AGENT_REQUEST_OPTIONS
    )
    .catch(async (error) => {
      if (retry && isResponseError(error) && error.statusCode === 404) {
        agentIdMap[configName] = await getAgentIdByConfig(client, configName);
        return requestWithRetryAgentSearch({ ...options, shouldRetryAgentSearch: false });
      }
      return Promise.reject(error);
    }) as Promise<AgentResponse>;
};
