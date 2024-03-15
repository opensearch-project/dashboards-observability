/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

const QUERY_ASSIST_API_PREFIX = '/api/observability/query_assist';
export const QUERY_ASSIST_API = {
  CONFIGURED: `${QUERY_ASSIST_API_PREFIX}/configured`,
  GENERATE_PPL: `${QUERY_ASSIST_API_PREFIX}/generate_ppl`,
  SUMMARIZE: `${QUERY_ASSIST_API_PREFIX}/summarize`,
};

export const ML_COMMONS_API_PREFIX = '/_plugins/_ml';

export const ERROR_DETAILS = { GUARDRAILS_TRIGGERED: 'guardrail triggered' };
