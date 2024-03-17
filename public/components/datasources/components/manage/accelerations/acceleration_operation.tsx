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

export interface DeleteVcuumAccelerationProps {
  acceleration: CachedAcceleration;
  dataSource: string;
}

export const useAccelerationOperation = (dataSource: string) => {
  const { startLoading, loadStatus } = useDirectQuery();
  const { setToast } = useToast();
  const [isOperating, setIsOperating] = useState(false);
  const [operationSuccess, setOperationSuccess] = useState(false);
  const [accelerationToOperate, setAccelerationToOperate] = useState<CachedAcceleration | null>(
    null
  );
  const [operationType, setOperationType] = useState<AccelerationActionType | null>(null);

  useEffect(() => {
    if (!accelerationToOperate || !operationType) return;

    const displayAccelerationName = getAccelerationName(
      accelerationToOperate.indexName,
      accelerationToOperate,
      dataSource
    );

    let operationInProgressMessage;
    let operationSuccessMessage;
    let operationFailureMessage;
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
        operationSuccessMessage = `Successfully synced acceleration: ${displayAccelerationName}`;
        operationFailureMessage = `Failed to sync acceleration: ${displayAccelerationName}`;
        break;
      default:
        console.error(`Unsupported operation type: ${operationType}`);
        return;
    }

    if (loadStatus === DirectQueryLoadingStatus.SCHEDULED) {
      setIsOperating(true);
      setToast(operationInProgressMessage, 'success');
    } else if (loadStatus === DirectQueryLoadingStatus.SUCCESS) {
      setIsOperating(false);
      setAccelerationToOperate(null);
      setOperationSuccess(true);
      setToast(operationSuccessMessage, 'success');
    } else if (loadStatus === DirectQueryLoadingStatus.FAILED) {
      setIsOperating(false);
      setOperationSuccess(false);
      setToast(operationFailureMessage, 'danger');
    } else {
      setIsOperating(false);
    }
  }, [loadStatus, setToast, accelerationToOperate, dataSource, operationType]);

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
