/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiTitle,
  EuiSelectable,
  EuiSelectableOption,
  EuiSpacer,
  EuiBasicTableColumn,
  EuiInMemoryTable,
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiCopy,
  EuiButtonIcon,
} from '@elastic/eui';
import {
  useLoadDatabasesToCache,
  useLoadTablesToCache,
} from '../../../../framework/catalog_cache/cache_loader';
import { CatalogCacheManager } from '../../../../framework/catalog_cache/cache_manager';
import {
  CachedDataSourceStatus,
  CachedDatabase,
  CachedTable,
} from '../../../../../common/types/data_connections';
import { isCatalogCacheFetching } from '../../../datasources/components/manage/associated_objects/utils/associated_objects_tab_utils';
import { DirectQueryLoadingStatus } from '../../../../../common/types/explorer';
import { useToast } from '../../../common/toast';
import { AssociatedObjectsTabLoading } from '../../../datasources/components/manage/associated_objects/utils/associated_objects_tab_loading';
import { AssociatedObjectsTabFailure } from '../../../datasources/components/manage/associated_objects/utils/associated_objects_tab_failure';
import { AssociatedObjectsTabEmpty } from '../../../datasources/components/manage/associated_objects/utils/associated_objects_tab_empty';

export interface TablesFlyoutProps {
  dataSourceName: string;
  resetFlyout: () => void;
}

interface TableItemType {
  name: string;
  type: string;
}

