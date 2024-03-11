/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import {
  ASYNC_POLLING_INTERVAL,
  CATALOG_CACHE_VERSION,
} from '../../../common/constants/data_sources';
import {
  AsyncPollingResult,
  CachedDataSourceStatus,
  LoadCacheType,
} from '../../../common/types/data_connections';
import { DirectQueryLoadingStatus, DirectQueryRequest } from '../../../common/types/explorer';
import { getAsyncSessionId, setAsyncSessionId } from '../../../common/utils/query_session_utils';
import {
  addBackticksIfNeeded,
  combineSchemaAndDatarows,
  get as getObjValue,
} from '../../../common/utils/shared';
import { formatError } from '../../components/event_analytics/utils';
import { usePolling } from '../../components/hooks';
import { SQLService } from '../../services/requests/sql';
import { coreRefs } from '../core_refs';
import { CatalogCacheManager } from './cache_manager';

export const updateDatabasesToCache = (
  dataSourceName: string,
  pollingResult: AsyncPollingResult
) => {
  const cachedDataSource = CatalogCacheManager.getOrCreateDataSource(dataSourceName);
  const currentTime = new Date().toUTCString();

  if (!pollingResult) {
    CatalogCacheManager.addOrUpdateDataSource({
      ...cachedDataSource,
      databases: [],
      lastUpdated: currentTime,
      status: CachedDataSourceStatus.Failed,
    });
    return;
  }

  const combinedData = combineSchemaAndDatarows(pollingResult.schema, pollingResult.datarows);
  const newDatabases = combinedData.map((row: any) => ({
    name: row.namespace,
    tables: [],
    lastUpdated: '',
    status: CachedDataSourceStatus.Empty,
  }));

  CatalogCacheManager.addOrUpdateDataSource({
    ...cachedDataSource,
    databases: newDatabases,
    lastUpdated: currentTime,
    status: CachedDataSourceStatus.Updated,
  });
};

export const updateTablesToCache = (
  dataSourceName: string,
  databaseName: string,
  pollingResult: AsyncPollingResult
) => {
  const cachedDatabase = CatalogCacheManager.getDatabase(dataSourceName, databaseName);
  const currentTime = new Date().toUTCString();

  if (!pollingResult) {
    CatalogCacheManager.updateDatabase(dataSourceName, {
      ...cachedDatabase,
      tables: [],
      lastUpdated: currentTime,
      status: CachedDataSourceStatus.Failed,
    });
    return;
  }

  const combinedData = combineSchemaAndDatarows(pollingResult.schema, pollingResult.datarows);
  const newTables = combinedData.map((row: any) => ({
    name: row.tableName,
    columns: [],
  }));

  CatalogCacheManager.updateDatabase(dataSourceName, {
    ...cachedDatabase,
    tables: newTables,
    lastUpdated: currentTime,
    status: CachedDataSourceStatus.Updated,
  });
};

export const updateAccelerationsToCache = (pollingResult: AsyncPollingResult) => {
  const currentTime = new Date().toUTCString();

  if (!pollingResult) {
    CatalogCacheManager.saveAccelerationsCache({
      version: CATALOG_CACHE_VERSION,
      accelerations: [],
      lastUpdated: currentTime,
      status: CachedDataSourceStatus.Failed,
    });
    return;
  }

  const combinedData = combineSchemaAndDatarows(pollingResult.schema, pollingResult.datarows);

  const newAccelerations = combinedData.map((row: any) => ({
    flintIndexName: row.flint_index_name,
    type: row.kind === 'mv' ? 'materialized' : row.kind,
    database: row.database,
    table: row.table,
    indexName: row.index_name,
    autoRefresh: row.auto_refresh,
    status: row.status,
  }));

  CatalogCacheManager.saveAccelerationsCache({
    version: CATALOG_CACHE_VERSION,
    accelerations: newAccelerations,
    lastUpdated: currentTime,
    status: CachedDataSourceStatus.Updated,
  });
};

export const updateToCache = (
  pollResults: any,
  loadCacheType: LoadCacheType,
  dataSourceName: string,
  databaseName?: string
) => {
  switch (loadCacheType) {
    case 'databases':
      updateDatabasesToCache(dataSourceName, pollResults);
      break;
    case 'tables':
      updateTablesToCache(dataSourceName, databaseName!, pollResults);
      break;
    case 'accelerations':
      updateAccelerationsToCache(pollResults);
      break;
    default:
      break;
  }
};

