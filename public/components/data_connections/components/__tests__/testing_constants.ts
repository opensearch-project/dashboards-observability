/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const showDatasourceData = {
  schema: [
    {
      name: 'DATASOURCE_NAME',
      type: 'string',
    },
    {
      name: 'CONNECTOR_TYPE',
      type: 'string',
    },
  ],
  datarows: [
    ['my_spark3', 'SPARK'],
    ['my_spark4', 'SPARK'],
    ['my_spark', 'SPARK'],
    ['@opensearch', 'OPENSEARCH'],
    ['my_spark2', 'SPARK'],
  ],
  total: 5,
  size: 5,
  jsonData: [
    {
      DATASOURCE_NAME: 'my_spark3',
      CONNECTOR_TYPE: 'SPARK',
    },
    {
      DATASOURCE_NAME: 'my_spark4',
      CONNECTOR_TYPE: 'SPARK',
    },
    {
      DATASOURCE_NAME: 'my_spark',
      CONNECTOR_TYPE: 'SPARK',
    },
    {
      DATASOURCE_NAME: '@opensearch',
      CONNECTOR_TYPE: 'OPENSEARCH',
    },
    {
      DATASOURCE_NAME: 'my_spark2',
      CONNECTOR_TYPE: 'SPARK',
    },
  ],
};

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
