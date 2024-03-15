/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiButtonIcon, EuiLoadingSpinner } from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { DirectQueryLoadingStatus } from '../../../../../../../../../common/types/explorer';
import {
  useLoadAccelerationsToCache,
  useLoadTablesToCache,
} from '../../../../../../../../framework/catalog_cache/cache_loader';
import { useToast } from '../../../../../../../common/toast';

interface SelectorLoadDatabasesProps {
  dataSourceName: string;
  databaseName: string;
  loadTables: () => void;
}

export const SelectorLoadObjects = ({
  dataSourceName,
  databaseName,
  loadTables,
}: SelectorLoadDatabasesProps) => {
  const { setToast } = useToast();
  const [isLoading, setIsLoading] = useState({
    tableStatus: false,
    accelerationsStatus: false,
  });
  const isEitherLoading = isLoading.accelerationsStatus || isLoading.tableStatus;
  const {
    loadStatus: loadTablesStatus,
    startLoading: startLoadingTables,
    stopLoading: _stopLoadingTables,
  } = useLoadTablesToCache();
  const {
    loadStatus: loadAccelerationsStatus,
    startLoading: startLoadingAccelerations,
    stopLoading: _stopLoadingAccelerations,
  } = useLoadAccelerationsToCache();

  const onClickRefreshDatabases = () => {
    if (databaseName === '') {
      setToast('Please select a database', 'danger');
      return;
    }
    setIsLoading({
      tableStatus: true,
      accelerationsStatus: true,
    });
    startLoadingTables(dataSourceName, databaseName);
    startLoadingAccelerations(dataSourceName);
  };

  useEffect(() => {
    const status = loadTablesStatus.toLowerCase();
    if (status === DirectQueryLoadingStatus.SUCCESS) {
      loadTables();
      setIsLoading({ ...isLoading, tableStatus: false });
    } else if (
      status === DirectQueryLoadingStatus.FAILED ||
      status === DirectQueryLoadingStatus.CANCELED
    ) {
      setIsLoading({ ...isLoading, tableStatus: false });
    }
  }, [loadTablesStatus]);

  useEffect(() => {
    const status = loadAccelerationsStatus.toLowerCase();
    if (
      status === DirectQueryLoadingStatus.SUCCESS ||
      status === DirectQueryLoadingStatus.FAILED ||
      status === DirectQueryLoadingStatus.CANCELED
    ) {
      setIsLoading({ ...isLoading, accelerationsStatus: false });
    }
  }, [loadAccelerationsStatus]);

  return (
    <>
      {isEitherLoading ? (
        <EuiLoadingSpinner size="xl" />
      ) : (
        <EuiButtonIcon
          iconType="refresh"
          size="m"
          display="base"
          onClick={onClickRefreshDatabases}
        />
      )}
    </>
  );
};
