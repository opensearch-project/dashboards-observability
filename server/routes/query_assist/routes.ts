/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { schema } from '@osd/config-schema';
import {
  IOpenSearchDashboardsResponse,
  IRouter,
  ResponseError,
} from '../../../../../src/core/server';
import { isResponseError } from '../../../../../src/core/server/opensearch/client/errors';
import { ERROR_DETAILS, QUERY_ASSIST_API } from '../../../common/constants/query_assist';
import { generateFieldContext } from '../../common/helpers/query_assist/generate_field_context';
import { getAgentIdByConfig, getAgentIdAndRequest } from './utils/agents';
import { AGENT_CONFIGS } from './utils/constants';

export function registerQueryAssistRoutes(router: IRouter) {
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
        await getAgentIdByConfig(client, AGENT_CONFIGS.PPL_AGENT);
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
      const client = context.core.opensearch.client.asCurrentUser;
      try {
        const pplRequest = await getAgentIdAndRequest({
          client,
          configName: AGENT_CONFIGS.PPL_AGENT,
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
          .replace(/\bSPAN\(/g, 'span('); // https://github.com/opensearch-project/dashboards-observability/issues/759
        return response.ok({ body: ppl });
      } catch (error) {
        if (
          isResponseError(error) &&
          error.statusCode === 400 &&
          // on opensearch >= 2.17, error.body is an object https://github.com/opensearch-project/ml-commons/pull/2858
          JSON.stringify(error.body).includes(ERROR_DETAILS.GUARDRAILS_TRIGGERED)
        ) {
          return response.badRequest({ body: ERROR_DETAILS.GUARDRAILS_TRIGGERED });
        }
        return response.custom({
          statusCode: error.statusCode || 500,
          body: typeof error.body === 'string' ? error.body : JSON.stringify(error.body),
        });
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
      const client = context.core.opensearch.client.asCurrentUser;
      const { index, question, query, response: _response, isError } = request.body;
      const queryResponse = JSON.stringify(_response);
      let summaryRequest;

      try {
        if (!isError) {
          summaryRequest = await getAgentIdAndRequest({
            client,
            configName: AGENT_CONFIGS.RESPONSE_SUMMARY_AGENT,
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
          summaryRequest = await getAgentIdAndRequest({
            client,
            configName: AGENT_CONFIGS.ERROR_SUMMARY_AGENT,
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
        if (
          isResponseError(error) &&
          error.statusCode === 400 &&
          // on opensearch >= 2.17, error.body is an object https://github.com/opensearch-project/ml-commons/pull/2858
          JSON.stringify(error.body).includes(ERROR_DETAILS.GUARDRAILS_TRIGGERED)
        ) {
          return response.badRequest({ body: ERROR_DETAILS.GUARDRAILS_TRIGGERED });
        }
        return response.custom({
          statusCode: error.statusCode || 500,
          body: typeof error.body === 'string' ? error.body : JSON.stringify(error.body),
        });
      }
    }
  );
}
