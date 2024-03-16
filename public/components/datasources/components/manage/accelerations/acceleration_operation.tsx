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

    if (
      loadStatus === DirectQueryLoadingStatus.RUNNING ||
      loadStatus === DirectQueryLoadingStatus.WAITING ||
      loadStatus === DirectQueryLoadingStatus.SCHEDULED
    ) {
      const operationInProgressMessage = `${
        operationType === 'delete' ? 'Deleting' : 'Vacuuming'
      } acceleration: ${displayAccelerationName}`;
      setToast(operationInProgressMessage, 'success');
      setIsOperating(true);
    } else if (loadStatus === DirectQueryLoadingStatus.SUCCESS) {
      const operationSuccessMessage = `${
        operationType === 'delete' ? 'Successfully deleted' : 'Successfully vacuumed'
      } acceleration: ${displayAccelerationName}`;
      setToast(operationSuccessMessage, 'success');
      setAccelerationToOperate(null);
      setIsOperating(false);
      setOperationSuccess(true);
    } else if (loadStatus === DirectQueryLoadingStatus.FAILED) {
      setToast(`Failed to ${operationType} acceleration: ${displayAccelerationName}`, 'danger');
      setIsOperating(false);
      setOperationSuccess(false);
    }
  }, [loadStatus, setToast, accelerationToOperate, dataSource, operationType]);

  const performOperation = (acceleration: CachedAcceleration, operation: 'delete' | 'vacuum') => {
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
