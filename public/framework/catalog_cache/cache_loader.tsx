/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { ASYNC_POLLING_INTERVAL } from '../../../common/constants/data_sources';
import { CachedDataSourceLoadingProgress } from '../../../common/types/data_connections';
import { DirectQueryLoadingStatus, DirectQueryRequest } from '../../../common/types/explorer';
import { getAsyncSessionId, setAsyncSessionId } from '../../../common/utils/query_session_utils';
import { addBackticksIfNeeded, get as getObjValue } from '../../../common/utils/shared';
import { formatError } from '../../components/event_analytics/utils';
import { usePolling } from '../../components/hooks';
import { SQLService } from '../../services/requests/sql';
import { coreRefs } from '../core_refs';

enum cacheLoadingType {
  Databases = 'Load Databases',
  Tables = 'Load Tables',
  Accelerations = 'Load Accelerations',
}

const runCacheLoadQuery = (
  loadingType: cacheLoadingType,
  dataSourceName: string,
  databaseName?: string
) => {
  const [loadQueryStatus, setLoadQueryStatus] = useState<'error' | 'success' | 'loading'>(
    'loading'
  );
  const sqlService = new SQLService(coreRefs.http!);

  const {
    data: pollingResult,
    loading: _pollingLoading,
    error: pollingError,
    startPolling,
    stopPolling,
  } = usePolling<any, any>((params) => {
    return sqlService.fetchWithJobId(params);
  }, ASYNC_POLLING_INTERVAL);

  let requestPayload = {} as DirectQueryRequest;
  const sessionId = getAsyncSessionId();

  switch (loadingType) {
    case cacheLoadingType.Databases:
      requestPayload = {
        lang: 'sql',
        query: `SHOW SCHEMAS IN ${addBackticksIfNeeded(dataSourceName)}`,
        datasource: dataSourceName,
      } as DirectQueryRequest;
      break;
    case cacheLoadingType.Tables:
      requestPayload = {
        lang: 'sql',
        query: `SHOW TABLES IN  ${addBackticksIfNeeded(dataSourceName)}.${addBackticksIfNeeded(
          databaseName!
        )}`,
        datasource: dataSourceName,
      } as DirectQueryRequest;
      break;
    case cacheLoadingType.Accelerations:
      requestPayload = {
        lang: 'sql',
        query: `SHOW FLINT INDEXES`,
        datasource: dataSourceName,
      } as DirectQueryRequest;
      break;

    default:
      setLoadQueryStatus('error');
      const formattedError = formatError(
        '',
        'Recieved unknown cache query type: ' + `loadingType`,
        ''
      );
      coreRefs.core?.notifications.toasts.addError(formattedError, {
        title: 'unknown cache query type',
      });
      console.error(formattedError);
      break;
  }

  if (sessionId) {
    requestPayload.sessionId = sessionId;
  }

  sqlService
    .fetch(requestPayload)
    .then((result) => {
      setAsyncSessionId(getObjValue(result, 'sessionId', null));
      if (result.queryId) {
        startPolling({
          queryId: result.queryId,
        });
      } else {
        console.error('No query id found in response');
      }
    })
    .catch((e) => {
      // stopPollingWithStatus(DirectQueryLoadingStatus.FAILED);
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

  useEffect(() => {
    // cancel direct query
    if (!pollingResult) return;
    const { status: anyCaseStatus, datarows, error } = pollingResult;
    const status = anyCaseStatus?.toLowerCase();

    if (status === DirectQueryLoadingStatus.SUCCESS || datarows) {
      setLoadQueryStatus('success');
      stopPolling();
      // TODO: Stop polling, update cache
    } else if (status === DirectQueryLoadingStatus.FAILED) {
      setLoadQueryStatus('error');
      stopPolling();
      // TODO: Stop polling, update cache with error

      // send in a toast with error message
      const formattedError = formatError(
        '',
        'The query failed to execute and the operation could not be complete.',
        error
      );
      coreRefs.core?.notifications.toasts.addError(formattedError, {
        title: 'Query Failed',
      });
    } else {
      setLoadQueryStatus('loading');
    }
  }, [pollingResult, pollingError]);

  return { loadQueryStatus, stopPolling };
};

export const CacheLoader = ({
  loadingType,
  dataSourceName,
  databaseName,
}: {
  loadingType: cacheLoadingType;
  dataSourceName: string;
  databaseName?: string;
}) => {
  const [loadingStatus, setloadingStatus] = useState<CachedDataSourceLoadingProgress>(
    CachedDataSourceLoadingProgress.LoadingScheduled
  );
  const [stopCurrentPolling, setStopCurrentPolling] = useState(() => () => {});

  const stopLoadingCache = () => {
    setloadingStatus(CachedDataSourceLoadingProgress.LoadingStopped);
    stopCurrentPolling();
  };

  switch (loadingType) {
    case cacheLoadingType.Databases:
      break;
    case cacheLoadingType.Tables:
      break;
    case cacheLoadingType.Accelerations:
      break;

    default:
      // TODO: raise error toast
      break;
  }

  return { loadingStatus, stopLoadingCache };
};
