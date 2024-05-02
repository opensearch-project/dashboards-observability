/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiForm,
  EuiSpacer,
  htmlIdGenerator,
} from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import {
  ACCELERATION_DEFUALT_SKIPPING_INDEX_NAME,
  ACCELERATION_REFRESH_TIME_INTERVAL,
  ACCELERATION_TIME_INTERVAL,
} from '../../../../../../../../common/constants/data_sources';
import {
  CachedTable,
  CreateAccelerationForm,
} from '../../../../../../../../common/types/data_connections';
import { DirectQueryLoadingStatus } from '../../../../../../../../common/types/explorer';
import { useLoadTableColumnsToCache } from '../../../../../../../framework/catalog_cache/cache_loader';
import { CatalogCacheManager } from '../../../../../../../framework/catalog_cache/cache_manager';
import { coreRefs } from '../../../../../../../framework/core_refs';
import { useToast } from '../../../../../../common/toast';
import { IndexAdvancedSettings } from '../selectors/index_advanced_settings';
import { IndexSettingOptions } from '../selectors/index_setting_options';
import { IndexTypeSelector } from '../selectors/index_type_selector';
import { PreviewSQLDefinition } from '../selectors/preview_sql_defintion';
import { AccelerationDataSourceSelector } from '../selectors/source_selector';
import { QueryVisualEditor } from '../visual_editors/query_visual_editor';
import { CreateAccelerationButton } from './create_acceleration_button';
import { CreateAccelerationHeader } from './create_acceleration_header';
import { hasError } from './utils';

export interface CreateAccelerationProps {
  selectedDatasource: string;
  resetFlyout: () => void;
  databaseName?: string;
  tableName?: string;
  dataSourceMDSId?: string;
  refreshHandler?: () => void;
}

