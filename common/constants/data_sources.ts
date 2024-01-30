/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const DATA_SOURCE_NAME_URL_PARAM_KEY = 'datasourceName';
export const DATA_SOURCE_TYPE_URL_PARAM_KEY = 'datasourceType';
export const OLLY_QUESTION_URL_PARAM_KEY = 'olly_q';
export const INDEX_URL_PARAM_KEY = 'indexPattern';
export const DEFAULT_DATA_SOURCE_TYPE = 'DEFAULT_INDEX_PATTERNS';
export const DEFAULT_DATA_SOURCE_NAME = 'Default cluster';
export const DEFAULT_DATA_SOURCE_OBSERVABILITY_DISPLAY_NAME = 'OpenSearch';
export const DEFAULT_DATA_SOURCE_TYPE_NAME = 'Default Group';
export const enum QUERY_LANGUAGE {
  PPL = 'PPL',
  SQL = 'SQL',
  DQL = 'DQL',
}
export enum DATA_SOURCE_TYPES {
  DEFAULT_CLUSTER_TYPE = DEFAULT_DATA_SOURCE_TYPE,
  SPARK = 'spark',
  S3Glue = 's3glue',
}
export const ASYNC_POLLING_INTERVAL = 2000;
