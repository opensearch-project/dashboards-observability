/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { CachedAcceleration } from '../../../../../../common/types/data_connections';
import { useToast } from '../../../../common/toast';
import { useDirectQuery } from '../../../../../framework/datasources/direct_query_hook';
import { DirectQueryLoadingStatus } from '../../../../../../common/types/explorer';
import { generateAccelerationDeletionQuery, getAccelerationName } from './utils/acceleration_utils';

export interface DeleteVcuumAccelerationProps {
  acceleration: CachedAcceleration;
  dataSource: string;
}

export const useDeleteAcceleration = (dataSource: string) => {
  const { startLoading, loadStatus } = useDirectQuery();
  const { setToast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [accelerationToDelete, setAccelerationToDelete] = useState<CachedAcceleration | null>(null);

  useEffect(() => {
    if (!accelerationToDelete) return;
    const displayAccelerationName = getAccelerationName(
      accelerationToDelete.indexName,
      accelerationToDelete,
      dataSource
    );

    if (loadStatus === DirectQueryLoadingStatus.SUCCESS) {
      setToast(`Successfully deleted acceleration: ${displayAccelerationName}`, 'success');
      setAccelerationToDelete(null);
      setIsDeleting(false);
    } else if (loadStatus === DirectQueryLoadingStatus.FAILED) {
      setToast(`Failed to delete acceleration: ${displayAccelerationName}`, 'danger');
      setIsDeleting(false);
    }
  }, [loadStatus, setToast, accelerationToDelete, dataSource]);

  const deleteAcceleration = (acceleration: CachedAcceleration) => {
    const deletionQuery = generateAccelerationDeletionQuery(acceleration, dataSource);

    const requestPayload = {
      lang: 'sql',
      query: deletionQuery,
      datasource: dataSource,
    };

    setIsDeleting(true);
    setAccelerationToDelete(acceleration);
    startLoading(requestPayload);
  };

  return { deleteAcceleration, isDeleting };
};