export const createLoadQuery = (
  loadCacheType: LoadCacheType,
  dataSourceName: string,
  databaseName?: string
) => {
  let query;
  switch (loadCacheType) {
    case 'databases':
      query = `SHOW SCHEMAS IN ${addBackticksIfNeeded(dataSourceName)}`;
      break;
    case 'tables':
      query = `SHOW TABLES IN ${addBackticksIfNeeded(dataSourceName)}.${addBackticksIfNeeded(
        databaseName!
      )}`;
      break;
    case 'accelerations':
      query = `SHOW FLINT INDEX in ${addBackticksIfNeeded(dataSourceName)}`;
      break;
    default:
      query = '';
      break;
  }
  return query;
};

export const useLoadToCache = (loadCacheType: LoadCacheType) => {
  const sqlService = new SQLService(coreRefs.http!);
  const [currentDataSourceName, setCurrentDataSourceName] = useState('');
  const [currentDatabaseName, setCurrentDatabaseName] = useState<string | undefined>('');
  const [loadStatus, setLoadStatus] = useState<DirectQueryLoadingStatus>(
    DirectQueryLoadingStatus.SCHEDULED
  );

  const {
    data: pollingResult,
    loading: _pollingLoading,
    error: pollingError,
    startPolling,
    stopPolling: stopLoading,
  } = usePolling<any, any>((params) => {
    return sqlService.fetchWithJobId(params);
  }, ASYNC_POLLING_INTERVAL);

  const startLoading = (dataSourceName: string, databaseName?: string) => {
    setCurrentDataSourceName(dataSourceName);
    setCurrentDatabaseName(databaseName);

    let requestPayload: DirectQueryRequest = {
      lang: 'sql',
      query: createLoadQuery(loadCacheType, dataSourceName, databaseName),
      datasource: dataSourceName,
    };

    const sessionId = getAsyncSessionId(dataSourceName);
    if (sessionId) {
      requestPayload = { ...requestPayload, sessionId };
    }

    sqlService
      .fetch(requestPayload)
      .then((result) => {
        setAsyncSessionId(dataSourceName, getObjValue(result, 'sessionId', null));
        if (result.queryId) {
          startPolling({
            queryId: result.queryId,
          });
        } else {
          console.error('No query id found in response');
          setLoadStatus(DirectQueryLoadingStatus.FAILED);
          updateToCache(null, loadCacheType, currentDataSourceName, currentDatabaseName);
        }
      })
      .catch((e) => {
        setLoadStatus(DirectQueryLoadingStatus.FAILED);
        updateToCache(null, loadCacheType, currentDataSourceName, currentDatabaseName);
        const formattedError = formatError(
          '',
          'The query failed to execute and the operation could not be complete.',
          e.body.message
        );
        coreRefs.core?.notifications.toasts.addError(formattedError, {
          title: 'Query Failed',
        });
        console.error(e);
      });
  };

  useEffect(() => {
    // cancel direct query
    if (!pollingResult) return;
    const { status: anyCaseStatus, datarows, error } = pollingResult;
    const status = anyCaseStatus?.toLowerCase();

    if (status === DirectQueryLoadingStatus.SUCCESS || datarows) {
      setLoadStatus(status);
      stopLoading();
      updateToCache(pollingResult, loadCacheType, currentDataSourceName, currentDatabaseName);
    } else if (status === DirectQueryLoadingStatus.FAILED) {
      setLoadStatus(status);
      stopLoading();
      updateToCache(null, loadCacheType, currentDataSourceName, currentDatabaseName);
      const formattedError = formatError(
        '',
        'The query failed to execute and the operation could not be complete.',
        error
      );
      coreRefs.core?.notifications.toasts.addError(formattedError, {
        title: 'Query Failed',
      });
    } else {
      setLoadStatus(status);
    }
  }, [pollingResult, pollingError]);

  return { loadStatus, startLoading, stopLoading };
};

export const useLoadDatabasesToCache = () => {
  const { loadStatus, startLoading, stopLoading } = useLoadToCache('databases');
  return { loadStatus, startLoading, stopLoading };
};

export const useLoadTablesToCache = () => {
  const { loadStatus, startLoading, stopLoading } = useLoadToCache('tables');
  return { loadStatus, startLoading, stopLoading };
};

export const useAccelerationsToCache = () => {
  const { loadStatus, startLoading, stopLoading } = useLoadToCache('accelerations');
  return { loadStatus, startLoading, stopLoading };
};
