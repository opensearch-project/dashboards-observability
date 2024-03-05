/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ASYNC_QUERY_CATALOG_CACHE } from '../../../common/constants/shared';
import {
  CachedDataSource,
  CachedDataSourceStatus,
  CatalogCacheData,
} from '../../../common/types/data_connections';

/**
 *
 *  Manages caching of catalog data in the browser storage
 *
 * * * * * * * * * * Example usage for CatalogCacheManager * * * * * * * * * *
 *
 * const dataSource: CachedDataSource = {
 *   name: 'DataSource1',
 *   lastUpdated: '2024-02-20T12:00:00Z',
 *   status: CachedDataSourceStatus.Empty,
 *   databases: [
 *     {
 *       name: 'Database1',
 *       materializedViews: [{ name: 'MaterializedView1' }, { name: 'MaterializedView2' }],
 *       tables: [
 *         {
 *           name: 'Table1',
 *           columns: [
 *             { name: 'column1', dataType: 'datatype1' },
 *             { name: 'column2', dataType: 'datatype2' },
 *             { name: 'column3', dataType: 'datatype3' },
 *           ],
 *           skippingIndex: { indexName: 'SkippingIndex1' },
 *           coveringIndices: [{ indexName: 'CoveringIndex1' }, { indexName: 'CoveringIndex2' }],
 *         },
 *         {
 *           name: 'Table2',
 *           columns: [
 *             { name: 'column4', dataType: 'datatype4' },
 *             { name: 'column5', dataType: 'datatype5' },
 *           ],
 *           skippingIndex: { indexName: 'SkippingIndex2' },
 *           coveringIndices: [],
 *         },
 *       ],
 *     },
 *   ],
 * };
 *
 * // Save the dataSource into cache
 * CatalogCacheManager.addOrUpdateDataSource(dataSource);
 *
 * // Retrieve dataSource from cache
 * const cachedDataSource = CatalogCacheManager.getDataSource('DataSource1');
 *
 *
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 */

export class CatalogCacheManager {
  /**
   * The key used to store catalog cache data in localStorage.
   */
  private static readonly localStorageKey = ASYNC_QUERY_CATALOG_CACHE;

  /**
   * Retrieves catalog cache data from localStorage.
   * If no data is found, initializes with a default cache object.
   * @returns The catalog cache data.
   */
  private static getCatalogCacheData(): CatalogCacheData {
    const catalogData = localStorage.getItem(this.localStorageKey);

    if (catalogData) {
      return JSON.parse(catalogData);
    } else {
      const defaultCacheObject = { version: '1.0', dataSources: [] };
      this.saveCatalogCacheData(defaultCacheObject);
      return defaultCacheObject;
    }
  }

  /**
   * Saves catalog cache data to localStorage.
   * @param cacheData The catalog cache data to save.
   */
  static saveCatalogCacheData(cacheData: CatalogCacheData): void {
    localStorage.setItem(this.localStorageKey, JSON.stringify(cacheData));
  }

  /**
   * Adds or updates a data source in the catalog cache.
   * @param dataSource The data source to add or update.
   */
  static addOrUpdateDataSource(dataSource: CachedDataSource): void {
    const cacheData = this.getCatalogCacheData();
    const index = cacheData.dataSources.findIndex((ds) => ds.name === dataSource.name);
    if (index !== -1) {
      cacheData.dataSources[index] = dataSource;
    } else {
      cacheData.dataSources.push(dataSource);
    }
    this.saveCatalogCacheData(cacheData);
  }

  /**
   * Retrieves a data source from the catalog cache.
   * If the data source does not exist, creates and returns a default data source object.
   * @param dataSourceName The name of the data source to retrieve.
   * @returns The cached data source, or a default data source object if not found.
   */
  static getDataSource(dataSourceName: string): CachedDataSource {
    const cacheData = this.getCatalogCacheData();
    const cachedDataSourceData = cacheData.dataSources.find(
      (ds: CachedDataSource) => ds.name === dataSourceName
    );

    if (cachedDataSourceData) {
      return cachedDataSourceData;
    } else {
      const defaultDataSourceObject = {
        name: dataSourceName,
        lastUpdated: '',
        status: CachedDataSourceStatus.Empty,
        databases: [],
      };
      this.addOrUpdateDataSource(defaultDataSourceObject);
      return defaultDataSourceObject;
    }
  }

  /**
   * Clears the catalog cache by removing the cache data from localStorage.
   */
  static clear(): void {
    localStorage.removeItem(this.localStorageKey);
  }
}
