/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// TODO: REMOVE THIS DUMMY DATA
export const mockAssociatedObjects = [
  {
    id: '1',
    name: 'Table_name_1',
    database: 'db1',
    type: 'Table',
    createdByIntegration: 'xx',
    accelerations: ['xxx_skipping1'],
  },
  {
    id: '2',
    name: 'Table_name_2',
    database: 'db1',
    type: 'Table',
    createdByIntegration: 'xx',
    accelerations: ['xxx_skipping1'],
  },
  {
    id: '3',
    name: 'Table_name_3',
    database: 'db1',
    type: 'Table',
    createdByIntegration: 'xx',
    accelerations: ['xxx_skipping2'],
  },
  {
    id: '4',
    name: 'Table_name_4',
    database: 'db2',
    type: 'Table',
    createdByIntegration: 'xx',
    accelerations: ['xxx_skipping2'],
  },
  {
    id: '5',
    name: 'Table_name_5',
    database: 'db3',
    type: 'Table',
    createdByIntegration: 'xx',
    accelerations: ['xxx_skipping3'],
  },
  {
    id: '6',
    name: 'Table_name_5',
    database: 'db3',
    type: 'CI',
    createdByIntegration: '',
    accelerations: [],
  },
  {
    id: '6',
    name: 'Table_name_5',
    database: 'db3',
    type: 'CI',
    createdByIntegration: '',
    accelerations: ['acc1', 'acc2'],
  },
];

export const accelerationColumnName = 'accelerations';

export const associatedObjectsSearchBarHint =
  'database:database_1 database: database_2 accelerations:skipping_index_1';
