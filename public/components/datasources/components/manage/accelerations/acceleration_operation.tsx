/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { i18n } from '@osd/i18n';
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
        operationInProgressMessage = i18n.translate('useAccelerationOperation.deletingInProgress', {
          defaultMessage: 'Deleting acceleration: {displayAccelerationName}',
          values: { displayAccelerationName },
        });
        operationSuccessMessage = i18n.translate('useAccelerationOperation.deleteSuccess', {
          defaultMessage: 'Successfully deleted acceleration: {displayAccelerationName}',
          values: { displayAccelerationName },
        });
        operationFailureMessage = i18n.translate('useAccelerationOperation.deleteFailure', {
          defaultMessage: 'Failed to delete acceleration: {displayAccelerationName}',
          values: { displayAccelerationName },
        });
        break;
      case 'vacuum':
        operationInProgressMessage = i18n.translate('useAccelerationOperation.vacuumInProgress', {
          defaultMessage: 'Vacuuming acceleration: {displayAccelerationName}',
          values: { displayAccelerationName },
        });
        operationSuccessMessage = i18n.translate('useAccelerationOperation.vacuumSuccess', {
          defaultMessage: 'Successfully vacuumed acceleration: {displayAccelerationName}',
          values: { displayAccelerationName },
        });
        operationFailureMessage = i18n.translate('useAccelerationOperation.vacuumFailure', {
          defaultMessage: 'Failed to vacuum acceleration: {displayAccelerationName}',
          values: { displayAccelerationName },
        });
        break;
      case 'sync':
        operationInProgressMessage = i18n.translate('useAccelerationOperation.syncInProgress', {
          defaultMessage: 'Syncing acceleration: {displayAccelerationName}',
          values: { displayAccelerationName },
        });
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
