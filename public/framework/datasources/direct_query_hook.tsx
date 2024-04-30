/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { ASYNC_POLLING_INTERVAL } from '../../../common/constants/data_sources';
import { DirectQueryLoadingStatus, DirectQueryRequest } from '../../../common/types/explorer';
import { getAsyncSessionId, setAsyncSessionId } from '../../../common/utils/query_session_utils';
import { get as getObjValue } from '../../../common/utils/shared';
import { formatError } from '../../components/event_analytics/utils';
import { usePolling } from '../../components/hooks';
import { SQLService } from '../../services/requests/sql';
import { coreRefs } from '../core_refs';

export const useDirectQuery = () => {
  const sqlService = new SQLService(coreRefs.http!);
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

  const startLoading = (requestPayload: DirectQueryRequest) => {
    setLoadStatus(DirectQueryLoadingStatus.SCHEDULED);

    const sessionId = getAsyncSessionId(requestPayload.datasource);
    if (sessionId) {
      requestPayload = { ...requestPayload, sessionId };
    }

    sqlService
      .fetch(requestPayload)
      .then((result) => {
        setAsyncSessionId(requestPayload.datasource, getObjValue(result, 'sessionId', null));
        if (result.queryId) {
          startPolling({
            queryId: result.queryId,
          });
        } else {
          console.error('No query id found in response');
          setLoadStatus(DirectQueryLoadingStatus.FAILED);
        }
      })
      .catch((e) => {
        setLoadStatus(DirectQueryLoadingStatus.FAILED);
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
    } else if (status === DirectQueryLoadingStatus.FAILED) {
      setLoadStatus(status);
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

  return { loadStatus, startLoading, stopLoading, pollingResult };
};
