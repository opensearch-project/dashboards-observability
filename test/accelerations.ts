/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ACCELERATION_DEFUALT_SKIPPING_INDEX_NAME,
  ACCELERATION_REFRESH_TIME_INTERVAL,
  ACCELERATION_TIME_INTERVAL,
} from '../common/constants/data_sources';
import {
  CreateAccelerationForm,
  MaterializedViewQueryType,
  SkippingIndexRowType,
} from '../common/types/data_connections';

export const skippingIndexDataMock: SkippingIndexRowType[] = [
  {
    id: '1',
    fieldName: 'field1',
    dataType: 'string',
    accelerationMethod: 'PARTITION',
  },
  {
    id: '2',
    fieldName: 'field2',
    dataType: 'number',
    accelerationMethod: 'VALUE_SET',
  },
];

export const coveringIndexDataMock: string[] = ['field1', 'field2', 'field3'];

export const materializedViewEmptyDataMock = {
  columnsValues: [],
  groupByTumbleValue: {
    timeField: '',
    tumbleWindow: 0,
    tumbleInterval: '',
  },
};

export const materializedViewEmptyTumbleDataMock: MaterializedViewQueryType = {
  columnsValues: [
    {
      id: '1',
      functionName: 'count',
      functionParam: 'field1',
    },
  ],
  groupByTumbleValue: {
    timeField: '',
    tumbleWindow: 0,
    tumbleInterval: 'second',
  },
};

export const materializedViewStaleDataMock: MaterializedViewQueryType = {
  columnsValues: [],
  groupByTumbleValue: {
    timeField: 'timestamp',
    tumbleWindow: 10,
    tumbleInterval: 'hour',
  },
};

export const materializedViewValidDataMock: MaterializedViewQueryType = {
  columnsValues: [
    {
      id: '1',
      functionName: 'count',
      functionParam: 'field1',
    },
    {
      id: '2',
      functionName: 'sum',
      functionParam: 'field2',
    },
  ],
  groupByTumbleValue: {
    timeField: 'timestamp',
    tumbleWindow: 5,
    tumbleInterval: 'hour',
  },
};

export const createAccelerationEmptyDataMock: CreateAccelerationForm = {
  dataSource: '',
  dataTable: '',
  database: '',
  dataTableFields: [],
  accelerationIndexType: 'skipping',
  skippingIndexQueryData: [],
  coveringIndexQueryData: [],
  materializedViewQueryData: {
    columnsValues: [],
    groupByTumbleValue: {
      timeField: '',
      tumbleWindow: 0,
      tumbleInterval: '',
    },
  },
  accelerationIndexName: ACCELERATION_DEFUALT_SKIPPING_INDEX_NAME,
  primaryShardsCount: 5,
  replicaShardsCount: 1,
  refreshType: 'autoInterval',
  checkpointLocation: undefined,
  refreshIntervalOptions: {
    refreshWindow: 15,
    refreshInterval: ACCELERATION_REFRESH_TIME_INTERVAL[0].value,
  },
  watermarkDelay: {
    delayWindow: 1,
    delayInterval: ACCELERATION_TIME_INTERVAL[1].value,
  },
  formErrors: {
    dataSourceError: [],
    databaseError: [],
    dataTableError: [],
    skippingIndexError: [],
    coveringIndexError: [],
    materializedViewError: [],
    indexNameError: [],
    primaryShardsError: [],
    replicaShardsError: [],
    refreshIntervalError: [],
    checkpointLocationError: [],
    watermarkDelayError: [],
  },
};

export const indexOptionsMock1: CreateAccelerationForm = {
  ...createAccelerationEmptyDataMock,
  primaryShardsCount: 3,
  replicaShardsCount: 2,
  refreshType: 'autoInterval',
  refreshIntervalOptions: {
    refreshWindow: 15,
    refreshInterval: ACCELERATION_REFRESH_TIME_INTERVAL[0].value,
  },
};

export const indexOptionsMockResult1 = `WITH (
index_settings = '{"number_of_shards":3,"number_of_replicas":2}',
auto_refresh = true,
refresh_interval = '15 minutes'
)`;

export const indexOptionsMock2: CreateAccelerationForm = {
  ...createAccelerationEmptyDataMock,
  primaryShardsCount: 3,
  replicaShardsCount: 2,
  refreshType: 'autoInterval',
  refreshIntervalOptions: {
    refreshWindow: 10,
    refreshInterval: ACCELERATION_REFRESH_TIME_INTERVAL[1].value,
  },
};

export const indexOptionsMockResult2 = `WITH (
index_settings = '{"number_of_shards":3,"number_of_replicas":2}',
auto_refresh = true,
refresh_interval = '10 hours'
)`;

export const indexOptionsMock3: CreateAccelerationForm = {
  ...createAccelerationEmptyDataMock,
  primaryShardsCount: 3,
  replicaShardsCount: 2,
  refreshType: 'autoInterval',
  refreshIntervalOptions: {
    refreshWindow: 10,
    refreshInterval: ACCELERATION_REFRESH_TIME_INTERVAL[1].value,
  },
  checkpointLocation: 's3://path/to/checkpoint',
};

