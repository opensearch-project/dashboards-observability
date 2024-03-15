/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiHealth } from '@elastic/eui';

export const ACC_PANEL_TITLE = 'Accelerations';
export const ACC_PANEL_DESC =
  'Accelerations optimize query performance by indexing external data into OpenSearch.';
export const ACC_LOADING_MSG = 'Loading/Refreshing accelerations...';

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

export const onRefreshButtonClick = (acceleration: any) => {
  // TODO: send request to refresh
  console.log('refreshing', acceleration.name);
};

export const onDiscoverButtonClick = (acceleration: any) => {
  // TODO: send user to Discover
  console.log('sending user to discover for', acceleration.name);
};

export const onDeleteButtonClick = (acceleration: any) => {
  // TODO: delete acceleration
  console.log('deleting', acceleration.name);
};
