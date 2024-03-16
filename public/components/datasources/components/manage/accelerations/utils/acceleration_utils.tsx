/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiHealth } from '@elastic/eui';
import { CachedAcceleration } from '../../../../../../../common/types/data_connections';
import {
  redirectToExplorerOSIdx,
  redirectToExplorerWithDataSrc,
} from '../../associated_objects/utils/associated_objects_tab_utils';
import { DATA_SOURCE_TYPES } from '../../../../../../../common/constants/data_sources';

export const ACC_PANEL_TITLE = 'Accelerations';
export const ACC_PANEL_DESC =
  'Accelerations optimize query performance by indexing external data into OpenSearch.';
export const ACC_LOADING_MSG = 'Loading/Refreshing accelerations...';
export const ACC_DELETE_MSG =
  'The acceleration will be deleted. User will no longer be able to view from this acceleration. By default data will be retained in the associated index.';
export const ACC_VACUUM_MSG =
  'Vacuuming will remove the actual data from the disk since the associated index will be removed from the cluster. To confirm your action, type the name of the acceleration below.';

export const getAccelerationName = (acceleration: CachedAcceleration, datasource: string) => {
  return (
    acceleration.indexName ||
    `${datasource}_${acceleration.database}_${acceleration.table}`.replace(/\s+/g, '_')
  );
};

export const generateAccelerationDeletionQuery = (
  acceleration: CachedAcceleration,
  dataSource: string
): string => {
  switch (acceleration.type) {
    case 'skipping':
      return `DROP SKIPPING INDEX ON ${dataSource}.${acceleration.database}.${acceleration.table}`;
    case 'covering':
      if (!acceleration.indexName) {
        throw new Error("Index name is required for 'covering' acceleration type.");
      }
      return `DROP INDEX ${acceleration.indexName} ON ${dataSource}.${acceleration.database}.${acceleration.table}`;
    case 'materialized':
      return `DROP MATERIALIZED VIEW ${dataSource}.${acceleration.database}.${acceleration.table}`;
    default:
      throw new Error(`Unsupported acceleration type: ${acceleration.type}`);
  }
};

export const AccelerationStatus = ({ status }: { status: string }) => {
  const label = status;
  let color;

  switch (status) {
    case 'active':
      color = 'success';
      break;
    case 'refreshing':
      color = 'warning';
      break;
    case 'deleted':
      color = 'danger';
      break;
    default:
      color = 'subdued';
  }

  return <EuiHealth color={color}>{label}</EuiHealth>;
};

export const AccelerationHealth = ({ health }: { health: string }) => {
  let label = health;
  let color;

  switch (health) {
    case 'green':
      label = 'Green';
      color = 'success';
      break;
    case 'red':
      label = 'Red';
      color = 'danger';
      break;
    case 'yellow':
      label = 'Yellow';
      color = 'warning';
      break;
    default:
      label = 'Invalid';
      color = 'danger';
  }

  return <EuiHealth color={color}>{label}</EuiHealth>;
};

export const getRefreshButtonIcon = () => {
  // TODO: If acceleration can only be manually refreshed, return inputOutput
  // If acceleration is automatically refreshed and paused, return play
  // If acceleration is automatically refreshed and is refreshing, return pause
  return 'inputOutput';
};

export const onRefreshIconClick = (acceleration: CachedAcceleration) => {
  // TODO: send request to refresh
  console.log('refreshing', acceleration.indexName);
};

export const onDiscoverIconClick = (acceleration: CachedAcceleration, dataSourceName: string) => {
  // boolean determining whether its a skipping index table or mv/ci
  if (acceleration.type === undefined) return;
  if (acceleration.type === 'skipping') {
    redirectToExplorerWithDataSrc(
      dataSourceName,
      DATA_SOURCE_TYPES.S3Glue,
      acceleration.database,
      acceleration.table
    );
  } else {
    redirectToExplorerOSIdx(acceleration.flintIndexName);
  }
};

export const onDeleteIconClick = (acceleration: CachedAcceleration) => {
  // TODO: delete acceleration
  console.log('deleting', acceleration.indexName);
};

export const onVacuumIconClick = (acceleration: CachedAcceleration) => {
  console.log('vacuum', acceleration.indexName);
};