export const CreateAcceleration = ({
  selectedDatasource,
  resetFlyout,
  databaseName,
  tableName,
  dataSourceMDSId,
  refreshHandler,
}: CreateAccelerationProps) => {
  const { setToast } = useToast();
  const http = coreRefs!.http;
  const [accelerationFormData, setAccelerationFormData] = useState<CreateAccelerationForm>({
    dataSource: selectedDatasource,
    database: databaseName ?? '',
    dataTable: tableName ?? '',
    dataTableFields: [],
    accelerationIndexType: 'skipping',
    skippingIndexQueryData: [],
    coveringIndexQueryData: [],
    materializedViewQueryData: {
      columnsValues: [],
      groupByTumbleValue: {
        timeField: '',
        tumbleWindow: 0,
        tumbleInterval: ACCELERATION_TIME_INTERVAL[2].value, // minutes
      },
    },
    accelerationIndexName: ACCELERATION_DEFUALT_SKIPPING_INDEX_NAME,
    primaryShardsCount: 1,
    replicaShardsCount: 1,
    refreshType: 'autoInterval',
    checkpointLocation: undefined,
    watermarkDelay: {
      delayWindow: 1,
      delayInterval: ACCELERATION_TIME_INTERVAL[2].value, // minutes
    },
    refreshIntervalOptions: {
      refreshWindow: 15,
      refreshInterval: ACCELERATION_REFRESH_TIME_INTERVAL[0].value, // minutes
    },
    formErrors: {
      dataSourceError: [],
      databaseError: [],
      dataTableError: [],
      skippingIndexError: [],
      coveringIndexError: [],
      materializedViewError: [],
      indexNameError: [],
      primaryShardsError: [],
      replicaShardsError: [],
      refreshIntervalError: [],
      checkpointLocationError: [],
      watermarkDelayError: [],
    },
  });
  const [tableFieldsLoading, setTableFieldsLoading] = useState(false);
  const {
    loadStatus,
    startLoading,
    stopLoading: stopLoadingTableFields,
  } = useLoadTableColumnsToCache();

  const loadColumnsToAccelerationForm = (cachedTable: CachedTable) => {
    const idPrefix = htmlIdGenerator()();
    const dataTableFields = cachedTable.columns!.map((col, index: number) => ({
      ...col,
      id: `${idPrefix}${index + 1}`,
    }));

    setAccelerationFormData({
      ...accelerationFormData,
      dataTableFields,
    });
  };

  const initiateColumnLoad = (dataSource: string, database: string, dataTable: string) => {
    // All components related to table fields
    setAccelerationFormData({
      ...accelerationFormData,
      dataTableFields: [],
      skippingIndexQueryData: [],
      coveringIndexQueryData: [],
      materializedViewQueryData: {
        columnsValues: [],
        groupByTumbleValue: {
          timeField: '',
          tumbleWindow: 0,
          tumbleInterval: ACCELERATION_TIME_INTERVAL[2].value, // minutes
        },
      },
    });
    stopLoadingTableFields();
    if (dataTable !== '') {
      setTableFieldsLoading(true);
      try {
        const cachedTable = CatalogCacheManager.getTable(
          dataSource,
          database,
          dataTable,
          dataSourceMDSId
        );
        if (cachedTable.columns) {
          loadColumnsToAccelerationForm(cachedTable);
          setTableFieldsLoading(false);
        } else {
          startLoading({
            dataSourceName: dataSource,
            dataSourceMDSId,
            databaseName: database,
            tableName: dataTable,
          });
        }
      } catch (error) {
        setToast('Your cache is outdated, refresh databases and tables', 'warning');
        console.error(error);
      }
    }
  };

  useEffect(() => {
    if (databaseName !== undefined && tableName !== undefined) {
      initiateColumnLoad(
        accelerationFormData.dataSource,
        accelerationFormData.database,
        accelerationFormData.dataTable
      );
    }
  }, [databaseName, tableName]);

  useEffect(() => {
    const status = loadStatus.toLowerCase();
    if (status === DirectQueryLoadingStatus.SUCCESS) {
      let cachedTable = {} as CachedTable;
      try {
        cachedTable = CatalogCacheManager.getTable(
          accelerationFormData.dataSource,
          accelerationFormData.database,
          accelerationFormData.dataTable,
          dataSourceMDSId
        );
      } catch (error) {
        setToast('Your cache is outdated, refresh databases and tables', 'warning');
        console.error(error);
      }

      loadColumnsToAccelerationForm(cachedTable);
      setTableFieldsLoading(false);
    } else if (
      status === DirectQueryLoadingStatus.FAILED ||
      status === DirectQueryLoadingStatus.CANCELED
    ) {
      setTableFieldsLoading(false);
    }
  }, [loadStatus]);

  useEffect(() => {
    return () => {
      stopLoadingTableFields();
    };
  }, []);

  const dataSourcesPreselected = databaseName !== undefined && tableName !== undefined;

  return (
    <>
      <EuiFlyout ownFocus onClose={resetFlyout} aria-labelledby="flyoutTitle" size="m">
        <EuiFlyoutHeader hasBorder>
          <CreateAccelerationHeader />
        </EuiFlyoutHeader>
        <EuiFlyoutBody>
          <EuiForm
            isInvalid={hasError(accelerationFormData.formErrors)}
            error={Object.values(accelerationFormData.formErrors).flat()}
            component="div"
            id="acceleration-form"
          >
            <AccelerationDataSourceSelector
              http={http!}
              accelerationFormData={accelerationFormData}
              setAccelerationFormData={setAccelerationFormData}
              selectedDatasource={selectedDatasource}
              dataSourcesPreselected={dataSourcesPreselected}
              tableFieldsLoading={tableFieldsLoading}
              dataSourceMDSId={dataSourceMDSId}
            />
            <EuiSpacer size="xxl" />
            <IndexTypeSelector
              accelerationFormData={accelerationFormData}
              setAccelerationFormData={setAccelerationFormData}
              initiateColumnLoad={initiateColumnLoad}
            />
            <EuiSpacer size="xxl" />
            <IndexSettingOptions
              accelerationFormData={accelerationFormData}
              setAccelerationFormData={setAccelerationFormData}
            />
            <EuiSpacer size="m" />
            <QueryVisualEditor
              accelerationFormData={accelerationFormData}
              setAccelerationFormData={setAccelerationFormData}
              tableFieldsLoading={tableFieldsLoading}
              dataSourceMDSId={dataSourceMDSId}
            />
            <EuiSpacer size="xxl" />
            <IndexAdvancedSettings
              accelerationFormData={accelerationFormData}
              setAccelerationFormData={setAccelerationFormData}
            />
            <EuiSpacer size="l" />
            <PreviewSQLDefinition
              accelerationFormData={accelerationFormData}
              setAccelerationFormData={setAccelerationFormData}
              resetFlyout={resetFlyout}
            />
          </EuiForm>
        </EuiFlyoutBody>
        <EuiFlyoutFooter>
          <EuiFlexGroup justifyContent="spaceBetween">
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty iconType="cross" onClick={resetFlyout} flush="left">
                Cancel
              </EuiButtonEmpty>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <CreateAccelerationButton
                accelerationFormData={accelerationFormData}
                setAccelerationFormData={setAccelerationFormData}
                resetFlyout={resetFlyout}
                refreshHandler={refreshHandler}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutFooter>
      </EuiFlyout>
    </>
  );
};
