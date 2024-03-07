/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const mockAssociatedObjects = [
  {
    id: '1',
    datasource: 'flint_s3',
    name: 'Table_name_1',
    database: 'db1',
    type: 'Table',
    createdByIntegration: 'integration_1',
    accelerations: [
      {
        name: 'skipping_index_1',
        status: 'ACTIVE',
        type: 'skip',
        database: 'db1',
        table: 'Table_name_1',
        destination: 'N/A',
        dateCreated: 1709339290,
        dateUpdated: 1709339290,
        index: 'security_logs_2022',
        sql: 'SELECT * FROM Table_name_1 WHERE ...',
      },
    ],
    columns: [
      {
        name: 'column1',
        dataType: 'dataType1',
      },
      {
        name: 'column2',
        dataType: 'dataType2',
      },
      {
        name: 'column3',
        dataType: 'dataType3',
      },
      {
        name: 'column4',
        dataType: 'dataType4',
      },
    ],
  },
  {
    id: '2',
    datasource: 'flint_s3',
    name: 'Table_name_2',
    database: 'db1',
    type: 'Table',
    createdByIntegration: 'integration_1',
    accelerations: [
      {
        name: 'skipping_index_2',
        status: 'ACTIVE',
        type: 'skip',
        database: 'db1',
        table: 'Table_name_1',
        destination: 'N/A',
        dateCreated: 1709339290,
        dateUpdated: 1709339290,
        index: 'security_logs_2022',
        sql: 'SELECT * FROM Table_name_1 WHERE ...',
      },
    ],
    columns: [],
  },
  {
    id: '3',
    datasource: 'flint_s3',
    name: 'skipping_index_2',
    database: 'db1',
    type: 'Skip Index',
    createdByIntegration: 'integration_1',
    accelerations: [
      {
        name: 'skipping_index_2',
        status: 'ACTIVE',
        type: 'skip',
        database: 'db1',
        table: 'Table_name_1',
        destination: 'N/A',
        dateCreated: 1709339290,
        dateUpdated: 1709339290,
        index: 'security_logs_2022',
        sql: 'SELECT * FROM Table_name_1 WHERE ...',
      },
    ],
    columns: [],
  },
  {
    id: '4',
    datasource: 'flint_s3',
    name: 'Table_name_4',
    database: 'db2',
    type: 'Table',
    createdByIntegration: 'integration_1',
    accelerations: [
      {
        name: 'skipping_index_2',
        status: 'ACTIVE',
        type: 'skip',
        database: 'db1',
        table: 'Table_name_1',
        destination: 'N/A',
        dateCreated: 1709339290,
        dateUpdated: 1709339290,
        index: 'security_logs_2022',
        sql: 'SELECT * FROM Table_name_1 WHERE ...',
      },
    ],
    columns: [
      {
        name: 'column1',
        dataType: 'dataType1',
      },
      {
        name: 'column2',
        dataType: 'dataType2',
      },
    ],
  },
  {
    id: '5',
    datasource: 'flint_s3',
    name: 'Table_name_5',
    database: 'db3',
    type: 'Table',
    createdByIntegration: 'integration_1',
    accelerations: [],
    columns: [
      {
        name: 'column1',
        dataType: 'dataType1',
      },
      {
        name: 'column2',
        dataType: 'dataType2',
      },
    ],
  },
  {
    id: '6',
    datasource: 'flint_s3',
    name: 'covering_index_3',
    database: 'db3',
    type: 'Cover Index',
    createdByIntegration: '',
    accelerations: [
      {
        name: 'covering_index_3',
        status: 'ACTIVE',
        type: 'skip',
        database: 'db1',
        table: 'Table_name_1',
        destination: 'N/A',
        dateCreated: 1709339290,
        dateUpdated: 1709339290,
        index: 'security_logs_2022',
        sql: 'SELECT * FROM Table_name_1 WHERE ...',
      },
    ],
    columns: [
      {
        name: 'column1',
        dataType: 'dataType1',
      },
      {
        name: 'column2',
        dataType: 'dataType2',
      },
    ],
  },
  {
    id: '7',
    datasource: 'flint_s3',
    name: 'Table_name_6',
    database: 'db3',
    type: 'Table',
    createdByIntegration: '',
    accelerations: [
      {
        name: 'skipping_index_4',
        status: 'ACTIVE',
        type: 'skip',
        database: 'db1',
        table: 'Table_name_1',
        destination: 'N/A',
        dateCreated: 1709339290,
        dateUpdated: 1709339290,
        index: 'security_logs_2022',
        sql: 'SELECT * FROM Table_name_1 WHERE ...',
      },
      {
        name: 'skipping_index_5',
        status: 'ACTIVE',
        type: 'skip',
        database: 'db1',
        table: 'Table_name_1',
        destination: 'N/A',
        dateCreated: 1709339290,
        dateUpdated: 1709339290,
        index: 'security_logs_2022',
        sql: 'SELECT * FROM Table_name_1 WHERE ...',
      },
    ],
    columns: [
      {
        name: 'column1',
        dataType: 'dataType1',
      },
      {
        name: 'column2',
        dataType: 'dataType2',
      },
    ],
  },
];

export const ASSC_OBJ_TABLE_SUBJ = 'associatedObjectsTable';

export const ASSC_OBJ_TABLE_ACC_COLUMN_NAME = 'accelerations';

export const ASSC_OBJ_TABLE_SEARCH_HINT =
  'database:database_1 database: database_2 accelerations:skipping_index_1';

export const ASSC_OBJ_PANEL_TITLE = 'Associated objects';

export const ASSC_OBJ_PANEL_DESRIPTION = 'Manage objects associated with this data sources.';

export const ASSC_OBJ_NO_DATA_TITLE = 'You have no associated objects';

export const ASSC_OBJ_NO_DATA_DESCRIPTION =
  'Add or config tables from your data source or use Query Workbench.';

export const ASSC_OBJ_REFRESH_BTN = 'Refresh';

export const ASSC_OBJ_FRESH_MSG = 'Last updated at:';

export const ACCE_NO_DATA_TITLE = 'You have no accelerations';

export const ACCE_NO_DATA_DESCRIPTION = 'Accelerate query performing through OpenSearch Indexing';

export const CREATE_ACCELERATION_DESCRIPTION = 'Create Acceleration';

export const onAccelerateButtonClick = (tableDetail: any) => {
  // TODO: create acceleration of this table
  console.log('accelerating', tableDetail.name);
};

export const onDiscoverButtonClick = (tabaleDetail: any) => {
  // TODO: send user to Discover
  console.log('sending user to discover for', tabaleDetail.name);
};

export const onDeleteButtonClick = (tableDetail: any) => {
  // TODO: delete table
  console.log('deleting', tableDetail.name);
};