export const indexOptionsMockResult3 = `WITH (
index_settings = '{"number_of_shards":3,"number_of_replicas":2}',
auto_refresh = true,
refresh_interval = '10 hours',
checkpoint_location = 's3://path/to/checkpoint'
)`;

export const indexOptionsMock4: CreateAccelerationForm = {
  ...createAccelerationEmptyDataMock,
  primaryShardsCount: 3,
  replicaShardsCount: 2,
  refreshType: 'manual',
};

export const indexOptionsMockResult4 = `WITH (
index_settings = '{"number_of_shards":3,"number_of_replicas":2}',
auto_refresh = false,
incremental_refresh = false
)`;

export const indexOptionsMock5: CreateAccelerationForm = {
  ...createAccelerationEmptyDataMock,
  accelerationIndexType: 'materialized',
  primaryShardsCount: 3,
  replicaShardsCount: 2,
  refreshType: 'manual',
  watermarkDelay: {
    delayWindow: 10,
    delayInterval: 'minute',
  },
};

export const indexOptionsMockResult5 = `WITH (
index_settings = '{"number_of_shards":3,"number_of_replicas":2}',
auto_refresh = false,
incremental_refresh = false,
watermark_delay = '10 minutes'
)`;

export const indexOptionsMock7: CreateAccelerationForm = {
  ...createAccelerationEmptyDataMock,
  primaryShardsCount: 3,
  replicaShardsCount: 2,
  refreshType: 'manualIncrement',
  checkpointLocation: 's3://ckpt',
};

export const indexOptionsMockResult7 = `WITH (
index_settings = '{"number_of_shards":3,"number_of_replicas":2}',
auto_refresh = false,
incremental_refresh = true,
checkpoint_location = 's3://ckpt'
)`;

export const skippingIndexBuilderMock1: CreateAccelerationForm = {
  ...createAccelerationEmptyDataMock,
  dataSource: 'datasource',
  database: 'database',
  dataTable: 'table',
  skippingIndexQueryData: [
    {
      id: '1',
      fieldName: 'field1',
      dataType: 'string',
      accelerationMethod: 'PARTITION',
    },
    {
      id: '2',
      fieldName: 'field2',
      dataType: 'int',
      accelerationMethod: 'VALUE_SET',
    },
    {
      id: '3',
      fieldName: 'field3',
      dataType: 'boolean',
      accelerationMethod: 'MIN_MAX',
    },
  ],
  primaryShardsCount: 9,
  replicaShardsCount: 2,
  refreshType: 'autoInterval',
  refreshIntervalOptions: {
    refreshWindow: 1,
    refreshInterval: 'minute',
  },
  checkpointLocation: 's3://test/',
};

export const indexOptionsMock6: CreateAccelerationForm = {
  ...createAccelerationEmptyDataMock,
  primaryShardsCount: 1,
  replicaShardsCount: 1,
  refreshType: 'manual',
  checkpointLocation: 's3://dsfsad/dasda',
};

export const indexOptionsMockResult6 = `WITH (
index_settings = '{"number_of_shards":1,"number_of_replicas":1}',
auto_refresh = false,
incremental_refresh = false
)`;

export const skippingIndexBuilderMockResult1 = `CREATE SKIPPING INDEX
ON datasource.database.table (
   \`field1\` PARTITION, 
   \`field2\` VALUE_SET, 
   \`field3\` MIN_MAX
  ) WITH (
index_settings = '{"number_of_shards":9,"number_of_replicas":2}',
auto_refresh = true,
refresh_interval = '1 minute',
checkpoint_location = 's3://test/'
)`;

export const skippingIndexBuilderMock2: CreateAccelerationForm = {
  ...createAccelerationEmptyDataMock,
  dataSource: 'datasource',
  database: 'database',
  dataTable: 'table',
  skippingIndexQueryData: [
    {
      id: '1',
      fieldName: 'field1',
      dataType: 'string',
      accelerationMethod: 'PARTITION',
    },
  ],
  primaryShardsCount: 5,
  replicaShardsCount: 3,
  refreshType: 'manual',
  checkpointLocation: 's3://test/',
};

export const skippingIndexBuilderMockResult2 = `CREATE SKIPPING INDEX
ON datasource.database.table (
   \`field1\` PARTITION
  ) WITH (
index_settings = '{"number_of_shards":5,"number_of_replicas":3}',
auto_refresh = false,
incremental_refresh = false
)`;

export const coveringIndexBuilderMock1: CreateAccelerationForm = {
  ...createAccelerationEmptyDataMock,
  dataSource: 'datasource',
  database: 'database',
  dataTable: 'table',
  accelerationIndexName: 'index_name',
  coveringIndexQueryData: ['field1', 'field2', 'field3'],
  primaryShardsCount: 9,
  replicaShardsCount: 2,
  refreshType: 'autoInterval',
  refreshIntervalOptions: {
    refreshWindow: 1,
    refreshInterval: 'minute',
  },
  checkpointLocation: 's3://test/',
};

