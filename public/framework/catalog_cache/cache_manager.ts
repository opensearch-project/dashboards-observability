/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CATALOG_CACHE_VERSION } from '../../../common/constants/data_sources';
import {
  ASYNC_QUERY_ACCELERATIONS_CACHE,
  ASYNC_QUERY_DATASOURCE_CACHE,
} from '../../../common/constants/shared';
import {
  AccelerationsCacheData,
  CachedAccelerationByDataSource,
  CachedDataSource,
  CachedDataSourceStatus,
  CachedDatabase,
  CachedTable,
  DataSourceCacheData,
} from '../../../common/types/data_connections';

/**
 * Manages caching for catalog data including data sources and accelerations.
 */
export class CatalogCacheManager {
  /**
   * Key for the data source cache in local storage.
   */
  private static readonly datasourceCacheKey = ASYNC_QUERY_DATASOURCE_CACHE;

  /**
   * Key for the accelerations cache in local storage.
   */
  private static readonly accelerationsCacheKey = ASYNC_QUERY_ACCELERATIONS_CACHE;

  /**
   * Saves data source cache to local storage.
   * @param {DataSourceCacheData} cacheData - The data source cache data to save.
   */
  static saveDataSourceCache(cacheData: DataSourceCacheData): void {
    localStorage.setItem(this.datasourceCacheKey, JSON.stringify(cacheData));
  }

  /**
   * Retrieves data source cache from local storage.
   * @returns {DataSourceCacheData} The retrieved data source cache.
   */
  static getDataSourceCache(): DataSourceCacheData {
    const catalogData = localStorage.getItem(this.datasourceCacheKey);

    if (catalogData) {
      return JSON.parse(catalogData);
    } else {
      const defaultCacheObject = { version: CATALOG_CACHE_VERSION, dataSources: [] };
      this.saveDataSourceCache(defaultCacheObject);
      return defaultCacheObject;
    }
  }

  /**
   * Saves accelerations cache to local storage.
   * @param {AccelerationsCacheData} cacheData - The accelerations cache data to save.
   */
  static saveAccelerationsCache(cacheData: AccelerationsCacheData): void {
    localStorage.setItem(this.accelerationsCacheKey, JSON.stringify(cacheData));
  }

  /**
   * Retrieves accelerations cache from local storage.
   * @returns {AccelerationsCacheData} The retrieved accelerations cache.
   */
  static getAccelerationsCache(): AccelerationsCacheData {
    const accelerationCacheData = localStorage.getItem(this.accelerationsCacheKey);

    if (accelerationCacheData) {
      return JSON.parse(accelerationCacheData);
    } else {
      const defaultCacheObject = {
        version: CATALOG_CACHE_VERSION,
        dataSources: [],
      };
      this.saveAccelerationsCache(defaultCacheObject);
      return defaultCacheObject;
    }
  }

  /**
   * Adds or updates a data source in the accelerations cache.
   * @param {CachedAccelerationByDataSource} dataSource - The data source to add or update.
   */
  static addOrUpdateAccelerationsByDataSource(dataSource: CachedAccelerationByDataSource): void {
    const accCacheData = this.getAccelerationsCache();
    const index = accCacheData.dataSources.findIndex(
      (ds: CachedAccelerationByDataSource) => ds.name === dataSource.name
    );
    if (index !== -1) {
      accCacheData.dataSources[index] = dataSource;
    } else {
      accCacheData.dataSources.push(dataSource);
    }
    this.saveAccelerationsCache(accCacheData);
  }

  /**
   * Retrieves accelerations cache from local storage by the datasource name.
   * @param {string} dataSourceName - The name of the data source.
   * @returns {CachedAccelerationByDataSource} The retrieved accelerations by datasource in cache.
   * @throws {Error} If the data source is not found.
   */
  static getOrCreateAccelerationsByDataSource(
    dataSourceName: string
  ): CachedAccelerationByDataSource {
    const accCacheData = this.getAccelerationsCache();
    const cachedDataSource = accCacheData.dataSources.find((ds) => ds.name === dataSourceName);

    if (cachedDataSource) return cachedDataSource;
    else {
      const defaultDataSourceObject = {
        name: dataSourceName,
        lastUpdated: '',
        status: CachedDataSourceStatus.Empty,
        accelerations: [],
      };
      this.addOrUpdateAccelerationsByDataSource(defaultDataSourceObject);
      return defaultDataSourceObject;
    }
  }

