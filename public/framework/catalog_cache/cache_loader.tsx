/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import {
  ASYNC_POLLING_INTERVAL,
  SPARK_HIVE_TABLE_REGEX,
  SPARK_PARTITION_INFO,
} from '../../../common/constants/data_sources';
import {
  AsyncPollingResult,
  CachedAccelerations,
  CachedColumn,
  CachedDataSourceStatus,
  CachedTable,
  LoadCacheType,
  StartLoadingParams,
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
  pollingResult: AsyncPollingResult,
  dataSourceMDSId?: string
) => {
  const cachedDataSource = CatalogCacheManager.getOrCreateDataSource(
    dataSourceName,
    dataSourceMDSId
  );
  const currentTime = new Date().toUTCString();

  if (!pollingResult) {
    CatalogCacheManager.addOrUpdateDataSource(
      {
        ...cachedDataSource,
        databases: [],
        lastUpdated: currentTime,
        status: CachedDataSourceStatus.Failed,
        ...(dataSourceMDSId && { dataSourceMDSId }),
      },
      dataSourceMDSId
    );
    return;
  }

  const combinedData = combineSchemaAndDatarows(pollingResult.schema, pollingResult.datarows);
  const newDatabases = combinedData.map((row: any) => ({
    name: row.namespace,
    tables: [],
    lastUpdated: '',
    status: CachedDataSourceStatus.Empty,
  }));

  CatalogCacheManager.addOrUpdateDataSource(
    {
      ...cachedDataSource,
      databases: newDatabases,
      lastUpdated: currentTime,
      status: CachedDataSourceStatus.Updated,
      ...(dataSourceMDSId && { dataSourceMDSId }),
    },
    dataSourceMDSId
  );
};

export const updateTablesToCache = (
  dataSourceName: string,
  databaseName: string,
  pollingResult: AsyncPollingResult,
  dataSourceMDSId?: string
) => {
  try {
    const cachedDatabase = CatalogCacheManager.getDatabase(
      dataSourceName,
      databaseName,
      dataSourceMDSId
    );
    const currentTime = new Date().toUTCString();

    if (!pollingResult) {
      CatalogCacheManager.updateDatabase(
        dataSourceName,
        {
          ...cachedDatabase,
          tables: [],
          lastUpdated: currentTime,
          status: CachedDataSourceStatus.Failed,
        },
        dataSourceMDSId
      );
      return;
    }

    const combinedData = combineSchemaAndDatarows(pollingResult.schema, pollingResult.datarows);
    const newTables = combinedData
      .filter((row: any) => !SPARK_HIVE_TABLE_REGEX.test(row.information))
      .map((row: any) => ({
        name: row.tableName,
      }));

    CatalogCacheManager.updateDatabase(
      dataSourceName,
      {
        ...cachedDatabase,
        tables: newTables,
        lastUpdated: currentTime,
        status: CachedDataSourceStatus.Updated,
      },
      dataSourceMDSId
    );
  } catch (error) {
    console.error(error);
  }
};

export const updateAccelerationsToCache = (
  dataSourceName: string,
  pollingResult: AsyncPollingResult,
  dataSourceMDSId?: string
) => {
  const currentTime = new Date().toUTCString();

  if (!pollingResult) {
    CatalogCacheManager.addOrUpdateAccelerationsByDataSource({
      name: dataSourceName,
      accelerations: [],
      lastUpdated: currentTime,
      status: CachedDataSourceStatus.Failed,
      ...(dataSourceMDSId && { dataSourceMDSId }),
    });
    return;
  }

  const combinedData = combineSchemaAndDatarows(pollingResult.schema, pollingResult.datarows);

  const newAccelerations: CachedAccelerations[] = combinedData.map((row: any) => ({
    flintIndexName: row.flint_index_name,
    type: row.kind === 'mv' ? 'materialized' : row.kind,
    database: row.database,
    table: row.table,
    indexName: row.index_name,
    autoRefresh: row.auto_refresh,
    status: row.status,
  }));

  CatalogCacheManager.addOrUpdateAccelerationsByDataSource({
    name: dataSourceName,
    accelerations: newAccelerations,
    lastUpdated: currentTime,
    status: CachedDataSourceStatus.Updated,
    ...(dataSourceMDSId && { dataSourceMDSId }),
  });
};

export const updateTableColumnsToCache = (
  dataSourceName: string,
  databaseName: string,
  tableName: string,
  pollingResult: AsyncPollingResult,
  dataSourceMDSId?: string
) => {
  try {
    if (!pollingResult) {
      return;
    }
    const cachedDatabase = CatalogCacheManager.getDatabase(
      dataSourceName,
      databaseName,
      dataSourceMDSId
    );
    const currentTime = new Date().toUTCString();

    const combinedData: Array<{ col_name: string; data_type: string }> = combineSchemaAndDatarows(
      pollingResult.schema,
      pollingResult.datarows
    );

    const tableColumns: CachedColumn[] = [];
    for (const row of combinedData) {
      if (row.col_name === SPARK_PARTITION_INFO) {
        break;
      }
      tableColumns.push({
        fieldName: row.col_name,
        dataType: row.data_type,
      });
    }

    const newTables: CachedTable[] = cachedDatabase.tables.map((ts) =>
      ts.name === tableName ? { ...ts, columns: tableColumns } : { ...ts }
    );

    if (cachedDatabase.status === CachedDataSourceStatus.Updated) {
      CatalogCacheManager.updateDatabase(
        dataSourceName,
        {
          ...cachedDatabase,
          tables: newTables,
          lastUpdated: currentTime,
          status: CachedDataSourceStatus.Updated,
        },
        dataSourceMDSId
      );
    }
  } catch (error) {
    console.error(error);
  }
};

