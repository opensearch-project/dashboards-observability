/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DirectQueryLoadingStatus } from '../../../../../../../common/types/explorer';

export const ASSC_OBJ_TABLE_SUBJ = 'associatedObjectsTable';

export const ASSC_OBJ_TABLE_ACC_COLUMN_NAME = 'accelerations';

export const ASSC_OBJ_TABLE_SEARCH_HINT =
  'database:database_1 database: database_2 accelerations:skipping_index_1';

export const ASSC_OBJ_PANEL_TITLE = 'Associated objects';

export const ASSC_OBJ_PANEL_DESCRIPTION = 'Manage objects associated with this data sources.';

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

const catalogCacheFetchingStatus = [
  DirectQueryLoadingStatus.RUNNING,
  DirectQueryLoadingStatus.WAITING,
  DirectQueryLoadingStatus.SCHEDULED,
];

export const isCatalogCacheFetching = (...statuses: DirectQueryLoadingStatus[]) => {
  return statuses.some((status: DirectQueryLoadingStatus) =>
    catalogCacheFetchingStatus.includes(status)
  );
};
