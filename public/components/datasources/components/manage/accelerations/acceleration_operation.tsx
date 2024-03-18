/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { CachedAcceleration } from '../../../../../../common/types/data_connections';
import { useToast } from '../../../../common/toast';
import { useDirectQuery } from '../../../../../framework/datasources/direct_query_hook';
import { DirectQueryLoadingStatus } from '../../../../../../common/types/explorer';
import {
  AccelerationActionType,
  generateAccelerationOperationQuery,
  getAccelerationName,
} from './utils/acceleration_utils';

export const useAccelerationOperation = (dataSource: string) => {
  const { startLoading, stopLoading, loadStatus } = useDirectQuery();
  const { setToast } = useToast();
  const [isOperating, setIsOperating] = useState(false);
  const [operationSuccess, setOperationSuccess] = useState(false);
  const [accelerationToOperate, setAccelerationToOperate] = useState<CachedAcceleration | null>(
    null
  );
  const [operationType, setOperationType] = useState<AccelerationActionType | null>(null);
  const [currentStatus, setCurrentStatus] = useState<DirectQueryLoadingStatus | null>(null);

  useEffect(() => {
    if (!accelerationToOperate || !operationType || loadStatus === currentStatus) return;

    const displayAccelerationName = getAccelerationName(accelerationToOperate);

    let operationInProgressMessage = '';
    let operationSuccessMessage = '';
    let operationFailureMessage = '';

    switch (operationType) {
      case 'delete':
        operationInProgressMessage = `Deleting acceleration: ${displayAccelerationName}`;
        operationSuccessMessage = `Successfully deleted acceleration: ${displayAccelerationName}`;
        operationFailureMessage = `Failed to delete acceleration: ${displayAccelerationName}`;
        break;
      case 'vacuum':
        operationInProgressMessage = `Vacuuming acceleration: ${displayAccelerationName}`;
        operationSuccessMessage = `Successfully vacuumed acceleration: ${displayAccelerationName}`;
        operationFailureMessage = `Failed to vacuum acceleration: ${displayAccelerationName}`;
        break;
      case 'sync':
        operationInProgressMessage = `Syncing acceleration: ${displayAccelerationName}`;
        break;
    }

    if (loadStatus === DirectQueryLoadingStatus.SCHEDULED && operationType !== 'sync') {
      setIsOperating(true);
      setToast(operationInProgressMessage, 'success');
    } else if (loadStatus === DirectQueryLoadingStatus.SUCCESS && operationType !== 'sync') {
      setIsOperating(false);
      setAccelerationToOperate(null);
      setOperationSuccess(true);
      setToast(operationSuccessMessage, 'success');
    } else if (loadStatus === DirectQueryLoadingStatus.FAILED && operationType !== 'sync') {
      setIsOperating(false);
      setOperationSuccess(false);
      setToast(operationFailureMessage, 'danger');
    } else if (operationType === 'sync' && loadStatus === DirectQueryLoadingStatus.SCHEDULED) {
      setToast(operationInProgressMessage, 'success');
      stopLoading();
    }

    setCurrentStatus(loadStatus);
  }, [loadStatus, setToast, accelerationToOperate, operationType, currentStatus]);

  useEffect(() => {
    return () => {
      stopLoading();
    };
  }, []);

  const performOperation = (
    acceleration: CachedAcceleration,
    operation: AccelerationActionType
  ) => {
    setOperationSuccess(false);
    setOperationType(operation);
    const operationQuery = generateAccelerationOperationQuery(acceleration, dataSource, operation);

    const requestPayload = {
      lang: 'sql',
      query: operationQuery,
      datasource: dataSource,
    };

    setIsOperating(true);
    setAccelerationToOperate(acceleration);
    startLoading(requestPayload);
  };

  return { performOperation, isOperating, operationSuccess };
};
