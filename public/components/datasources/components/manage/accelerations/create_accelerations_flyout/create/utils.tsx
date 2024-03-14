/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { htmlIdGenerator } from '@elastic/eui';
import { useEffect, useState } from 'react';
import {
  ACCELERATION_INDEX_NAME_REGEX,
  ACCELERATION_S3_URL_REGEX,
} from '../../../../../../../../common/constants/data_sources';
import {
  AccelerationIndexType,
  AccelerationRefreshType,
  CachedTable,
  CreateAccelerationForm,
  DataTableFieldsType,
  FormErrorsType,
  MaterializedViewQueryType,
  SkippingIndexRowType,
} from '../../../../../../../../common/types/data_connections';
import { DirectQueryLoadingStatus } from '../../../../../../../../common/types/explorer';
import { useLoadTableColumnsToCache } from '../../../../../../../framework/catalog_cache/cache_loader';
import { CatalogCacheManager } from '../../../../../../../framework/catalog_cache/cache_manager';

export const pluralizeTime = (timeWindow: number) => {
  return timeWindow > 1 ? 's' : '';
};

export const hasError = (formErrors: FormErrorsType, key?: keyof FormErrorsType) => {
  if (!key) return Object.values(formErrors).some((e) => !!e.length);
  return !!formErrors[key]?.length;
};

export const validateDataSource = (dataSource: string) => {
  return dataSource.trim().length === 0 ? ['Select a valid data source'] : [];
};

export const validateDatabase = (database: string) => {
  return database.trim().length === 0 ? ['Select a valid database'] : [];
};

export const validateDataTable = (dataTable: string) => {
  return dataTable.trim().length === 0 ? ['Select a valid table'] : [];
};

export const validatePrimaryShardCount = (primaryShardCount: number) => {
  return primaryShardCount < 1 ? ['Primary shards count should be greater than 0'] : [];
};

export const validateReplicaCount = (replicaCount: number) => {
  return replicaCount < 0 ? ['Replica count should be equal or greater than 0'] : [];
};

export const validateRefreshInterval = (
  refreshType: AccelerationRefreshType,
  refreshWindow: number
) => {
  return refreshType !== 'auto' && refreshType !== 'manual' && refreshWindow < 1
    ? ['refresh window should be greater than 0']
    : [];
};

export const validateWatermarkDelay = (
  accelerationIndexType: AccelerationIndexType,
  delayWindow: number
) => {
  return accelerationIndexType === 'materialized' && delayWindow < 1
    ? ['delay window should be greater than 0']
    : [];
};

export const validateIndexName = (value: string) => {
  // Check if the value does not begin with underscores or hyphens and all characters are lower case
  return !ACCELERATION_INDEX_NAME_REGEX.test(value) ? ['Enter a valid index name'] : [];
};

export const validateCheckpointLocation = (
  refreshType: AccelerationRefreshType,
  checkpointLocation: string | undefined
) => {
  if (refreshType !== 'manual' && !checkpointLocation) {
    return ['Checkpoint location is mandatory for auto refresh'];
  }

  if (checkpointLocation && !ACCELERATION_S3_URL_REGEX.test(checkpointLocation))
    return ['Enter a valid checkpoint location'];

  return [];
};

export const validateSkippingIndexData = (
  accelerationIndexType: AccelerationIndexType,
  skippingIndexQueryData: SkippingIndexRowType[]
) => {
  // TODO: Validate dataType match with supported acceleration method type
  if (accelerationIndexType !== 'skipping') return [];

  if (skippingIndexQueryData.length < 1) return ['Add fields to the skipping index definition'];

  return [];
};

export const validateCoveringIndexData = (
  accelerationIndexType: AccelerationIndexType,
  coveringIndexQueryData: string[]
) => {
  if (accelerationIndexType !== 'covering') return [];

  if (coveringIndexQueryData.length < 1) return ['Add fields to covering index definition'];
  return [];
};

