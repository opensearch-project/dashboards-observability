/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiHealth } from '@elastic/eui';

export const AccelerationStatus = (props: { status: string }) => {
  const { status } = props;
  console.log('status is', status);
  const label = status === 'Active' ? 'Active' : 'Paused';
  const color = status === 'Active' ? 'success' : 'inactive';
  return <EuiHealth color={color}>{label}</EuiHealth>;
};

export const AccelerationHealth = ({ health }: { health: string }) => {
  console.log('health is', health);

  let label, color;

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
