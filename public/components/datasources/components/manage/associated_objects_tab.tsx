/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  EuiInMemoryTable,
  EuiLink,
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiHorizontalRule,
  EuiButton,
  EuiSpacer,
} from '@elastic/eui';
import { AccelerationsRecommendationCallout } from './accelerations_recommendation_callout';

interface AssociatedObject {
  id: string;
  name: string;
  database: string;
  type: string;
  createdByIntegration: string;
  accelerations: string;
}

interface AssociatedObjectsTabProps {
  associatedObjects: AssociatedObject[];
}

export const AssociatedObjectsTab: React.FC<AssociatedObjectsTabProps> = ({
  associatedObjects,
}) => {
  const [lastUpdated, setLastUpdated] = useState('');

  // TODO: FINISH THE REFRESH LOGIC
  const fetchAssociatedObjects = async () => {
    // Placeholder for data fetching logic
    // After fetching data:
    // setAssociatedObjects(fetchedData);
    const now = new Date();
    setLastUpdated(now.toUTCString()); // Update last updated time
  };

  useEffect(() => {
    fetchAssociatedObjects();
  }, []);

  const AssociatedObjectsHeader = () => {
    return (
      <EuiFlexGroup direction="row">
        <EuiFlexItem>
          <EuiText size="m">
            <h2 className="panel-title">Associated objects</h2>
            Manage objects associated with this data sources.
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText>
            <p>Last updated at: {lastUpdated}</p>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton
            data-test-subj="freshButton"
            iconType="refresh"
            onClick={fetchAssociatedObjects}
          >
            Refresh
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  const columns = [
    {
      field: 'name',
      name: 'Name',
      sortable: true,
      'data-test-subj': 'nameCell',
      render: (name: string) => (
        <EuiLink href="https://oui.opensearch.org/latest/" target="_blank">
          {name}
        </EuiLink>
      ),
    },
    {
      field: 'database',
      name: 'Database',
      truncateText: true,
      render: (database: string) => (
        <EuiLink href="https://oui.opensearch.org/latest/" target="_blank">
          {database}
        </EuiLink>
      ),
    },
    {
      field: 'type',
      name: 'Type',
      sortable: true,
    },
    {
      field: 'createdByIntegration',
      name: 'Created by Integration',
      sortable: true,
    },
    {
      field: 'accelerations',
      name: 'Accelerations',
      sortable: true,
    },
    {
      name: 'Actions',
      actions: [
        {
          name: 'Edit',
          description: 'Edit this object',
          type: 'icon',
          icon: 'discoverApp',
          onClick: (item: AssociatedObject) => console.log('Edit', item),
        },
        {
          name: 'Delete',
          description: 'Delete this object',
          type: 'icon',
          icon: 'bolt',
          onClick: (item: AssociatedObject) => console.log('Delete', item),
        },
      ],
    },
  ];

  const search = {
    box: {
      incremental: true,
      schema: {
        fields: { name: { type: 'string' }, database: { type: 'string' } }, // Adjust according to your data's fields
      },
    },
  };

  const pagination = {
    initialPageSize: 10,
    pageSizeOptions: [5, 10, 20],
  };

  const sorting = {
    sort: {
      field: 'name', // Default sort field
      direction: 'asc', // Default sort direction
    },
  };

  return (
    <>
      <EuiSpacer />
      <EuiPanel>
        <AssociatedObjectsHeader />
        <EuiHorizontalRule />
        <AccelerationsRecommendationCallout />
        <EuiSpacer />
        <EuiInMemoryTable
          items={associatedObjects}
          columns={columns}
          search={search}
          pagination={pagination}
          sorting={sorting}
        />
      </EuiPanel>
      <EuiSpacer />
    </>
  );
};
