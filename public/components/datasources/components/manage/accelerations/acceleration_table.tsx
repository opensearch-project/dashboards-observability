/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiBasicTableColumn,
  EuiButton,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiInMemoryTable,
  EuiLink,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { CatalogCacheManager } from '../../../../../framework/catalog_cache/cache_manager';
import {
  CachedAcceleration,
  CachedDataSourceStatus,
} from '../../../../../../common/types/data_connections';
import { DirectQueryLoadingStatus } from '../../../../../../common/types/explorer';
import { isCatalogCacheFetching } from '../associated_objects/utils/associated_objects_tab_utils';
import { getRenderAccelerationDetailsFlyout } from '../../../../../plugin';
import {
  ACC_LOADING_MSG,
  ACC_PANEL_DESC,
  ACC_PANEL_TITLE,
  AccelerationStatus,
  getAccelerationName,
  getRefreshButtonIcon,
  onDeleteButtonClick,
  onDiscoverButtonClick,
  onRefreshButtonClick,
} from './utils/acceleration_utils';

interface AccelerationTableProps {
  dataSourceName: string;
  cacheLoadingHooks: any;
}

export const AccelerationTable = ({
  dataSourceName,
  cacheLoadingHooks,
}: AccelerationTableProps) => {
  const [accelerations, setAccelerations] = useState<CachedAcceleration[]>([]);
  const [updatedTime, setUpdatedTime] = useState<string>();

  const {
    databasesLoadStatus,
    tablesLoadStatus,
    accelerationsLoadStatus,
    startLoadingAccelerations,
  } = cacheLoadingHooks;
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const cachedDataSource = CatalogCacheManager.getOrCreateAccelerationsByDataSource(
      dataSourceName
    );
    if (
      cachedDataSource.status === CachedDataSourceStatus.Empty &&
      !isCatalogCacheFetching(accelerationsLoadStatus)
    ) {
      console.log(
        `Cache for dataSource ${dataSourceName} is empty or outdated. Loading accelerations...`
      );
      setIsRefreshing(true);
      startLoadingAccelerations(dataSourceName);
    } else {
      console.log(`Using cached accelerations for dataSource: ${dataSourceName}`);

      setAccelerations(cachedDataSource.accelerations);
      setUpdatedTime(cachedDataSource.lastUpdated);
    }
  }, []);

  useEffect(() => {
    if (accelerationsLoadStatus === DirectQueryLoadingStatus.SUCCESS) {
      const cachedDataSource = CatalogCacheManager.getOrCreateAccelerationsByDataSource(
        dataSourceName
      );
      setAccelerations(cachedDataSource.accelerations);
      setUpdatedTime(cachedDataSource.lastUpdated);
      setIsRefreshing(false);
      console.log('Refresh process is success.');
    }
    if (accelerationsLoadStatus === DirectQueryLoadingStatus.FAILED) {
      setIsRefreshing(false);
      console.log('Refresh process is failed.');
    }
  }, [accelerationsLoadStatus]);

  const handleRefresh = () => {
    console.log('Initiating refresh...');
    if (!isCatalogCacheFetching(accelerationsLoadStatus)) {
      setIsRefreshing(true);
      startLoadingAccelerations(dataSourceName);
    }
  };

  const RefreshButton = () => {
    return (
      <EuiButton
        onClick={handleRefresh}
        isLoading={
          isRefreshing ||
          isCatalogCacheFetching(databasesLoadStatus, tablesLoadStatus, accelerationsLoadStatus)
        }
      >
        Refresh
      </EuiButton>
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

  console.log('HERE IS THE UPDATED TIME', updatedTime);
  const AccelerationTableHeader = () => {
    return (
      <>
        <EuiFlexGroup direction="row">
          <EuiFlexItem>
            <EuiText>
              <h3 className="panel-title">{ACC_PANEL_TITLE}</h3>
              <p>{ACC_PANEL_DESC}</p>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup direction="rowReverse" alignItems="flexEnd">
              <EuiFlexItem grow={false}>
                <CreateButton />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <RefreshButton data-test-subj="refreshButton" />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiText textAlign="right" size="xs" color="subdued">
                  {'Last updated'}
                </EuiText>
                <EuiText textAlign="right" color="subdued" size="xs">
                  {updatedTime}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </>
    );
  };

  const AccelerationLoading = () => {
    const BodyText = () => (
      <>
        <p>{ACC_LOADING_MSG}</p>
      </>
    );

    return <EuiEmptyPrompt icon={<EuiLoadingSpinner size="xl" />} body={<BodyText />} />;
  };

  const tableActions = [
    {
      name: 'Discover',
      description: 'Open in Discover',
      icon: 'discoverApp',
      type: 'icon',
      onClick: (acc: CachedAcceleration) => {
        onDiscoverButtonClick(acc, dataSourceName);
      },
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

  const accelerationTableColumns = [
    {
      field: 'indexName',
      name: 'Name',
      sortable: true,
      render: (indexName: string, acceleration: CachedAcceleration) => {
        const displayName = getAccelerationName(indexName, acceleration, dataSourceName);
        return (
          <EuiLink
            onClick={() => {
              console.log(displayName);
              renderAccelerationDetailsFlyout({
                index: displayName,
                acceleration,
                dataSourceName,
              });
            }}
          >
            {displayName}
          </EuiLink>
        );
      },
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
          case 'skipping':
            label = 'Skipping Index';
            break;
          case 'materialized':
            label = 'Materialized View';
            break;
          case 'covering':
            label = 'Covering Index';
            break;
          default:
            label = 'INVALID TYPE';
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
      render: (table: string) => <EuiText>{table || '-'}</EuiText>,
    },
    {
      field: 'refreshType',
      name: 'Refresh Type',
      sortable: true,
      render: (autoRefresh: boolean, acceleration: CachedAcceleration) => {
        return <EuiText>{acceleration.autoRefresh ? 'Auto refresh' : 'Manual'}</EuiText>;
      },
    },
    {
      field: 'flintIndexName',
      name: 'Destination Index',
      sortable: true,
      render: (flintIndexName: string, acceleration: CachedAcceleration) => {
        if (acceleration.type === 'skipping') {
          return '-';
        }
        return flintIndexName || '-';
      },
    },
    {
      name: 'Actions',
      actions: tableActions,
    },
  ] as Array<EuiBasicTableColumn<any>>;

  const pagination = {
    initialPageSize: 10,
    pageSizeOptions: [10, 20, 50, 100],
  };

  const sorting = {
    sort: {
      field: 'name',
      direction: 'asc',
    },
  };

  const renderAccelerationDetailsFlyout = getRenderAccelerationDetailsFlyout();

  return (
    <>
      <EuiSpacer />
      <EuiPanel>
        <AccelerationTableHeader />
        <EuiHorizontalRule />
        <EuiSpacer />
        {isRefreshing ? (
          <AccelerationLoading />
        ) : (
          <EuiInMemoryTable
            items={accelerations}
            columns={accelerationTableColumns}
            pagination={pagination}
            sorting={sorting}
          />
        )}
      </EuiPanel>
    </>
  );
};
