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
  EuiEmptyPrompt,
  Query,
} from '@elastic/eui';
import { AssociatedObject } from 'common/types/data_connections';
import { AccelerationsRecommendationCallout } from './accelerations_recommendation_callout';

interface AssociatedObjectsTabProps {
  associatedObjects: AssociatedObject[];
}

interface FilterOption {
  value: string;
  text: string;
}

export const AssociatedObjectsTab: React.FC<AssociatedObjectsTabProps> = ({
  associatedObjects,
}) => {
  const [lastUpdated, setLastUpdated] = useState('');
  const [databaseFilterOptions, setDatabaseFilterOptions] = useState<FilterOption[]>([]);
  const [accelerationFilterOptions, setAccelerationFilterOptions] = useState<FilterOption[]>([]);
  const [filteredObjects, setFilteredObjects] = useState<AssociatedObject[]>([]);

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

    const databaseOptions = [...new Set(associatedObjects.map((obj) => obj.database))]
      .sort()
      .map((database) => ({ value: database, text: database }));
    setDatabaseFilterOptions(databaseOptions);

    const accelerationOptions = [...new Set(associatedObjects.map((obj) => obj.accelerations))]
      .sort()
      .map((acceleration) => ({ value: acceleration, text: acceleration }));
    setAccelerationFilterOptions(accelerationOptions);

    setFilteredObjects(associatedObjects);
  }, [associatedObjects]);

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
          <div style={{ textAlign: 'right' }}>
            <EuiText color="subdued" style={{ fontSize: 'small' }}>
              Last updated at:
            </EuiText>
            <EuiText color="subdued" style={{ fontSize: 'small' }}>
              {lastUpdated}
            </EuiText>
          </div>
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

  const noDataMessage = (
    <EuiEmptyPrompt
      title={<h2>You have no associated objects</h2>}
      body={<p>Add or config tables from your data source or use Query Workbench.</p>}
      actions={
        <EuiButton
          color="primary"
          fill
          onClick={() => window.open('https://example.com', '_blank')}
          iconType="popout"
          iconSide="left"
        >
          Query Workbench
        </EuiButton>
      }
    />
  );

  const columns = [
    {
      field: 'name',
      name: 'Name',
      sortable: true,
      'data-test-subj': 'nameCell',
      render: (name: string) => (
        <EuiLink href="https://example.com" target="_blank">
          {name}
        </EuiLink>
      ),
    },
    {
      field: 'database',
      name: 'Database',
      truncateText: true,
      render: (database: string) => (
        <EuiLink href="https://example.com" target="_blank">
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
          name: 'Discover',
          description: 'Discover this object',
          type: 'icon',
          icon: 'discoverApp',
          onClick: (item: AssociatedObject) => console.log('Edit', item),
        },
        {
          name: 'Accelerate',
          description: 'Accelerate this object',
          type: 'icon',
          icon: 'bolt',
          onClick: (item: AssociatedObject) => console.log('Delete', item),
        },
      ],
    },
  ];

  const onSearchChange = ({ queryText, error }) => {
    if (error) {
      console.log('Search error:', error);
      return;
    }

    const parsedQuery = Query.parse(queryText);
    console.log('Parsed query:', parsedQuery);

    const filtered = associatedObjects.filter((obj) => {
      // Example filtering logic, adjust based on actual fields and requirements
      let matches = true;
      if (parsedQuery.text) {
        matches = obj.name.toLowerCase().includes(parsedQuery.text.toLowerCase());
      }
      // Extend with other conditions based on parsedQuery structure
      return matches;
    });

    setFilteredObjects(filtered); // Update the state with the filtered objects
  };

  const searchFilters = [
    {
      type: 'field_value_selection',
      field: 'database',
      name: 'Database',
      multiSelect: false,
      options: databaseFilterOptions,
    },
    {
      type: 'field_value_selection',
      field: 'accelerations',
      name: 'Accelerations',
      multiSelect: 'or',
      options: accelerationFilterOptions,
    },
  ];

  const search = {
    filters: searchFilters,
    box: {
      incremental: true,
      schema: {
        fields: { name: { type: 'string' }, database: { type: 'string' } },
      },
    },
    onChange: onSearchChange,
  };

  const pagination = {
    initialPageSize: 10,
    pageSizeOptions: [10, 25, 50],
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
      <EuiPanel>
        <AssociatedObjectsHeader />
        <EuiHorizontalRule />
        <AccelerationsRecommendationCallout />
        <EuiSpacer />
        {associatedObjects.length > 0 ? (
          <EuiInMemoryTable
            items={filteredObjects}
            columns={columns}
            search={search}
            pagination={pagination}
            sorting={sorting}
            noItemsMessage={associatedObjects.length === 0 ? noDataMessage : undefined}
          />
        ) : (
          noDataMessage
        )}
      </EuiPanel>
      <EuiSpacer />
    </>
  );
};
