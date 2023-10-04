/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DatasourceType } from '../../common/types/data_connections';

export const OPENSEARCH_DOCUMENTATION_URL = 'https://opensearch.org/docs/latest/data-sources/index';

export const OPENSEARCH_ACC_DOCUMENTATION_URL =
  'https://opensearch.org/docs/latest/data-acceleration/index';
export const QUERY_RESTRICTED = 'query-restricted';
export const QUERY_ALL = 'query-all';

export const DatasourceTypeToDisplayName: { [key in DatasourceType]: string } = {
  PROMETHEUS: 'Prometheus',
  S3GLUE: 'S3',
};

export type AuthMethod = 'noauth' | 'basicauth' | 'awssigv4';
