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
  EuiSpacer,
  SearchFilterConfig,
  EuiTableFieldDataColumnType,
  EuiSelectable,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import {
  AccelerationIndexType,
  AssociatedObject,
  CachedAcceleration,
  CachedDatabase,
  CachedTable,
} from '../../../../../../common/types/data_connections';
import {
  getRenderAccelerationDetailsFlyout,
  getRenderAssociatedObjectsDetailsFlyout,
} from '../../../../../plugin';
import { AccelerationsRecommendationCallout } from './accelerations_recommendation_callout';
import {
  ASSC_OBJ_TABLE_ACC_COLUMN_NAME,
  ASSC_OBJ_TABLE_SEARCH_HINT,
  ASSC_OBJ_PANEL_TITLE,
  ASSC_OBJ_PANEL_DESRIPTION,
  ASSC_OBJ_FRESH_MSG,
  ASSC_OBJ_TABLE_SUBJ,
} from './utils/associated_objects_tab_utils';
import { DatasourceDetails } from '../data_connection';
import { DirectQueryLoadingStatus } from '../../../../../../common/types/explorer';
import { AssociatedObjectsTabEmpty } from './utils/associated_objects_tab_empty';
import { AssociatedObjectsTabLoading } from './utils/associated_objects_tab_loading';
import { AssociatedObjectsRefreshButton } from './utils/associated_objects_refresh_button';

