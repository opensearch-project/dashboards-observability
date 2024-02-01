/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { schema } from '@osd/config-schema';
import { ObservabilityConfig } from '../..';
import {
  IOpenSearchDashboardsResponse,
  IRouter,
  ResponseError,
} from '../../../../../src/core/server';
import { isResponseError } from '../../../../../src/core/server/opensearch/client/errors';
import { QUERY_ASSIST_API } from '../../../common/constants/query_assist';
import { generateFieldContext } from '../../common/helpers/query_assist/generate_field_context';
import { requestWithRetryAgentSearch, searchAgentIdByName } from './utils/agents';

export function registerQueryAssistRoutes(router: IRouter, config: ObservabilityConfig) {
  const { ppl_agent_name: pplAgentName } = config.query_assist;
  const {
    response_summary_agent_name: responseSummaryAgentName,
    error_summary_agent_name: errorSummaryAgentName,
  } = config.summarize;

  /**
   * Returns whether the PPL agent is configured.
   */
  router.get(
    {
      path: QUERY_ASSIST_API.CONFIGURED,
      validate: {},
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      const client = context.core.opensearch.client.asCurrentUser;
      try {
        // if the call does not throw any error, then the agent is properly configured
        await searchAgentIdByName(client, pplAgentName!);
        return response.ok({ body: { configured: true } });
      } catch (error) {
        return response.ok({ body: { configured: false, error: error.message } });
      }
    }
  );

  router.post(
    {
      path: QUERY_ASSIST_API.GENERATE_PPL,
      validate: {
        body: schema.object({
          index: schema.string(),
          question: schema.string(),
        }),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      if (!pplAgentName)
        return response.custom({
          statusCode: 400,
          body:
            'PPL agent name not found in opensearch_dashboards.yml. Expected observability.query_assist.ppl_agent_name',
        });

      const client = context.core.opensearch.client.asCurrentUser;
      try {
        const pplRequest = await requestWithRetryAgentSearch({
          client,
          agentName: pplAgentName,
          body: {
            parameters: {
              index: request.body.index,
              question: request.body.question,
            },
          },
        });
        if (!pplRequest.body.inference_results[0].output[0].result)
          throw new Error('Generated PPL query not found.');
        const result = JSON.parse(pplRequest.body.inference_results[0].output[0].result) as {
          ppl: string;
          executionResult: string;
        };
        const ppl = result.ppl
          .replace(/[\r\n]/g, ' ')
          .trim()
          .replace(/ISNOTNULL/g, 'isnotnull') // https://github.com/opensearch-project/sql/issues/2431
          .replace(/`/g, '') // https://github.com/opensearch-project/dashboards-observability/issues/509, https://github.com/opensearch-project/dashboards-observability/issues/557
          .replace(/\bSPAN\(/g, 'span('); // https://github.com/opensearch-project/dashboards-observability/issues/759
        return response.ok({ body: ppl });
      } catch (error) {
        // parse PPL query from error response if exists
        // TODO remove after https://github.com/opensearch-project/skills/issues/138
        if (isResponseError(error) && error.body.error?.reason) {
          const pplMatch = error.body.error.reason.match(/execute ppl:(.+), get error:/);
          if (pplMatch[1]) return response.ok({ body: pplMatch[1] });
        }
        return response.custom({ statusCode: error.statusCode || 500, body: error.message });
      }
    }
  );

  router.post(
    {
      path: QUERY_ASSIST_API.SUMMARIZE,
      validate: {
        body: schema.object({
          index: schema.string(),
          question: schema.string(),
          query: schema.maybe(schema.string()),
          response: schema.string(),
          isError: schema.boolean(),
        }),
      },
    },
    async (
      context,
      request,
      response
    ): Promise<IOpenSearchDashboardsResponse<any | ResponseError>> => {
      if (!responseSummaryAgentName || !errorSummaryAgentName)
        return response.custom({
          statusCode: 400,
          body:
            'Summary agent name not found in opensearch_dashboards.yml. Expected observability.query_assist.response_summary_agent_name and observability.query_assist.error_summary_agent_name',
        });

      const client = context.core.opensearch.client.asCurrentUser;
      const { index, question, query, response: _response, isError } = request.body;
      const queryResponse = JSON.stringify(_response);
      let summaryRequest;

      try {
        if (!isError) {
          summaryRequest = await requestWithRetryAgentSearch({
            client,
            agentName: responseSummaryAgentName,
            body: {
              parameters: { index, question, query, response: queryResponse },
            },
          });
        } else {
          const [mappings, sampleDoc] = await Promise.all([
            client.indices.getMapping({ index }),
            client.search({ index, size: 1 }),
          ]);
          const fields = generateFieldContext(mappings, sampleDoc);
          summaryRequest = await requestWithRetryAgentSearch({
            client,
            agentName: errorSummaryAgentName,
            body: {
              parameters: { index, question, query, response: queryResponse, fields },
            },
          });
        }
        const summary = summaryRequest.body.inference_results[0].output[0].result;
        if (!summary) throw new Error('Generated summary not found.');
        const suggestedQuestions = Array.from(
          (summaryRequest.body.inference_results[0].output[1]?.result || '').matchAll(
            /<question>((.|[\r\n])+?)<\/question>/g
          )
        ).map((m) => (m as unknown[])[1]);
        return response.ok({
          body: {
            summary,
            suggestedQuestions,
          },
        });
      } catch (error) {
        return response.custom({
          statusCode: error.statusCode || 500,
          body: error.message,
        });
      }
    }
  );
}