export const coveringIndexBuilderMockResult1 = `CREATE INDEX index_name
ON datasource.database.table (
   \`field1\`, 
   \`field2\`, 
   \`field3\`
  ) WITH (
index_settings = '{"number_of_shards":9,"number_of_replicas":2}',
auto_refresh = true,
refresh_interval = '1 minute',
checkpoint_location = 's3://test/'
)`;

export const coveringIndexBuilderMock2: CreateAccelerationForm = {
  ...createAccelerationEmptyDataMock,
  dataSource: 'datasource',
  database: 'database',
  dataTable: 'table',
  accelerationIndexName: 'index_name',
  coveringIndexQueryData: ['field1'],
  primaryShardsCount: 5,
  replicaShardsCount: 3,
  refreshType: 'manualIncrement',
  checkpointLocation: 's3://test/',
};

export const coveringIndexBuilderMockResult2 = `CREATE INDEX index_name
ON datasource.database.table (
   \`field1\`
  ) WITH (
index_settings = '{"number_of_shards":5,"number_of_replicas":3}',
auto_refresh = false,
incremental_refresh = true,
checkpoint_location = 's3://test/'
)`;

export const materializedViewBuilderMock1: CreateAccelerationForm = {
  ...createAccelerationEmptyDataMock,
  dataSource: 'datasource',
  database: 'database',
  dataTable: 'table',
  accelerationIndexType: 'materialized',
  accelerationIndexName: 'index_name',
  materializedViewQueryData: {
    columnsValues: [
      { id: '1', functionName: 'count', functionParam: 'field', fieldAlias: 'counter' },
      { id: '2', functionName: 'count', functionParam: '*', fieldAlias: 'counter1' },
      { id: '3', functionName: 'sum', functionParam: 'field2' },
      { id: '4', functionName: 'avg', functionParam: 'field3', fieldAlias: 'average' },
      { id: '5', functionName: 'window.start', fieldAlias: 'start' },
    ],
    groupByTumbleValue: {
      timeField: 'timestamp',
      tumbleWindow: 1,
      tumbleInterval: 'minute',
    },
  },
  primaryShardsCount: 9,
  replicaShardsCount: 2,
  refreshType: 'autoInterval',
  refreshIntervalOptions: {
    refreshWindow: 1,
    refreshInterval: 'minute',
  },
  watermarkDelay: {
    delayWindow: 1,
    delayInterval: 'minute',
  },
  checkpointLocation: 's3://test/',
};

export const materializedViewBuilderMockResult1 = `CREATE MATERIALIZED VIEW datasource.database.index_name
AS SELECT
   count(\`field\`) AS \`counter\`, 
   count(*) AS \`counter1\`, 
   sum(\`field2\`), 
   avg(\`field3\`) AS \`average\`, 
   window.start AS \`start\`
FROM datasource.database.table
GROUP BY TUMBLE (\`timestamp\`, '1 minute')
 WITH (
index_settings = '{"number_of_shards":9,"number_of_replicas":2}',
auto_refresh = true,
refresh_interval = '1 minute',
watermark_delay = '1 minute',
checkpoint_location = 's3://test/'
)`;

export const materializedViewBuilderMock2: CreateAccelerationForm = {
  ...createAccelerationEmptyDataMock,
  dataSource: 'datasource',
  database: 'database',
  dataTable: 'table',
  accelerationIndexType: 'materialized',
  accelerationIndexName: 'index_name',
  materializedViewQueryData: {
    columnsValues: [{ id: '1', functionName: 'count', functionParam: 'field' }],
    groupByTumbleValue: {
      timeField: 'timestamp',
      tumbleWindow: 2,
      tumbleInterval: 'hour',
    },
  },
  primaryShardsCount: 5,
  replicaShardsCount: 3,
  refreshType: 'manualIncrement',
  checkpointLocation: 's3://test/',
  watermarkDelay: {
    delayWindow: 2,
    delayInterval: 'minute',
  },
};

export const materializedViewBuilderMockResult2 = `CREATE MATERIALIZED VIEW datasource.database.index_name
AS SELECT
   count(\`field\`)
FROM datasource.database.table
GROUP BY TUMBLE (\`timestamp\`, '2 hours')
 WITH (
index_settings = '{"number_of_shards":5,"number_of_replicas":3}',
auto_refresh = false,
incremental_refresh = true,
watermark_delay = '2 minutes',
checkpoint_location = 's3://test/'
)`;

export const mockDatasourcesQuery = {
  data: {
    ok: true,
    resp:
      '[{  "name": "my_glue",  "description": "",  "connector": "S3GLUE",  "allowedRoles": [],  "properties": {      "glue.indexstore.opensearch.uri": "",      "glue.indexstore.opensearch.region": ""  }}]',
  },
};
