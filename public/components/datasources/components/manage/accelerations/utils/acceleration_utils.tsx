/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiButton, EuiHealth } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { CachedAcceleration } from '../../../../../../../common/types/data_connections';
import {
  redirectToExplorerOSIdx,
  redirectToExplorerWithDataSrc,
} from '../../associated_objects/utils/associated_objects_tab_utils';
import { DATA_SOURCE_TYPES } from '../../../../../../../common/constants/data_sources';

export const ACC_PANEL_TITLE = i18n.translate('accelerationTable.panelTitle', {
  defaultMessage: 'Accelerations',
});

export const ACC_PANEL_DESC = i18n.translate('accelerationTable.panelDescription', {
  defaultMessage:
    'Accelerations optimize query performance by indexing external data into OpenSearch.',
});

export const ACC_LOADING_MSG = i18n.translate('accelerationTable.loadingMessage', {
  defaultMessage: 'Loading/Refreshing accelerations...',
});

export const ACC_DELETE_MSG = i18n.translate('accelerationActionOverlay.delete.description', {
  defaultMessage:
    'The acceleration will be deleted. User will no longer be able to view from this acceleration. By default data will be retained in the associated index.',
});

export const ACC_VACUUM_MSG = i18n.translate('accelerationActionOverlay.vacuum.description', {
  defaultMessage:
    'Vacuuming will remove the actual data from the disk since the associated index will be removed from the cluster. To confirm your action, type the name of the acceleration below.',
});

export const ACC_SYNC_MSG = i18n.translate('accelerationActionOverlay.sync.description', {
  defaultMessage: 'Syncing data may require querying all data. Do you want to continue?',
});

export const ACC_CREATE_SUBMIT_SUCCESS_MSG = i18n.translate('acceleration.create.submitSuccess', {
  defaultMessage: 'Create acceleration query submitted successfully!',
});

export const ACC_CREATE_SUBMIT_FAIL_MSG = i18n.translate('acceleration.create.submitFail', {
  defaultMessage: 'Create acceleration query failed',
});

export const ACC_TABLE_ACTION_DESC = {
  discoverAction: i18n.translate('accelerationTable.actions.discover', {
    defaultMessage: 'Open in Discover',
  }),
  syncAction: i18n.translate('accelerationTable.actions.sync', {
    defaultMessage: 'Manual Sync Data',
  }),
  deleteAction: i18n.translate('accelerationTable.actions.delete', {
    defaultMessage: 'Delete acceleration',
  }),
  vacuumAction: i18n.translate('accelerationTable.actions.vacuum', {
    defaultMessage: 'Vacuum acceleration',
  }),
};

export const ACC_TABLE_COLUMN_NAMES = {
  columnName: i18n.translate('accelerationTable.columns.columnName', {
    defaultMessage: 'Name',
  }),
  columnStatus: i18n.translate('accelerationTable.columns.columnStatus', {
    defaultMessage: 'Status',
  }),
  columnType: i18n.translate('accelerationTable.columns.columnType', {
    defaultMessage: 'Type',
  }),
  columnDatabase: i18n.translate('accelerationTable.columns.columnDatabase', {
    defaultMessage: 'Database',
  }),
  columnTable: i18n.translate('accelerationTable.columns.columnTable', {
    defaultMessage: 'Table',
  }),
  columnRefreshType: i18n.translate('accelerationTable.columns.columnRefreshType', {
    defaultMessage: 'Refresh Type',
  }),
  columnDestinationIndex: i18n.translate('accelerationTable.columns.columnDestinationIndex', {
    defaultMessage: 'Destination Index',
  }),
};

export type AccelerationActionType = 'delete' | 'vacuum' | 'sync';

export const getAccelerationName = (acceleration: CachedAcceleration) => {
  return acceleration.indexName || 'skipping_index';
};

export const getAccelerationFullPath = (acceleration: CachedAcceleration, dataSource: string) => {
  switch (acceleration.type) {
    case 'skipping':
      return `${dataSource}.${acceleration.database}.${acceleration.table}`;
    case 'materialized':
      return `${dataSource}.${acceleration.database}`;
    case 'covering':
      return `${dataSource}.${acceleration.database}.${acceleration.table}`;
    default:
      return 'Unknown acceleration type';
  }
};

export const generateAccelerationOperationQuery = (
  acceleration: CachedAcceleration,
  dataSource: string,
  operationType: AccelerationActionType
): string => {
  let operationQuery;

  switch (operationType) {
    case 'delete':
      operationQuery = `DROP`;
      break;
    case 'vacuum':
      operationQuery = `VACUUM`;
      break;
    case 'sync':
      operationQuery = `REFRESH`;
      break;
    default:
      throw new Error(`Unsupported operation type: ${operationType}`);
  }

  switch (acceleration.type) {
    case 'skipping':
      return `${operationQuery} SKIPPING INDEX ON ${dataSource}.${acceleration.database}.${acceleration.table}`;
    case 'covering':
      if (!acceleration.indexName) {
        throw new Error("Index name is required for 'covering' acceleration type.");
      }
      return `${operationQuery} INDEX ${acceleration.indexName} ON ${dataSource}.${acceleration.database}.${acceleration.table}`;
    case 'materialized':
      return `${operationQuery} MATERIALIZED VIEW ${dataSource}.${acceleration.database}.${acceleration.indexName}`;
    default:
      throw new Error(`Unsupported acceleration type: ${acceleration.type}`);
  }
};

export const CreateAccelerationFlyoutButton = ({
  dataSourceName,
  renderCreateAccelerationFlyout,
}: {
  dataSourceName: string;
  renderCreateAccelerationFlyout: (dataSourceName: string) => void;
}) => {
  return (
    <>
      <EuiButton onClick={() => renderCreateAccelerationFlyout(dataSourceName)} fill>
        Create acceleration
      </EuiButton>
    </>
  );
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
