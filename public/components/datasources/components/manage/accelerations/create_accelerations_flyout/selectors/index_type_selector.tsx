/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiFormRow,
  EuiLink,
  EuiSpacer,
  EuiSuperSelect,
  EuiText,
  htmlIdGenerator,
} from '@elastic/eui';
import React, { Fragment, useEffect, useState } from 'react';
import {
  ACCELERATION_DEFUALT_SKIPPING_INDEX_NAME,
  ACC_INDEX_TYPE_DOCUMENTATION_URL,
} from '../../../../../../../../common/constants/data_sources';
import {
  AccelerationIndexType,
  CachedTable,
  CreateAccelerationForm,
} from '../../../../../../../../common/types/data_connections';
import { DirectQueryLoadingStatus } from '../../../../../../../../common/types/explorer';
import { useLoadTableColumnsToCache } from '../../../../../../../framework/catalog_cache/cache_loader';
import { CatalogCacheManager } from '../../../../../../../framework/catalog_cache/cache_manager';

interface IndexTypeSelectorProps {
  accelerationFormData: CreateAccelerationForm;
  setAccelerationFormData: React.Dispatch<React.SetStateAction<CreateAccelerationForm>>;
  dataSourcesPreselected: boolean;
}

export const IndexTypeSelector = ({
  accelerationFormData,
  setAccelerationFormData,
  dataSourcesPreselected,
}: IndexTypeSelectorProps) => {
  const [loading, setLoading] = useState(false);
  const [value, setValue] = useState('skipping');
  const { loadStatus, startLoading } = useLoadTableColumnsToCache();

  const onChangeSupeSelect = (indexType: string) => {
    setAccelerationFormData({
      ...accelerationFormData,
      accelerationIndexType: indexType as AccelerationIndexType,
      accelerationIndexName:
        indexType === 'skipping' ? ACCELERATION_DEFUALT_SKIPPING_INDEX_NAME : '',
    });
    setValue(indexType);
  };

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
    setAccelerationFormData({
      ...accelerationFormData,
      dataTableFields: [],
    });
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
        accelerationFormData.dataSource,
        accelerationFormData.database,
        accelerationFormData.dataTable
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

  useEffect(() => {
    initiateColumnLoad(
      accelerationFormData.dataSource,
      accelerationFormData.database,
      accelerationFormData.dataTable
    );
  }, [accelerationFormData.dataTable]);

  useEffect(() => {
    if (dataSourcesPreselected) {
      initiateColumnLoad(
        accelerationFormData.dataSource,
        accelerationFormData.database,
        accelerationFormData.dataTable
      );
    }
  }, [dataSourcesPreselected]);

  const superSelectOptions = [
    {
      value: 'skipping',
      inputDisplay: 'Skipping index',
      dropdownDisplay: (
        <Fragment>
          <strong>Skipping index</strong>
          <EuiText size="s" color="subdued">
            <p className="EuiTextColor--subdued">
              Accelerate direct queries by storing table meta-data in OpenSearch.
            </p>
          </EuiText>
        </Fragment>
      ),
    },
    {
      value: 'covering',
      inputDisplay: 'Covering index',
      dropdownDisplay: (
        <Fragment>
          <strong>Covering index</strong>
          <EuiText size="s" color="subdued">
            <p className="EuiTextColor--subdued">
              Accelerate queries from subset of table data stored in OpenSearch.
            </p>
          </EuiText>
        </Fragment>
      ),
    },
    {
      value: 'materialized',
      inputDisplay: 'Materialized view',
      dropdownDisplay: (
        <Fragment>
          <strong>Materialized view</strong>
          <EuiText size="s" color="subdued">
            <p className="EuiTextColor--subdued">
              Accelerate queries and visualizations from aggregated table results stored in
              OpenSearch.
            </p>
          </EuiText>
        </Fragment>
      ),
    },
  ];

  return (
    <>
      <EuiText data-test-subj="acceleration-setting-header">
        <h3>Acceleration setting</h3>
      </EuiText>
      <EuiSpacer size="s" />
      <EuiFormRow
        label="Index type"
        helpText="Select the type of index you want to create. Each index type has benefits and costs."
        labelAppend={
          <EuiText size="xs">
            <EuiLink href={ACC_INDEX_TYPE_DOCUMENTATION_URL} target="_blank">
              Help
            </EuiLink>
          </EuiText>
        }
      >
        <EuiSuperSelect
          options={superSelectOptions}
          valueOfSelected={value}
          onChange={onChangeSupeSelect}
          itemLayoutAlign="top"
          hasDividers
          isLoading={loading}
        />
      </EuiFormRow>
    </>
  );
};
