/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CachedAcceleration } from '../../../../../common/types/data_connections';

export const showDatasourceData = [
  {
    name: 'my_spark3',
    connector: 'SPARK',
    allowedRoles: [],
    properties: {
      'spark.connector': 'emr',
      'spark.datasource.flint.host': '0.0.0.0',
      'spark.datasource.flint.integration':
        'https://aws.oss.sonatype.org/content/repositories/snapshots/org/opensearch/opensearch-spark-standalone_2.12/0.1.0-SNAPSHOT/opensearch-spark-standalone_2.12-0.1.0-20230731.182705-3.jar',
      'spark.datasource.flint.port': '9200',
      'spark.datasource.flint.scheme': 'http',
      'emr.cluster': 'j-3UNQLT1MPBGLG',
    },
  },
  {
    name: 'my_spark4',
    connector: 'SPARK',
    allowedRoles: [],
    properties: {
      'spark.connector': 'emr',
      'spark.datasource.flint.host': '15.248.1.68',
      'spark.datasource.flint.integration':
        'https://aws.oss.sonatype.org/content/repositories/snapshots/org/opensearch/opensearch-spark-standalone_2.12/0.1.0-SNAPSHOT/opensearch-spark-standalone_2.12-0.1.0-20230731.182705-3.jar',
      'spark.datasource.flint.port': '9200',
      'spark.datasource.flint.scheme': 'http',
      'emr.cluster': 'j-3UNQLT1MPBGLG',
    },
  },
  {
    name: 'my_spark',
    connector: 'SPARK',
    allowedRoles: [],
    properties: {
      'spark.connector': 'emr',
      'spark.datasource.flint.host': '0.0.0.0',
      'spark.datasource.flint.port': '9200',
      'spark.datasource.flint.scheme': 'http',
      'spark.datasource.flint.region': 'xxx',
      'emr.cluster': 'xxx',
    },
  },
  {
    name: 'my_spark2',
    connector: 'SPARK',
    allowedRoles: [],
    properties: {
      'spark.connector': 'emr',
      'spark.datasource.flint.host': '0.0.0.0',
      'spark.datasource.flint.port': '9200',
      'spark.datasource.flint.scheme': 'http',
      'emr.cluster': 'j-3UNQLT1MPBGLG',
    },
  },
];

export const describeDatasource = {
  name: 'my_spark3',
  connector: 'SPARK',
  allowedRoles: [],
  properties: {
    'spark.connector': 'emr',
    'spark.datasource.flint.host': '0.0.0.0',
    'spark.datasource.flint.integration':
      'https://aws.oss.sonatype.org/content/repositories/snapshots/org/opensearch/opensearch-spark-standalone_2.12/0.1.0-SNAPSHOT/opensearch-spark-standalone_2.12-0.1.0-20230731.182705-3.jar',
    'spark.datasource.flint.port': '9200',
    'spark.datasource.flint.scheme': 'http',
    'emr.cluster': 'j-3UNQLT1MPBGLG',
  },
};

export const skippingIndexAcceleration = {
  flintIndexName: 'flint_mys3_default_http_logs_skipping_index',
  type: 'skipping',
  database: 'default',
  table: 'http_logs',
  indexName: '',
  autoRefresh: false,
  status: 'active',
} as CachedAcceleration;

export const materializedViewAcceleration = {
  flintIndexName: 'flint_mys3_default_http_count_view',
  type: 'materialized',
  database: 'default',
  table: '',
  indexName: 'http_count_view',
  autoRefresh: false,
  status: 'active',
} as CachedAcceleration;

export const coveringIndexAcceleration = {
  flintIndexName: 'flint_mys3_default_http_logs_status_clientip_and_day_index',
  type: 'covering',
  database: 'default',
  table: 'http_logs',
  indexName: 'status_clientip_and_day',
  autoRefresh: true,
  status: 'refreshing',
} as CachedAcceleration;
