/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CATALOG_CACHE_VERSION } from '../../../common/constants/data_sources';
import { CachedDataSourceStatus } from '../../../common/types/data_connections';
import {
  mockShowDatabasesPollingResult,
  mockShowIndexesPollingResult,
  mockShowTablesPollingResult,
} from '../../../test/datasources';
import {
  updateAccelerationsToCache,
  updateDatabasesToCache,
  updateTablesToCache,
} from './cache_loader';
import { CatalogCacheManager } from './cache_manager';

interface LooseObject {
  [key: string]: any;
}

// Mock localStorage
const localStorageMock = (() => {
  let store = {} as LooseObject;
  return {
    getItem(key: string) {
      return store[key] || null;
    },
    setItem(key: string, value: string) {
      store[key] = value.toString();
    },
    removeItem(key: string) {
      delete store[key];
    },
    clear() {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('loadCacheTests', () => {
  beforeEach(() => {
    jest.spyOn(window.localStorage, 'setItem');
    jest.spyOn(window.localStorage, 'getItem');
    jest.spyOn(window.localStorage, 'removeItem');
    jest.spyOn(CatalogCacheManager, 'addOrUpdateDataSource');
    jest.spyOn(CatalogCacheManager, 'updateDatabase');
    jest.spyOn(CatalogCacheManager, 'saveAccelerationsCache');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('updateDatabasesToCache', () => {
    it('should update cache with empty databases and status failed when polling result is null', () => {
      const dataSourceName = 'TestDataSource';
      const pollingResult = null;

      updateDatabasesToCache(dataSourceName, pollingResult);

      // Verify that addOrUpdateDataSource is called with the correct parameters
      expect(CatalogCacheManager.addOrUpdateDataSource).toHaveBeenCalledWith({
        name: dataSourceName,
        databases: [],
        lastUpdated: expect.any(String),
        status: CachedDataSourceStatus.Failed,
      });
    });

    it('should update cache with new databases when polling result is not null', () => {
      const dataSourceName = 'TestDataSource';
      updateDatabasesToCache(dataSourceName, mockShowDatabasesPollingResult);

      // Verify that addOrUpdateDataSource is called with the correct parameters
      expect(CatalogCacheManager.addOrUpdateDataSource).toHaveBeenCalledWith({
        name: dataSourceName,
        databases: [
          { name: 'Database1', tables: [], lastUpdated: '', status: CachedDataSourceStatus.Empty },
          { name: 'Database2', tables: [], lastUpdated: '', status: CachedDataSourceStatus.Empty },
        ],
        lastUpdated: expect.any(String),
        status: CachedDataSourceStatus.Updated,
      });
    });
  });

  describe('updateTablesToCache', () => {
    it('should update cache with empty tables and status failed when polling result is null', () => {
      const dataSourceName = 'TestDataSource';
      const databaseName = 'TestDatabase';
      const pollingResult = null;

      CatalogCacheManager.addOrUpdateDataSource({
        databases: [
          {
            name: databaseName,
            lastUpdated: '',
            status: CachedDataSourceStatus.Empty,
            tables: [],
          },
        ],
        name: dataSourceName,
        lastUpdated: new Date().toUTCString(),
        status: CachedDataSourceStatus.Updated,
      });
      updateTablesToCache(dataSourceName, databaseName, pollingResult);

      // Verify that updateDatabase is called with the correct parameters
      expect(CatalogCacheManager.updateDatabase).toHaveBeenCalledWith(
        dataSourceName,
        expect.objectContaining({
          name: databaseName,
          tables: [],
          lastUpdated: expect.any(String),
          status: CachedDataSourceStatus.Failed,
        })
      );
    });

    it('should update cache with new tables when polling result is not null', () => {
      const dataSourceName = 'TestDataSource';
      const databaseName = 'TestDatabase';

      CatalogCacheManager.addOrUpdateDataSource({
        databases: [
          {
            name: databaseName,
            lastUpdated: '',
            status: CachedDataSourceStatus.Empty,
            tables: [],
          },
        ],
        name: dataSourceName,
        lastUpdated: new Date().toUTCString(),
        status: CachedDataSourceStatus.Updated,
      });
      updateTablesToCache(dataSourceName, databaseName, mockShowTablesPollingResult);

      // Verify that updateDatabase is called with the correct parameters
      expect(CatalogCacheManager.updateDatabase).toHaveBeenCalledWith(
        dataSourceName,
        expect.objectContaining({
          name: databaseName,
          tables: [
            { name: 'Table1', columns: [] },
            { name: 'Table2', columns: [] },
          ],
          lastUpdated: expect.any(String),
          status: CachedDataSourceStatus.Updated,
        })
      );
    });
  });

  describe('updateAccelerationsToCache', () => {
    beforeEach(() => {
      // Clear mock calls before each test
      jest.clearAllMocks();
    });

    it('should save empty accelerations cache and status failed when polling result is null', () => {
      const pollingResult = null;

      updateAccelerationsToCache(pollingResult);

      // Verify that saveAccelerationsCache is called with the correct parameters
      expect(CatalogCacheManager.saveAccelerationsCache).toHaveBeenCalledWith({
        version: CATALOG_CACHE_VERSION,
        accelerations: [],
        lastUpdated: expect.any(String),
        status: CachedDataSourceStatus.Failed,
      });
    });

    it('should save new accelerations cache when polling result is not null', () => {
      updateAccelerationsToCache(mockShowIndexesPollingResult);

      // Verify that saveAccelerationsCache is called with the correct parameters
      expect(CatalogCacheManager.saveAccelerationsCache).toHaveBeenCalledWith({
        version: CATALOG_CACHE_VERSION,
        accelerations: [
          {
            flintIndexName: 'flint_mys3_default_http_logs_skipping_index',
            type: 'skipping',
            database: 'default',
            table: 'http_logs',
            indexName: 'skipping_index',
            autoRefresh: false,
            status: 'Active',
          },
          {
            flintIndexName: 'flint_mys3_default_http_logs_status_clientip_and_day_index',
            type: 'covering',
            database: 'default',
            table: 'http_logs',
            indexName: 'status_clientip_and_day',
            autoRefresh: true,
            status: 'Active',
          },
          {
            flintIndexName: 'flint_mys3_default_http_count_view',
            type: 'materialized',
            database: 'default',
            table: '',
            indexName: 'http_count_view',
            autoRefresh: true,
            status: 'Active',
          },
        ],
        lastUpdated: expect.any(String),
        status: CachedDataSourceStatus.Updated,
      });
    });
  });
});