export const validateMaterializedViewData = (
  accelerationIndexType: AccelerationIndexType,
  materializedViewQueryData: MaterializedViewQueryType
) => {
  if (accelerationIndexType !== 'materialized') return [];

  if (materializedViewQueryData.columnsValues.length < 1)
    return ['Add columns to materialized view definition'];

  if (materializedViewQueryData.groupByTumbleValue.timeField === '')
    return ['Add a time field to tumble function in materialized view definition'];

  if (materializedViewQueryData.groupByTumbleValue.tumbleWindow < 1)
    return ['Add a valid time window to tumble function in materialized view definition'];
  return [];
};

export const formValidator = (accelerationformData: CreateAccelerationForm) => {
  const {
    dataSource,
    database,
    dataTable,
    accelerationIndexType,
    skippingIndexQueryData,
    coveringIndexQueryData,
    materializedViewQueryData,
    accelerationIndexName,
    primaryShardsCount,
    replicaShardsCount,
    refreshType,
    checkpointLocation,
    watermarkDelay,
    refreshIntervalOptions,
  } = accelerationformData;

  const accelerationFormErrors: FormErrorsType = {
    dataSourceError: validateDataSource(dataSource),
    databaseError: validateDatabase(database),
    dataTableError: validateDataTable(dataTable),
    primaryShardsError: validatePrimaryShardCount(primaryShardsCount),
    replicaShardsError: validateReplicaCount(replicaShardsCount),
    refreshIntervalError: validateRefreshInterval(
      refreshType,
      refreshIntervalOptions.refreshWindow
    ),
    checkpointLocationError: validateCheckpointLocation(refreshType, checkpointLocation),
    watermarkDelayError: validateWatermarkDelay(accelerationIndexType, watermarkDelay.delayWindow),
    indexNameError: validateIndexName(accelerationIndexName),
    skippingIndexError: validateSkippingIndexData(accelerationIndexType, skippingIndexQueryData),
    coveringIndexError: validateCoveringIndexData(accelerationIndexType, coveringIndexQueryData),
    materializedViewError: validateMaterializedViewData(
      accelerationIndexType,
      materializedViewQueryData
    ),
  };

  return accelerationFormErrors;
};

export const useDataFieldstoAccelerationForm = (
  updateAccelerationsDataFields: (dataTableFields: DataTableFieldsType[]) => void
) => {
  const [loading, setLoading] = useState(false);
  const { loadStatus, startLoading } = useLoadTableColumnsToCache();
  const [sources, setSources] = useState({
    dataSource: '',
    database: '',
    dataTable: '',
  });

  const loadColumnsToAccelerationForm = (cachedTable: CachedTable) => {
    const idPrefix = htmlIdGenerator()();
    const dataTableFields = cachedTable.columns!.map((col, index: number) => ({
      ...col,
      id: `${idPrefix}${index + 1}`,
    }));

    updateAccelerationsDataFields(dataTableFields);
  };

  const initiateColumnLoad = (dataSource: string, database: string, dataTable: string) => {
    setSources({
      dataSource,
      database,
      dataTable,
    });
    updateAccelerationsDataFields([]);

    if (dataTable !== '') {
      setLoading(true);
      const cachedTable = CatalogCacheManager.getTable(dataSource, database, dataTable);

      if (cachedTable.columns) {
        loadColumnsToAccelerationForm(cachedTable);
        setLoading(false);
      } else {
        startLoading(dataSource, database, dataTable);
      }
    }
  };

  useEffect(() => {
    const status = loadStatus.toLowerCase();
    if (status === DirectQueryLoadingStatus.SUCCESS) {
      const cachedTable = CatalogCacheManager.getTable(
        sources.dataSource,
        sources.database,
        sources.dataTable
      );
      loadColumnsToAccelerationForm(cachedTable);
      setLoading(false);
    } else if (
      status === DirectQueryLoadingStatus.FAILED ||
      status === DirectQueryLoadingStatus.CANCELED
    ) {
      setLoading(false);
    }
  }, [loadStatus]);

  return { loading, initiateColumnLoad };
};
