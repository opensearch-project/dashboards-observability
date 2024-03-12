/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiText,
  EuiHorizontalRule,
  EuiButton,
  EuiSpacer,
  EuiLink,
  EuiInMemoryTable,
  EuiBasicTableColumn,
} from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import {
  getRefreshButtonIcon,
  onRefreshButtonClick,
  onDiscoverButtonClick,
  onDeleteButtonClick,
  AccelerationStatus,
} from './helpers/utils';
import { getRenderAccelerationDetailsFlyout } from '../../../../../plugin';
import { CatalogCacheManager } from '../../../../../framework/catalog_cache/cache_manager';
import {
  CachedAccelerations,
  CachedDataSourceStatus,
} from '../../../../../../common/types/data_connections';
import { useAccelerationsToCache } from '../../../../../framework/catalog_cache/cache_loader';
import { DirectQueryLoadingStatus } from '../../../../../../common/types/explorer';

export const AccelerationTable = () => {
  const [accelerations, setAccelerations] = useState<CachedAccelerations[]>([]);
  const { loadStatus, startLoading } = useAccelerationsToCache();

  useEffect(() => {
    const cachedAccelerations = CatalogCacheManager.getAccelerationsCache();

    if (
      cachedAccelerations.status === CachedDataSourceStatus.Empty ||
      !cachedAccelerations.lastUpdated
    ) {
      console.log('Cache is empty or outdated. Loading accelerations...');
      startLoading('mys3');
    } else {
      console.log('Using cached accelerations.');
      setAccelerations(cachedAccelerations.accelerations);
    }
  }, []);

  useEffect(() => {
    if (loadStatus === DirectQueryLoadingStatus.SUCCESS) {
      const updatedCache = CatalogCacheManager.getAccelerationsCache();
      setAccelerations(updatedCache.accelerations);
      console.log('Accelerations successfully loaded into cache.');
    }
  }, [loadStatus]);

  const RefreshButton = () => {
    // TODO: Implement logic for refreshing acceleration
    return (
      <>
        <EuiButton onClick={() => console.log('clicked on refresh button')}>Refresh</EuiButton>
      </>
    );
  };

  const CreateButton = () => {
    // TODO: Create button should call create_acceleration.tsx, which will be brought
    // over from dashboards-query-workbench/public/components/acceleration/create/create_accelerations.tsx
    return (
      <>
        <EuiButton onClick={() => console.log('clicked on create accelerations button')} fill>
          Create acceleration
        </EuiButton>
      </>
    );
  };

  const AccelerationTableHeader = () => {
    return (
      <>
        <EuiFlexGroup direction="row" alignItems="center">
          <EuiFlexItem>
            <EuiText>
              <h3 className="panel-title">Accelerations</h3>
              <p>
                Accelerations optimize query performance by indexing external data into OpenSearch.
              </p>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <RefreshButton />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <CreateButton />
          </EuiFlexItem>
        </EuiFlexGroup>
      </>
    );
  };

  const tableActions = [
    {
      name: 'Discover',
      description: 'Open in Discover',
      icon: 'discoverApp',
      type: 'icon',
      onClick: onDiscoverButtonClick,
    },
    {
      name: 'Refresh',
      description: 'Refresh/Pause/Resume',
      icon: getRefreshButtonIcon,
      onClick: onRefreshButtonClick,
    },
    {
      name: 'Delete',
      description: 'Delete acceleration',
      icon: 'trash',
      type: 'icon',
      onClick: onDeleteButtonClick,
    },
  ];

  const accelerationTableColumns: Array<EuiBasicTableColumn<any>> = [
    {
      field: 'indexName',
      name: 'Name',
      sortable: true,
      render: (indexName: string) => (
        <EuiLink
          onClick={() => {
            renderAccelerationDetailsFlyout({
              index: indexName,
              acceleration: accelerations.find(
                (acceleration) => acceleration.indexName === indexName
              ),
            });
          }}
        >
          {indexName}
        </EuiLink>
      ),
    },
    {
      field: 'status',
      name: 'Status',
      sortable: true,
      render: (status: string) => <AccelerationStatus status={status} />,
    },
    {
      field: 'type',
      name: 'Type',
      sortable: true,
      render: (type: string) => {
        let label;
        switch (type) {
          case 'skip':
            label = 'Skipping Index';
            break;
          case 'mv':
            label = 'Materialized View';
            break;
          case 'ci':
            label = 'Covering Index';
            break;
          default:
            label = 'default';
        }
        return <EuiText>{label}</EuiText>;
      },
    },
    {
      field: 'database',
      name: 'Database',
      sortable: true,
      render: (database: string) => <EuiText>{database}</EuiText>,
    },
    {
      field: 'table',
      name: 'Table',
      sortable: true,
      render: (table: string) => <EuiText>{table}</EuiText>,
    },
    {
      field: 'destination',
      name: 'Destination Index',
      sortable: true,
      render: (destination: string) => (
        <EuiLink onClick={() => console.log('clicked on', destination)}>{destination}</EuiLink>
      ),
    },
    {
      name: 'Actions',
      actions: tableActions,
    },
  ];

  const pagination = {
    initialPageSize: 10,
    pageSizeOptions: [10, 20, 50, 100],
  };

  const sorting = {
    sort: {
      field: 'flintIndexName',
      direction: 'asc',
    },
  };

  // Render flyout using OSD overlay service
  const renderAccelerationDetailsFlyout = getRenderAccelerationDetailsFlyout();

  return (
    <>
      <EuiSpacer />
      <EuiPanel>
        <AccelerationTableHeader />
        <EuiHorizontalRule />
        <EuiSpacer />
        <EuiInMemoryTable
          items={accelerations}
          columns={accelerationTableColumns}
          pagination={pagination}
          sorting={sorting}
        />
      </EuiPanel>
    </>
  );
};
