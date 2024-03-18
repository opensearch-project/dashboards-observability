/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import _ from 'lodash';
import {
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiHorizontalRule,
  EuiSpacer,
  EuiSelectable,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { ACCELERATION_INDEX_TYPES } from '../../../../../../common/constants/data_sources';
import {
  AssociatedObject,
  CachedAcceleration,
  CachedAccelerationByDataSource,
  CachedDataSourceStatus,
  CachedDatabase,
  CachedTable,
  DatasourceDetails,
} from '../../../../../../common/types/data_connections';
import { AccelerationsRecommendationCallout } from './accelerations_recommendation_callout';
import {
  ASSC_OBJ_PANEL_TITLE,
  ASSC_OBJ_PANEL_DESCRIPTION,
  ASSC_OBJ_FRESH_MSG,
  isCatalogCacheFetching,
} from './utils/associated_objects_tab_utils';
import { DirectQueryLoadingStatus } from '../../../../../../common/types/explorer';
import { AssociatedObjectsTabEmpty } from './utils/associated_objects_tab_empty';
import { AssociatedObjectsTabLoading } from './utils/associated_objects_tab_loading';
import { AssociatedObjectsRefreshButton } from './utils/associated_objects_refresh_button';
import { CatalogCacheManager } from '../../../../../../public/framework/catalog_cache/cache_manager';
import { AssociatedObjectsTable } from './modules/associated_objects_table';
import { getAccelerationName } from '../accelerations/utils/acceleration_utils';

export interface AssociatedObjectsTabProps {
  datasource: DatasourceDetails;
  cacheLoadingHooks: any;
  selectedDatabase: string;
  setSelectedDatabase: React.Dispatch<React.SetStateAction<string>>;
}

export const AssociatedObjectsTab: React.FC<AssociatedObjectsTabProps> = (props) => {
  const { datasource, cacheLoadingHooks, selectedDatabase, setSelectedDatabase } = props;
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState(new Date().toLocaleString());
  const [isObjectsLoading, setIsObjectsLoading] = useState<boolean>(false);
  const [cachedDatabases, setCachedDatabases] = useState<CachedDatabase[]>([]);
  const [cachedTables, setCachedTables] = useState<CachedTable[]>([]);
  const [cachedAccelerations, setCachedAccelerations] = useState<CachedAcceleration[]>([]);
  const [associatedObjects, setAssociatedObjects] = useState<AssociatedObject[]>([]);
  const [isFirstTimeLoading, setIsFirstTimeLoading] = useState<boolean>(true);

  const {
    databasesLoadStatus,
    startLoadingDatabases,
    tablesLoadStatus,
    startLoadingTables,
    accelerationsLoadStatus,
    startLoadingAccelerations,
  } = cacheLoadingHooks;

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
    if (!isCatalogCacheFetching(databasesLoadStatus, tablesLoadStatus, accelerationsLoadStatus)) {
      startLoadingDatabases(datasource.name);
      startLoadingAccelerations(datasource.name);
      setIsRefreshing(true);
    }
  };

  const AssociatedObjectsHeader = () => {
    const panelTitle = i18n.translate('datasources.associatedObjectsTab.panelTitle', {
      defaultMessage: ASSC_OBJ_PANEL_TITLE,
    });

    const panelDescription = i18n.translate('datasources.associatedObjectsTab.panelDescription', {
      defaultMessage: ASSC_OBJ_PANEL_DESCRIPTION,
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
          <AssociatedObjectsRefreshButton
            isLoading={
              isRefreshing ||
              isCatalogCacheFetching(databasesLoadStatus, tablesLoadStatus, accelerationsLoadStatus)
            }
            onClick={onRefreshButtonClick}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  // Load databases if empty or retrieve from cache if updated
  useEffect(() => {
    if (datasource.name) {
      const datasourceCache = CatalogCacheManager.getOrCreateDataSource(datasource.name);
      if (
        datasourceCache.status === CachedDataSourceStatus.Empty &&
        !isCatalogCacheFetching(databasesLoadStatus)
      ) {
        startLoadingDatabases(datasource.name);
      } else if (datasourceCache.status === CachedDataSourceStatus.Updated) {
        setCachedDatabases(datasourceCache.databases);
        setIsFirstTimeLoading(false);
      }
    }
  }, [datasource.name]);

  // Retrieve from cache upon load success
  useEffect(() => {
    const status = databasesLoadStatus.toLowerCase();
    const datasourceCache = CatalogCacheManager.getOrCreateDataSource(datasource.name);
    if (status === DirectQueryLoadingStatus.SUCCESS) {
      setCachedDatabases(datasourceCache.databases);
      setIsFirstTimeLoading(false);
    }
  }, [datasource.name, databasesLoadStatus]);

  const handleObjectsLoad = (
    databaseCache: CachedDatabase,
    accelerationsCache: CachedAccelerationByDataSource
  ) => {
    if (
      databaseCache.status === CachedDataSourceStatus.Updated &&
      accelerationsCache.status === CachedDataSourceStatus.Updated
    ) {
      setLastUpdated(new Date(databaseCache.lastUpdated).toLocaleString());
      setIsRefreshing(false);
      setIsObjectsLoading(false);
    }
  };

  // Load tables and accelerations if empty or retrieve from cache if not
  useEffect(() => {
    if (datasource.name && selectedDatabase) {
      const databaseCache = CatalogCacheManager.getDatabase(datasource.name, selectedDatabase);
      const accelerationsCache = CatalogCacheManager.getOrCreateAccelerationsByDataSource(
        datasource.name
      );
      if (
        databaseCache.status === CachedDataSourceStatus.Empty &&
        !isCatalogCacheFetching(tablesLoadStatus)
      ) {
        startLoadingTables(datasource.name, selectedDatabase);
        setIsObjectsLoading(true);
      } else if (databaseCache.status === CachedDataSourceStatus.Updated) {
        setCachedTables(databaseCache.tables);
      }
      if (
        accelerationsCache.status === CachedDataSourceStatus.Empty &&
        !isCatalogCacheFetching(accelerationsLoadStatus)
      ) {
        startLoadingAccelerations(datasource.name);
        setIsObjectsLoading(true);
      } else if (accelerationsCache.status === CachedDataSourceStatus.Updated) {
        setCachedAccelerations(accelerationsCache.accelerations);
      }
    }
  }, [datasource.name, selectedDatabase, databaseSelectorOptions]);

  // Retrieve from tables cache upon load success
  useEffect(() => {
    if (datasource.name && selectedDatabase) {
      const tablesStatus = tablesLoadStatus.toLowerCase();
      const databaseCache = CatalogCacheManager.getDatabase(datasource.name, selectedDatabase);
      const accelerationsStatus = accelerationsLoadStatus.toLowerCase();
      const accelerationsCache = CatalogCacheManager.getOrCreateAccelerationsByDataSource(
        datasource.name
      );
      if (tablesStatus === DirectQueryLoadingStatus.SUCCESS) {
        setCachedTables(databaseCache.tables);
      }
      if (accelerationsStatus === DirectQueryLoadingStatus.SUCCESS) {
        setCachedAccelerations(accelerationsCache.accelerations);
      }
      handleObjectsLoad(databaseCache, accelerationsCache);
    }
  }, [datasource.name, selectedDatabase, tablesLoadStatus, accelerationsLoadStatus]);

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
    setSelectedDatabase((prevState) => {
      const select = databaseSelectorOptions.find((option) => option.checked === 'on')?.label;
      if (select) {
        return select;
      }
      return prevState;
    });
  }, [databaseSelectorOptions]);

  useEffect(() => {
    const tableObjects: AssociatedObject[] = cachedTables.map((table: CachedTable) => {
      return {
        datasource: datasource.name,
        id: table.name,
        name: table.name,
        database: selectedDatabase,
        type: 'table',
        accelerations: cachedAccelerations.filter(
          (acceleration) => acceleration.table === table.name
        ),
        columns: table.columns,
      };
    });
    const accelerationObjects: AssociatedObject[] = cachedAccelerations
      .filter((acceleration: CachedAcceleration) => acceleration.database === selectedDatabase)
      .map((acceleration: CachedAcceleration) => ({
        datasource: datasource.name,
        id: acceleration.indexName,
        name: getAccelerationName(acceleration, datasource.name),
        database: acceleration.database,
        type: ACCELERATION_INDEX_TYPES.find((accelType) => accelType.value === acceleration.type)!
          .value,
        // Temporary dummy array
        accelerations: [],
        columns: undefined,
      }));
    setAssociatedObjects([...tableObjects, ...accelerationObjects]);
  }, [selectedDatabase, cachedTables, cachedAccelerations]);

  return (
    <>
      <EuiSpacer />
      <AccelerationsRecommendationCallout />
      <EuiSpacer />
      <EuiPanel>
        <AssociatedObjectsHeader />
        <EuiHorizontalRule />
        {isFirstTimeLoading ? (
          <AssociatedObjectsTabLoading objectType="databases" warningMessage={false} />
        ) : (
          <>
            {cachedDatabases.length === 0 ? (
              <AssociatedObjectsTabEmpty cacheType="databases" />
            ) : (
              <>
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
                    {isObjectsLoading && isFirstTimeLoading ? (
                      <AssociatedObjectsTabLoading objectType="tables" warningMessage={true} />
                    ) : (
                      <>
                        {cachedTables.length > 0 || cachedAccelerations.length > 0 ? (
                          <AssociatedObjectsTable
                            datasourceName={datasource.name}
                            associatedObjects={associatedObjects}
                            cachedAccelerations={cachedAccelerations}
                          />
                        ) : (
                          <AssociatedObjectsTabEmpty cacheType="tables" />
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