export const updateToCache = (
  pollResults: any,
  loadCacheType: LoadCacheType,
  dataSourceName: string,
  databaseName?: string,
  tableName?: string,
  dataSourceMDSId?: string
) => {
  switch (loadCacheType) {
    case 'databases':
      updateDatabasesToCache(dataSourceName, pollResults, dataSourceMDSId);
      break;
    case 'tables':
      updateTablesToCache(dataSourceName, databaseName!, pollResults, dataSourceMDSId);
      break;
    case 'accelerations':
      updateAccelerationsToCache(dataSourceName, pollResults, dataSourceMDSId);
      break;
    case 'tableColumns':
      updateTableColumnsToCache(
        dataSourceName,
        databaseName!,
        tableName!,
        pollResults,
        dataSourceMDSId
      );
    default:
      break;
  }
};

export const createLoadQuery = (
  loadCacheType: LoadCacheType,
  dataSourceName: string,
  databaseName?: string,
  tableName?: string
) => {
  let query;
  switch (loadCacheType) {
    case 'databases':
      query = `SHOW SCHEMAS IN ${addBackticksIfNeeded(dataSourceName)}`;
      break;
    case 'tables':
      query = `SHOW TABLE EXTENDED IN ${addBackticksIfNeeded(
        dataSourceName
      )}.${addBackticksIfNeeded(databaseName!)} LIKE '*'`;
      break;
    case 'accelerations':
      query = `SHOW FLINT INDEX in ${addBackticksIfNeeded(dataSourceName)}`;
      break;
    case 'tableColumns':
      query = `DESC ${addBackticksIfNeeded(dataSourceName)}.${addBackticksIfNeeded(
        databaseName!
      )}.${addBackticksIfNeeded(tableName!)}`;
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
  const [currentTableName, setCurrentTableName] = useState<string | undefined>('');
  const [loadStatus, setLoadStatus] = useState<DirectQueryLoadingStatus>(
    DirectQueryLoadingStatus.INITIAL
  );
  const dataSourceMDSClientId = useRef('');

  const {
    data: pollingResult,
    loading: _pollingLoading,
    error: pollingError,
    startPolling,
    stopPolling: stopLoading,
  } = usePolling<any, any>((params) => {
    return sqlService.fetchWithJobId(params, dataSourceMDSClientId.current);
  }, ASYNC_POLLING_INTERVAL);

  const onLoadingFailed = () => {
    setLoadStatus(DirectQueryLoadingStatus.FAILED);
    updateToCache(
      null,
      loadCacheType,
      currentDataSourceName,
      currentDatabaseName,
      currentTableName,
      dataSourceMDSClientId.current
    );
  };

  const startLoading = ({
    dataSourceName,
    dataSourceMDSId,
    databaseName,
    tableName,
  }: StartLoadingParams) => {
    setLoadStatus(DirectQueryLoadingStatus.SCHEDULED);
    setCurrentDataSourceName(dataSourceName);
    setCurrentDatabaseName(databaseName);
    setCurrentTableName(tableName);
    dataSourceMDSClientId.current = dataSourceMDSId || '';

    let requestPayload: DirectQueryRequest = {
      lang: 'sql',
      query: createLoadQuery(loadCacheType, dataSourceName, databaseName, tableName),
      datasource: dataSourceName,
    };

    const sessionId = getAsyncSessionId(dataSourceName);
    if (sessionId) {
      requestPayload = { ...requestPayload, sessionId };
    }
    sqlService
      .fetch(requestPayload, dataSourceMDSId)
      .then((result) => {
        setAsyncSessionId(dataSourceName, getObjValue(result, 'sessionId', null));
        if (result.queryId) {
          startPolling({
            queryId: result.queryId,
          });
        } else {
          console.error('No query id found in response');
          onLoadingFailed();
        }
      })
      .catch((e) => {
        onLoadingFailed();
        const formattedError = formatError(
          '',
          'The query failed to execute and the operation could not be complete.',
          e.body?.message
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
      updateToCache(
        pollingResult,
        loadCacheType,
        currentDataSourceName,
        currentDatabaseName,
        currentTableName,
        dataSourceMDSClientId.current
      );
    } else if (status === DirectQueryLoadingStatus.FAILED) {
      onLoadingFailed();
      stopLoading();

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

export const useLoadTableColumnsToCache = () => {
  const { loadStatus, startLoading, stopLoading } = useLoadToCache('tableColumns');
  return { loadStatus, startLoading, stopLoading };
};

export const useLoadAccelerationsToCache = () => {
  const { loadStatus, startLoading, stopLoading } = useLoadToCache('accelerations');
  return { loadStatus, startLoading, stopLoading };
};
