/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CachedDataSourceStatus } from '../../../common/types/data_connections';
import {
  updateAccelerationsToCache,
  updateDatabasesToCache,
  updateTablesToCache,
} from './cache_loader';
import { CatalogCacheManager } from './cache_manager';

// Mock CatalogCacheManager
// jest.mock('./cache_manager');

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

// // Mock the behavior of CatalogCacheManager
// const mockAddOrUpdateDataSource = jest.fn();
// const mockGetOrCreateDataSource = jest.fn().mockImplementation((dataSourceName: string) => ({
//   name: dataSourceName,
//   databases: [],
//   lastUpdated: '', // or use an actual date if needed
//   status: CachedDataSourceStatus.Empty,
// }));

// // Mock the methods used by updateDatabasesToCache
// jest.mock('./cache_manager', () => ({
//   CatalogCacheManager: {
//     addOrUpdateDataSource: mockAddOrUpdateDataSource,
//     getOrCreateDataSource: mockGetOrCreateDataSource,
//   },
// }));

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
      const pollingResult = {
        schema: [{ name: 'namespace', type: 'string' }],
        datarows: [['Database1'], ['Database2']],
      };

      updateDatabasesToCache(dataSourceName, pollingResult);

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
      const pollingResult = {
        schema: [
          { name: 'namespace', type: 'string' },
          { name: 'tableName', type: 'string' },
          { name: 'isTemporary', type: 'boolean' },
        ],
        datarows: [
          ['TestDatabase', 'Table1', false],
          ['TestDatabase', 'Table2', false],
        ],
      };

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
        version: '1.0',
        accelerations: [],
        lastUpdated: expect.any(String),
        status: CachedDataSourceStatus.Failed,
      });
    });

    it('should save new accelerations cache when polling result is not null', () => {
      const pollingResult = {
        schema: [
          {
            flint_index_name: 'Index1',
            kind: 'mv',
            database: 'DB1',
            table: 'Table1',
            index_name: 'Index1',
            auto_refresh: false,
            status: 'Active',
          },
          {
            flint_index_name: 'Index2',
            kind: 'skipping',
            database: 'DB2',
            table: 'Table2',
            index_name: 'Index2',
            auto_refresh: true,
            status: 'Active',
          },
        ],
        datarows: [],
      };

      updateAccelerationsToCache(pollingResult);

      // Verify that saveAccelerationsCache is called with the correct parameters
      expect(CatalogCacheManager.saveAccelerationsCache).toHaveBeenCalledWith({
        version: '1.0',
        accelerations: [
          {
            flintIndexName: 'Index1',
            type: 'materialized',
            database: 'DB1',
            table: 'Table1',
            indexName: 'Index1',
            autoRefresh: false,
            status: 'Active',
          },
          {
            flintIndexName: 'Index2',
            type: 'skipping',
            database: 'DB2',
            table: 'Table2',
            indexName: 'Index2',
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
