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
import React, { useState } from 'react';
import { AccelerationDetailsFlyout } from './acceleration_details_flyout';
import {
  getRefreshButtonIcon,
  onRefreshButtonClick,
  onDiscoverButtonClick,
  onDeleteButtonClick,
  AccelerationStatus,
} from './helpers/utils';

interface AccelerationTableTabProps {
  // TODO: Add acceleration type to plugin types
  accelerations: any[];
}

export const AccelerationTable = (props: AccelerationTableTabProps) => {
  const { accelerations } = props;
  const [isFlyoutVisible, setIsFlyoutVisible] = useState(false);

  const RefreshButton = () => {
    // TODO: Implement logic for refreshing acceleration
    return (
      <>
        <EuiButton onClick={() => console.log}>Refresh</EuiButton>
      </>
    );
  };

  const CreateButton = () => {
    // TODO: Create button should call create_acceleration.tsx, which will be brought
    // over from dashboards-query-workbench/public/components/acceleration/create/create_accelerations.tsx
    return (
      <>
        <EuiButton onClick={() => console.log()} fill>
          Create acceleration
        </EuiButton>
      </>
    );
  };

  const Header = () => {
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

  const columns: Array<EuiBasicTableColumn<any>> = [
    // TODO: fields should be determined by what the acceleration is
    // Show N/A if not applicable
    {
      field: 'name',
      name: 'Name',
      sortable: true,
      render: (name: string) => <EuiLink onClick={() => setIsFlyoutVisible(true)}>{name}</EuiLink>,
    },
    {
      field: 'status',
      name: 'Status',
      sortable: true,
      render: AccelerationStatus,
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
            label = 'AAAAAA';
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
        <EuiLink onClick={() => console.log(destination)}>{destination}</EuiLink>
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
      field: 'name',
      direction: 'asc',
    },
  };

  return (
    <>
      <EuiSpacer />
      {isFlyoutVisible && (
        <AccelerationDetailsFlyout
          acceleration={accelerations[0]}
          setIsFlyoutVisible={setIsFlyoutVisible}
        />
      )}
      <EuiPanel>
        <Header />
        <EuiHorizontalRule />
        <EuiSpacer />
        <EuiInMemoryTable
          items={accelerations}
          columns={columns}
          pagination={pagination}
          sorting={sorting}
        />
      </EuiPanel>
    </>
  );
};
