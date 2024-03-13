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
  isTablesCacheUpdated,
  isAccelerationsCacheUpdated,
  isDatabasesCacheUpdated,
} from './utils/associated_objects_tab_utils';
import { DatasourceDetails } from '../data_connection';
import { DirectQueryLoadingStatus } from '../../../../../../common/types/explorer';
import { AssociatedObjectsTabEmpty } from './utils/associated_objects_tab_empty';
import { AssociatedObjectsTabLoading } from './utils/associated_objects_tab_loading';
import { AssociatedObjectsRefreshButton } from './utils/associated_objects_refresh_button';
import { CatalogCacheManager } from '../../../../../../public/framework/catalog_cache/cache_manager';

export interface AssociatedObjectsTabProps {
  datasource: DatasourceDetails;
  databasesLoadStatus: DirectQueryLoadingStatus;
  startLoadingDatabases: (datasource: string) => void;
  cachedDatabases: CachedDatabase[];
  selectedDatabase: string;
  setSelectedDatabase: React.Dispatch<React.SetStateAction<string>>;
  tablesLoadStatus: DirectQueryLoadingStatus;
  startLoadingTables: (datasource: string, database?: string) => void;
  accelerationsLoadStatus: DirectQueryLoadingStatus;
  startLoadingAccelerations: (datasource: string) => void;
  isFirstTimeLoading: boolean;
  isRefreshing: boolean;
  setIsRefreshing: React.Dispatch<React.SetStateAction<boolean>>;
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
    databasesLoadStatus,
    startLoadingDatabases,
    cachedDatabases,
    selectedDatabase,
    setSelectedDatabase,
    tablesLoadStatus,
    startLoadingTables,
    accelerationsLoadStatus,
    startLoadingAccelerations,
    isFirstTimeLoading,
    isRefreshing,
    setIsRefreshing,
  } = props;
  const [lastUpdated, setLastUpdated] = useState(new Date().toLocaleString());
  const [isObjectsLoading, setIsObjectsLoading] = useState<boolean>(false);
  const [cachedTables, setCachedTables] = useState<CachedTable[]>([]);
  const [cachedAccelerations, setCachedAccelerations] = useState<CachedAcceleration[]>([]);

  let lastChecked: boolean;
  if (selectedDatabase !== '') {
    lastChecked = true;
  } else {
    lastChecked = false;
  }
  // Get last selected if there is one, set to first option if not
  const [databaseSelectorOptions, setDatabaseSelectorOptions] = useState(
    cachedDatabases.map((database, index) => {
      return {
        label: database.name,
        checked: lastChecked
          ? database.name === selectedDatabase
            ? 'on'
            : index === 0
            ? 'on'
            : undefined
          : undefined,
      };
    })
  );

  const onRefreshButtonClick = () => {
    console.log('clicked on refresh button, i will update implementation later');
    CatalogCacheManager.clearAccelerationsCache();
    CatalogCacheManager.clearDataSourceCache();
    startLoadingDatabases(datasource.name);
    setIsRefreshing(true);
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
      console.log('component mounted');
      console.log(
        'cached accelerations',
        cachedAccelerations.filter(
          (acceleration: CachedAcceleration) => acceleration.database === selectedDatabase
        )
      );
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
      const accelerationObjects: AssociatedObject[] = cachedAccelerations
        .filter((acceleration: CachedAcceleration) => acceleration.database === selectedDatabase)
        .map((acceleration: CachedAcceleration) => ({
          datasource: datasource.name,
          id: acceleration.flintIndexName,
          name: acceleration.flintIndexName,
          database: selectedDatabase,
          type: getAccelerationType(acceleration.type),
          createdByIntegration: '-',
          // Temporary dummy array
          accelerations: [],
          columns: undefined,
        }));
      console.log(accelerationObjects);
      setAssociatedObjects([...tableObjects, ...accelerationObjects]);
    }, []);

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

      return () => {
        console.log('component unmounted');
      };
    }, [associatedObjects]);

    return (
      <EuiInMemoryTable
        items={filteredObjects}
        columns={columns}
        search={tableSearch}
        pagination={pagination}
        sorting={sorting}
        data-test-subj={ASSC_OBJ_TABLE_SUBJ}
      />
    );
  };

  useEffect(() => {
    // Reload tables and accelerations to cache if nothing in cache
    console.log('in here');
    if (selectedDatabase && isDatabasesCacheUpdated(datasource.name)) {
      const tablesCache = isTablesCacheUpdated(datasource.name, selectedDatabase);
      const accelerationsCache = isAccelerationsCacheUpdated();
      console.log(
        'tablesCache',
        tablesCache,
        'accelerationsCache',
        accelerationsCache,
        'isRefreshing',
        isRefreshing
      );
      if (!tablesCache || !accelerationsCache) {
        console.log('either tables or accelerations cache not updated');
        if (!tablesCache) {
          startLoadingTables(datasource.name, selectedDatabase);
        }
        if (!accelerationsCache) startLoadingAccelerations(datasource.name);
        setIsObjectsLoading(true);
      } else if (tablesCache && accelerationsCache) {
        console.log('tables and acceleration cache are updated');
        setCachedTables(CatalogCacheManager.getDatabase(datasource.name, selectedDatabase).tables);
        setCachedAccelerations(CatalogCacheManager.getAccelerationsCache().accelerations);
        setLastUpdated(
          CatalogCacheManager.getDatabase(datasource.name, selectedDatabase).lastUpdated
        );
        if (
          tablesLoadStatus === DirectQueryLoadingStatus.SUCCESS &&
          accelerationsLoadStatus === DirectQueryLoadingStatus.SUCCESS
        ) {
          setIsRefreshing(false);
        }
        setIsObjectsLoading(false);
      }
    }
  }, [
    isRefreshing,
    selectedDatabase,
    databasesLoadStatus,
    tablesLoadStatus,
    accelerationsLoadStatus,
  ]);

  useEffect(() => {
    setSelectedDatabase(databaseSelectorOptions.find((option) => option.checked === 'on')?.label);
  }, [databaseSelectorOptions]);

  useEffect(() => {
    setDatabaseSelectorOptions(
      cachedDatabases.map((database, index) => {
        if (selectedDatabase) {
          return {
            label: database.name,
            checked: database.name === selectedDatabase ? 'on' : undefined,
          };
        }
        return {
          label: database.name,
          checked: index === 0 ? 'on' : undefined,
        };
      })
    );
  }, [cachedDatabases]);

  useEffect(() => {
    console.log('selectedDatabase', selectedDatabase);
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
            {isDatabasesCacheUpdated(datasource.name) && cachedDatabases.length === 0 ? (
              <AssociatedObjectsTabEmpty cacheType="databases" />
            ) : (
              <>
                <AccelerationsRecommendationCallout />
                <EuiSpacer />
                <EuiFlexGroup direction="row">
                  <EuiFlexItem grow={false}>
                    <EuiSelectable
                      searchable={true}
                      singleSelection="always"
                      searchProps={{ placeholder: 'Search for databases' }}
                      options={databaseSelectorOptions}
                      onChange={(newOptions) => setDatabaseSelectorOptions(newOptions)}
                    >
                      {(list, search) => (
                        <>
                          {search}
                          {list}
                        </>
                      )}
                    </EuiSelectable>
                  </EuiFlexItem>
                  <EuiFlexItem>
                    {isObjectsLoading ? (
                      <AssociatedObjectsTabLoading objectType="tables" warningMessage={true} />
                    ) : (
                      <>
                        {cachedTables.length === 0 || cachedAccelerations.length === 0 ? (
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