export interface AssociatedObjectsTabProps {
  datasource: DatasourceDetails;
  cachedDatabases: CachedDatabase[];
  databasesLoadStatus: DirectQueryLoadingStatus;
  loadDatabases: () => void;
  databasesIsLoading: boolean;
  selectedDatabase: string;
  setSelectedDatabase: React.Dispatch<React.SetStateAction<string>>;
  cachedTables: CachedTable[];
  tablesLoadStatus: DirectQueryLoadingStatus;
  startLoadingTables: (datasource: string, database?: string) => void;
  tablesIsLoading: boolean;
  cachedAccelerations: CachedAcceleration[];
  accelerationsLoadStatus: DirectQueryLoadingStatus;
  startLoadingAccelerations: (datasource: string) => void;
  accelerationsIsLoading: boolean;
  isFirstTimeLoading: boolean;
  isRefreshing: boolean;
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

export const AssociatedObjectsTab: React.FC<AssociatedObjectsTabProps> = (props) => {
  const {
    datasource,
    cachedDatabases,
    databasesLoadStatus,
    loadDatabases,
    // databasesIsLoading,
    selectedDatabase,
    setSelectedDatabase,
    cachedTables,
    tablesLoadStatus,
    startLoadingTables,
    tablesIsLoading,
    cachedAccelerations,
    accelerationsLoadStatus,
    startLoadingAccelerations,
    accelerationsIsLoading,
    isFirstTimeLoading,
    isRefreshing,
  } = props;
  const [lastUpdated, setLastUpdated] = useState('');
  setLastUpdated(Date.now().toUTCString()); // Update last updated time

  const onRefreshButtonClick = () => {
    console.log('clicked on name');
    if (datasource.name) {
      loadDatabases();
    }
  };

  const AssociatedObjectsHeader = () => {
    const panelTitle = i18n.translate('datasources.associatedObjectsTab.panelTitle', {
      defaultMessage: ASSC_OBJ_PANEL_TITLE,
    });

    const panelDescription = i18n.translate('datasources.associatedObjectsTab.panelDescription', {
      defaultMessage: ASSC_OBJ_PANEL_DESRIPTION,
    });

    const LastUpdatedText = () => {
      return (
        <>
          <EuiText textAlign="right" size="xs" color="subdued">
            {ASSC_OBJ_FRESH_MSG}
          </EuiText>
          <EuiText textAlign="right" size="xs" color="subdued">
            {lastUpdated}
          </EuiText>
        </>
      );
    };

    return (
      <EuiFlexGroup direction="row" alignItems="center">
        <EuiFlexItem>
          <EuiText size="m">
            <h2 className="panel-title">{panelTitle}</h2>
            {panelDescription}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <LastUpdatedText />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <AssociatedObjectsRefreshButton isLoading={isRefreshing} onClick={onRefreshButtonClick} />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  const DatabaseSelector = () => {
    const [databaseOptions, setDatabaseOptions] = useState(
      cachedDatabases.map((database, index) => {
        return { label: database.name, checked: index === 0 ? 'on' : undefined };
      })
    );

    useEffect(() => {
      setSelectedDatabase(databaseOptions.find((option) => option.checked === 'on')?.label);
    }, [databaseOptions]);

    return (
      <>
        <EuiSelectable
          searchable={true}
          singleSelection="always"
          searchProps={{ placeholder: 'Search for databases' }}
          options={databaseOptions}
          onChange={(newOptions) => setDatabaseOptions(newOptions)}
        >
          {(list, search) => (
            <>
              {search}
              {list}
            </>
          )}
        </EuiSelectable>
      </>
    );
  };

  const AssociatedObjectsTable = () => {
    const [databaseFilterOptions, setDatabaseFilterOptions] = useState<FilterOption[]>([]);
    const [accelerationFilterOptions, setAccelerationFilterOptions] = useState<FilterOption[]>([]);
    const [filteredObjects, setFilteredObjects] = useState<AssociatedObject[]>([]);
    const [associatedObjects, setAssociatedObjects] = useState<AssociatedObject[]>([]);

    const columns = [
      {
        field: 'name',
        name: i18n.translate('datasources.associatedObjectsTab.column.name', {
          defaultMessage: 'Name',
        }),
        sortable: true,
        'data-test-subj': 'nameCell',
        render: (name: string, item: AssociatedObject) => (
          <EuiLink
            onClick={() => {
              if (item.type === 'Table') {
                renderAssociatedObjectsDetailsFlyout(item);
              } else {
                renderAccelerationDetailsFlyout(item.accelerations[0]);
              }
            }}
          >
            {name}
          </EuiLink>
        ),
      },
      {
        field: 'database',
        name: i18n.translate('datasources.associatedObjectsTab.column.database', {
          defaultMessage: 'Database',
        }),
        sortable: true,
      },
      {
        field: 'type',
        name: i18n.translate('datasources.associatedObjectsTab.column.type', {
          defaultMessage: 'Type',
        }),
        sortable: true,
      },
      {
        field: 'createdByIntegration',
        name: i18n.translate('datasources.associatedObjectsTab.column.createdByIntegration', {
          defaultMessage: 'Created by Integration',
        }),
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
        name: i18n.translate('datasources.associatedObjectsTab.column.accelerations', {
          defaultMessage: 'Accelerations',
        }),
        sortable: true,
        render: (accelerations: string[]) => {
          return accelerations.length > 0
            ? accelerations.map((acceleration, index) => (
                <React.Fragment key={index}>
                  <EuiLink onClick={() => renderAccelerationDetailsFlyout(acceleration)}>
                    {acceleration.name}
                  </EuiLink>
                  {index < accelerations.length - 1 ? ', ' : ''}
                </React.Fragment>
              ))
            : '-';
        },
      },
      {
        name: i18n.translate('datasources.associatedObjectsTab.column.actions', {
          defaultMessage: 'Actions',
        }),
        actions: [
          {
            name: i18n.translate('datasources.associatedObjectsTab.action.discover.name', {
              defaultMessage: 'Discover',
            }),
            description: i18n.translate(
              'datasources.associatedObjectsTab.action.discover.description',
              {
                defaultMessage: 'Discover this object',
              }
            ),
            type: 'icon',
            icon: 'discoverApp',
            onClick: (item: AssociatedObject) => console.log('Discover', item),
          },
          {
            name: i18n.translate('datasources.associatedObjectsTab.action.accelerate.name', {
              defaultMessage: 'Accelerate',
            }),
            description: i18n.translate(
              'datasources.associatedObjectsTab.action.accelerate.description',
              {
                defaultMessage: 'Accelerate this object',
              }
            ),
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

      const matchesClauses = (obj: AssociatedObject, clauses: AssociatedTableFilter[]): boolean => {
        if (clauses.length === 0) return true;

        return clauses.some((clause) => {
          if (clause.field !== ASSC_OBJ_TABLE_ACC_COLUMN_NAME) {
            return obj[clause.field] === clause.value;
          } else if (
            clause.field === ASSC_OBJ_TABLE_ACC_COLUMN_NAME &&
            Array.isArray(obj.accelerations)
          ) {
            return obj.accelerations.some((acceleration) => acceleration.name === clause.value);
          }

          return false;
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

    const tableSearch = {
      filters: searchFilters,
      box: {
        incremental: true,
        placeholder: ASSC_OBJ_TABLE_SEARCH_HINT,
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

    const getAccelerationType = (type: AccelerationIndexType) => {
      switch (type) {
        case 'skipping':
          return 'Skipping Index';
        case 'covering':
          return 'Covering Index';
        case 'materialized':
          return 'Materialized View';
      }
    };

    useEffect(() => {
      const tableObjects: AssociatedObject[] = cachedTables.map((table: CachedTable) => {
        return {
          datasource: datasource.name,
          id: table.name,
          name: table.name,
          database: selectedDatabase,
          type: 'table',
          createdByIntegration: 'N/A',
          // Temporary dummy array
          accelerations: [],
          columns: table.columns,
        };
      });
      const accelerationObjects: AssociatedObject[] = cachedAccelerations.map(
        (acceleration: CachedAcceleration) => ({
          datasource: datasource.name,
          id: acceleration.flintIndexName,
          name: acceleration.flintIndexName,
          database: selectedDatabase,
          type: getAccelerationType(acceleration.type),
          createdByIntegration: '-',
          // Temporary dummy array
          accelerations: [],
          columns: undefined,
        })
      );
      setAssociatedObjects(tableObjects.concat(accelerationObjects));
    }, [cachedTables, cachedAccelerations]);

    useEffect(() => {
      const databaseOptions = Array.from(new Set(associatedObjects.map((obj) => obj.database)))
        .sort()
        .map((database) => ({ value: database, text: database }));
      setDatabaseFilterOptions(databaseOptions);

      const accelerationOptions = Array.from(
        new Set(
          associatedObjects
            .flatMap((obj) => obj.accelerations.map((acceleration) => acceleration.name))
            .filter(Boolean)
        )
      )
        .sort()
        .map((name) => ({ value: name, text: name }));
      setAccelerationFilterOptions(accelerationOptions);

      setFilteredObjects(associatedObjects);
    }, [associatedObjects]);

    return (
      <EuiInMemoryTable
        items={filteredObjects}
        columns={columns}
        search={tableSearch}
        pagination={pagination}
        sorting={sorting}
        // noItemsMessage={associatedObjects.length === 0 ? noDataMessage : undefined}
        data-test-subj={ASSC_OBJ_TABLE_SUBJ}
      />
    );
  };

  useEffect(() => {
    if (selectedDatabase) {
      startLoadingTables(datasource.name, selectedDatabase);
      startLoadingAccelerations(datasource.name);
    }
  }, [selectedDatabase]);

  const renderAccelerationDetailsFlyout = getRenderAccelerationDetailsFlyout();
  const renderAssociatedObjectsDetailsFlyout = getRenderAssociatedObjectsDetailsFlyout();

  return (
    <>
      <EuiSpacer />
      <EuiPanel>
        <AssociatedObjectsHeader />
        <EuiHorizontalRule />
        {isFirstTimeLoading ? (
          <AssociatedObjectsTabLoading objectType="databases" warningMessage={false} />
        ) : (
          <>
            {databasesLoadStatus === DirectQueryLoadingStatus.SUCCESS &&
            cachedDatabases.length === 0 ? (
              <AssociatedObjectsTabEmpty cacheType="databases" />
            ) : (
              <>
                <AccelerationsRecommendationCallout />
                <EuiSpacer />
                <EuiFlexGroup direction="row">
                  <EuiFlexItem grow={false}>
                    <DatabaseSelector />
                  </EuiFlexItem>
                  <EuiFlexItem>
                    {tablesIsLoading || accelerationsIsLoading ? (
                      <AssociatedObjectsTabLoading objectType="tables" warningMessage={true} />
                    ) : (
                      <>
                        {tablesLoadStatus === DirectQueryLoadingStatus.SUCCESS &&
                        accelerationsLoadStatus === DirectQueryLoadingStatus.SUCCESS &&
                        (cachedTables.length === 0 || cachedAccelerations.length === 0) ? (
                          <AssociatedObjectsTabEmpty cacheType="tables" />
                        ) : (
                          <AssociatedObjectsTable />
                        )}
                      </>
                    )}
                  </EuiFlexItem>
                </EuiFlexGroup>
              </>
            )}
          </>
        )}
      </EuiPanel>
      <EuiSpacer />
    </>
  );
};
