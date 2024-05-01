/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiButtonIcon, EuiLoadingSpinner } from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { DirectQueryLoadingStatus } from '../../../../../../../../../common/types/explorer';
import { useLoadDatabasesToCache } from '../../../../../../../../framework/catalog_cache/cache_loader';

interface SelectorLoadDatabasesProps {
  dataSourceName: string;
  loadDatabases: () => void;
  loadingComboBoxes: {
    dataSource: boolean;
    database: boolean;
    dataTable: boolean;
  };
  setLoadingComboBoxes: React.Dispatch<
    React.SetStateAction<{
      dataSource: boolean;
      database: boolean;
      dataTable: boolean;
    }>
  >;
  tableFieldsLoading: boolean;
}

export const SelectorLoadDatabases = ({
  dataSourceName,
  loadDatabases,
  loadingComboBoxes,
  setLoadingComboBoxes,
  tableFieldsLoading,
}: SelectorLoadDatabasesProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const {
    loadStatus: loadDatabasesStatus,
    startLoading: startDatabasesLoading,
    stopLoading: stopDatabasesLoading,
  } = useLoadDatabasesToCache();

  const onClickRefreshDatabases = () => {
    setIsLoading(true);
    startDatabasesLoading({ dataSourceName });
  };

  useEffect(() => {
    const status = loadDatabasesStatus.toLowerCase();
    if (status === DirectQueryLoadingStatus.SUCCESS) {
      loadDatabases();
      setIsLoading(false);
    } else if (
      status === DirectQueryLoadingStatus.FAILED ||
      status === DirectQueryLoadingStatus.CANCELED
    ) {
      setIsLoading(false);
    }
  }, [loadDatabasesStatus]);

  useEffect(() => {
    setLoadingComboBoxes({ ...loadingComboBoxes, database: isLoading });
  }, [isLoading]);

  useEffect(() => {
    return () => {
      stopDatabasesLoading();
    };
  }, []);

  return (
    <>
      {isLoading ? (
        <EuiLoadingSpinner size="xl" />
      ) : (
        <EuiButtonIcon
          iconType="refresh"
          size="m"
          display="base"
          onClick={onClickRefreshDatabases}
          isDisabled={
            loadingComboBoxes.database || loadingComboBoxes.dataTable || tableFieldsLoading
          }
        />
      )}
    </>
  );
};