export const TablesFlyout = ({ dataSourceName, resetFlyout }: TablesFlyoutProps) => {
  const { setToast } = useToast();
  const {
    loadStatus: databasesLoadStatus,
    startLoading: startLoadingDatabases,
  } = useLoadDatabasesToCache();
  const { loadStatus: tablesLoadStatus, startLoading: startLoadingTables } = useLoadTablesToCache();

  const [selectedDatabase, setSelectedDatabase] = useState<string>('');
  const [isObjectsLoading, setIsObjectsLoading] = useState<boolean>(false);
  const [cachedDatabases, setCachedDatabases] = useState<CachedDatabase[]>([]);
  const [cachedTables, setCachedTables] = useState<CachedTable[]>([]);
  const [tables, setTables] = useState<TableItemType[]>([]);
  const [isFirstTimeLoading, setIsFirstTimeLoading] = useState<boolean>(true);
  const [databasesLoadFailed, setDatabasesLoadFailed] = useState<boolean>(false);
  const [associatedObjectsLoadFailed, setAssociatedObjectsLoadFailed] = useState<boolean>(false);

  const lastChecked: boolean = selectedDatabase !== '';

  // Get last selected if there is one, set to first option if not
  const [databaseSelectorOptions, setDatabaseSelectorOptions] = useState<
    Array<EuiSelectableOption<any>>
  >(
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

  // Load databases if empty or retrieve from cache if updated
  useEffect(() => {
    if (dataSourceName) {
      const datasourceCache = CatalogCacheManager.getOrCreateDataSource(dataSourceName);
      if (
        (datasourceCache.status === CachedDataSourceStatus.Empty ||
          datasourceCache.status === CachedDataSourceStatus.Failed) &&
        !isCatalogCacheFetching(databasesLoadStatus)
      ) {
        startLoadingDatabases({ dataSourceName });
      } else if (datasourceCache.status === CachedDataSourceStatus.Updated) {
        setCachedDatabases(datasourceCache.databases);
        setIsFirstTimeLoading(false);
      }
    }
  }, [dataSourceName]);

  // Retrieve from cache upon load success
  useEffect(() => {
    const status = databasesLoadStatus.toLowerCase();
    const datasourceCache = CatalogCacheManager.getOrCreateDataSource(dataSourceName);
    if (status === DirectQueryLoadingStatus.SUCCESS) {
      setCachedDatabases(datasourceCache.databases);
      setIsFirstTimeLoading(false);
    } else if (
      status === DirectQueryLoadingStatus.FAILED ||
      status === DirectQueryLoadingStatus.CANCELED
    ) {
      setDatabasesLoadFailed(true);
      setIsFirstTimeLoading(false);
    }
  }, [dataSourceName, databasesLoadStatus]);

  const handleObjectsLoad = (databaseCache: CachedDatabase) => {
    if (databaseCache.status === CachedDataSourceStatus.Updated) {
      setIsObjectsLoading(false);
    }
  };

  // Load tables if empty or retrieve from cache if not
  useEffect(() => {
    if (dataSourceName && selectedDatabase) {
      let databaseCache;
      try {
        databaseCache = CatalogCacheManager.getDatabase(dataSourceName, selectedDatabase);
      } catch (error) {
        console.error(error);
        setToast('Your cache is outdated, refresh databases and tables', 'warning');
        return;
      }
      if (
        (databaseCache.status === CachedDataSourceStatus.Empty ||
          databaseCache.status === CachedDataSourceStatus.Failed) &&
        !isCatalogCacheFetching(tablesLoadStatus)
      ) {
        startLoadingTables({ dataSourceName, databaseName: selectedDatabase });
        setIsObjectsLoading(true);
      } else if (databaseCache.status === CachedDataSourceStatus.Updated) {
        setCachedTables(databaseCache.tables);
      }
    }
  }, [dataSourceName, selectedDatabase, databaseSelectorOptions]);

  // Retrieve from tables cache upon load success
  useEffect(() => {
    if (dataSourceName && selectedDatabase) {
      const tablesStatus = tablesLoadStatus.toLowerCase();
      let databaseCache;
      try {
        databaseCache = CatalogCacheManager.getDatabase(dataSourceName, selectedDatabase);
      } catch (error) {
        console.error(error);
        setToast('Your cache is outdated, refresh databases and tables', 'warning');
        return;
      }

      if (tablesStatus === DirectQueryLoadingStatus.SUCCESS) {
        setCachedTables(databaseCache.tables);
      } else if (
        tablesStatus === DirectQueryLoadingStatus.FAILED ||
        tablesStatus === DirectQueryLoadingStatus.CANCELED
      ) {
        setAssociatedObjectsLoadFailed(true);
        setIsObjectsLoading(false);
      }
      handleObjectsLoad(databaseCache);
    }
  }, [dataSourceName, selectedDatabase, tablesLoadStatus]);

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
    const tableObjects: TableItemType[] = cachedTables.map((table: CachedTable) => {
      return {
        name: table.name,
        type: 'table',
      };
    });
    setTables(tableObjects);
  }, [selectedDatabase, cachedTables]);

  const columns: Array<EuiBasicTableColumn<TableItemType>> = [
    {
      field: 'name',
      name: 'Name',
      sortable: true,
    },
    {
      field: 'type',
      name: 'Type',
      sortable: true,
    },
    {
      actions: [
        {
          name: 'Add to query',
          description: 'Add table to the query.',
          render: ({ name }: TableItemType) => {
            return (
              <EuiCopy textToCopy={`${dataSourceName}.${selectedDatabase}.${name}`}>
                {(copy) => (
                  <EuiButtonIcon aria-label="copy-button" onClick={copy} iconType="copyClipboard" />
                )}
              </EuiCopy>
            );
          },
        },
      ],
    },
  ];

  const tableSearch = {
    box: {
      incremental: true,
      placeholder: 'Search',
      schema: {
        fields: { name: { type: 'string' }, database: { type: 'string' } },
      },
    },
  };

  return (
    <EuiFlyout onClose={resetFlyout}>
      <EuiFlyoutHeader hasBorder={true}>
        <EuiTitle>
          <h1>{dataSourceName}</h1>
        </EuiTitle>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <EuiTitle size="m">
          <h2>Databases</h2>
        </EuiTitle>
        <EuiSpacer />
        {isFirstTimeLoading ? (
          <AssociatedObjectsTabLoading objectType="databases" warningMessage={false} />
        ) : databasesLoadFailed ? (
          <AssociatedObjectsTabFailure type="databases" />
        ) : (
          <>
            {cachedDatabases.length === 0 ? (
              <AssociatedObjectsTabEmpty cacheType="databases" />
            ) : (
              <>
                <EuiSpacer size="xs" />
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
                <EuiSpacer />
                <EuiTitle size="m">
                  <h2>Tables</h2>
                </EuiTitle>
                <EuiSpacer />
                {isFirstTimeLoading || isObjectsLoading ? (
                  <AssociatedObjectsTabLoading objectType="tables" warningMessage={true} />
                ) : associatedObjectsLoadFailed ? (
                  <AssociatedObjectsTabFailure type="objects" />
                ) : (
                  <>
                    {cachedTables.length > 0 ? (
                      <EuiInMemoryTable
                        items={tables}
                        columns={columns}
                        search={tableSearch}
                        pagination={true}
                        hasActions={true}
                        tableLayout="auto"
                        data-test-subj={'log-explorer-tables-flyout'}
                      />
                    ) : (
                      <AssociatedObjectsTabEmpty cacheType="tables" />
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="flexEnd">
          <EuiFlexItem grow={false}>
            <EuiButton color="primary" fill onClick={resetFlyout}>
              Close
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