  /**
   * Adds or updates a data source in the cache.
   * @param {CachedDataSource} dataSource - The data source to add or update.
   */
  static addOrUpdateDataSource(dataSource: CachedDataSource): void {
    const cacheData = this.getDataSourceCache();
    const index = cacheData.dataSources.findIndex(
      (ds: CachedDataSource) => ds.name === dataSource.name
    );
    if (index !== -1) {
      cacheData.dataSources[index] = dataSource;
    } else {
      cacheData.dataSources.push(dataSource);
    }
    this.saveDataSourceCache(cacheData);
  }

  /**
   * Retrieves or creates a data source with the specified name.
   * @param {string} dataSourceName - The name of the data source.
   * @returns {CachedDataSource} The retrieved or created data source.
   */
  static getOrCreateDataSource(dataSourceName: string): CachedDataSource {
    const cacheData = this.getDataSourceCache();
    const cachedDataSource = cacheData.dataSources.find(
      (ds: CachedDataSource) => ds.name === dataSourceName
    );
    if (cachedDataSource) {
      return cachedDataSource;
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
   * Retrieves a database from the cache.
   * @param {string} dataSourceName - The name of the data source containing the database.
   * @param {string} databaseName - The name of the database.
   * @returns {CachedDatabase} The retrieved database.
   * @throws {Error} If the data source or database is not found.
   */
  static getDatabase(dataSourceName: string, databaseName: string): CachedDatabase {
    const cachedDataSource = this.getDataSourceCache().dataSources.find(
      (ds) => ds.name === dataSourceName
    );
    if (!cachedDataSource) {
      throw new Error('DataSource not found exception: ' + dataSourceName);
    }

    const cachedDatabase = cachedDataSource.databases.find((db) => db.name === databaseName);
    if (!cachedDatabase) {
      throw new Error('Database not found exception: ' + databaseName);
    }

    return cachedDatabase;
  }

  /**
   * Retrieves a table from the cache.
   * @param {string} dataSourceName - The name of the data source containing the database.
   * @param {string} databaseName - The name of the database.
   * @param {string} tableName - The name of the database.
   * @returns {Cachedtable} The retrieved database.
   * @throws {Error} If the data source, database or table is not found.
   */
  static getTable(dataSourceName: string, databaseName: string, tableName: string): CachedTable {
    const cachedDatabase = this.getDatabase(dataSourceName, databaseName);

    const cachedTable = cachedDatabase.tables!.find((table) => table.name === tableName);
    if (!cachedTable) {
      throw new Error('Table not found exception: ' + tableName);
    }
    return cachedTable;
  }

  /**
   * Updates a database in the cache.
   * @param {string} dataSourceName - The name of the data source containing the database.
   * @param {CachedDatabase} database - The database to be updated.
   * @throws {Error} If the data source or database is not found.
   */
  static updateDatabase(dataSourceName: string, database: CachedDatabase): void {
    const cachedDataSource = this.getDataSourceCache().dataSources.find(
      (ds) => ds.name === dataSourceName
    );
    if (!cachedDataSource) {
      throw new Error('DataSource not found exception: ' + dataSourceName);
    }

    const index = cachedDataSource.databases.findIndex((db) => db.name === database.name);
    if (index !== -1) {
      cachedDataSource.databases[index] = database;
      this.addOrUpdateDataSource(cachedDataSource);
    } else {
      throw new Error('Database not found exception: ' + database.name);
    }
  }

  /**
   * Clears the data source cache from local storage.
   */
  static clearDataSourceCache(): void {
    localStorage.removeItem(this.datasourceCacheKey);
  }

  /**
   * Clears the accelerations cache from local storage.
   */
  static clearAccelerationsCache(): void {
    localStorage.removeItem(this.accelerationsCacheKey);
  }
}
