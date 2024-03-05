/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import _ from 'lodash';
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
  SearchFilterConfig,
  EuiTableFieldDataColumnType,
} from '@elastic/eui';
import { AssociatedObject } from 'common/types/data_connections';
import { AccelerationsRecommendationCallout } from './accelerations_recommendation_callout';
import {
  accelerationColumnName,
  associatedObjectsSearchBarHint,
} from './utils/associated_objects_tab_utils';

interface AssociatedObjectsTabProps {
  associatedObjects: AssociatedObject[];
}

interface FilterOption {
  value: string;
  text: string;
}

interface AssociatedTableFilter {
  type: string;
  field: string;
  operator: string;
  value: string;
}

function isClauseMatched(record: AssociatedObject, filterObj: AssociatedTableFilter): boolean {
  const entries = Object.entries(record);

  return entries.some(([key, value]) => key === filterObj.field && filterObj.value === value);
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

    const databaseOptions = Array.from(new Set(associatedObjects.map((obj) => obj.database)))
      .sort()
      .map((database) => ({ value: database, text: database }));
    setDatabaseFilterOptions(databaseOptions);

    const accelerationOptions = Array.from(
      new Set(associatedObjects.flatMap((obj) => obj.accelerations).filter(Boolean))
    )
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
          <EuiFlexGroup direction="rowReverse" alignItems="flexEnd">
            <EuiFlexItem grow={false}>
              <EuiButton
                data-test-subj="freshButton"
                iconType="refresh"
                onClick={fetchAssociatedObjects}
              >
                Refresh
              </EuiButton>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiText textAlign="right" size="xs" color="subdued">
                Last updated at:
              </EuiText>
              <EuiText textAlign="right" color="subdued" size="xs">
                {lastUpdated}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
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
      render: (name: string) => <EuiLink href="https://example.com">{name}</EuiLink>,
    },
    {
      field: 'database',
      name: 'Database',
      sortable: true,
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
      render: (createdByIntegration: string, _item: AssociatedObject) =>
        createdByIntegration ? (
          <EuiLink onClick={() => openDetailsPage(createdByIntegration)}>
            {createdByIntegration}
          </EuiLink>
        ) : (
          '-'
        ),
    },
    {
      field: 'accelerations',
      name: 'Accelerations',
      sortable: true,
      render: (accelerations: string[]) => {
        return accelerations.length > 0
          ? accelerations.map((acceleration, index) => (
              <React.Fragment key={index}>
                <EuiLink onClick={() => openFlyout(acceleration)}>{acceleration}</EuiLink>
                {index < accelerations.length - 1 ? ', ' : ''}
              </React.Fragment>
            ))
          : '-';
      },
    },
    {
      name: 'Actions',
      actions: [
        {
          name: 'Discover',
          description: 'Discover this object',
          type: 'icon',
          icon: 'discoverApp',
          onClick: (item: AssociatedObject) => console.log('Discover', item),
        },
        {
          name: 'Accelerate',
          description: 'Accelerate this object',
          type: 'icon',
          icon: 'bolt',
          available: (item: AssociatedObject) => item.type === 'Table',
          onClick: (item: AssociatedObject) => console.log('Accelerate', item),
        },
      ],
    },
  ] as Array<EuiTableFieldDataColumnType<any>>;

  const onSearchChange = ({ query, error }) => {
    if (error) {
      console.log('Search error:', error);
      return;
    }

    const matchesClauses = (obj, clauses) => {
      if (clauses.length === 0) return true;
      return clauses.some((clause) => {
        if (clause.type !== 'field' && clause.field !== 'accelerations') return true;
        if (clause.field === accelerationColumnName)
          return obj[accelerationColumnName].includes(clause.value);
        return isClauseMatched(obj, clause);
      });
    };

    const filtered = associatedObjects.filter((obj) => {
      const clauses = query.ast._clauses;
      return matchesClauses(obj, clauses);
    });

    setFilteredObjects(filtered);
  };

  const searchFilters = [
    {
      type: 'field_value_selection',
      field: 'database',
      name: 'Database',
      multiSelect: true,
      options: databaseFilterOptions,
      cache: 60000,
    },
    {
      type: 'field_value_selection',
      field: 'accelerations',
      name: 'Accelerations',
      multiSelect: true,
      options: accelerationFilterOptions,
      cache: 60000,
    },
  ] as SearchFilterConfig[];

  const search = {
    filters: searchFilters,
    box: {
      incremental: true,
      placeholder: associatedObjectsSearchBarHint,
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
