/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiComboBox,
  EuiComboBoxOptionOption,
  EuiDescriptionList,
  EuiDescriptionListDescription,
  EuiDescriptionListTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiCompressedFormRow,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import producer from 'immer';
import React, { useEffect, useState } from 'react';
import { CoreStart } from '../../../../../../../../../../src/core/public';
import { DATACONNECTIONS_BASE } from '../../../../../../../../common/constants/shared';
import {
  CachedDataSourceStatus,
  CachedDatabase,
  CreateAccelerationForm,
  DatasourceType,
} from '../../../../../../../../common/types/data_connections';
import { CatalogCacheManager } from '../../../../../../../framework/catalog_cache/cache_manager';
import { useToast } from '../../../../../../common/toast';
import { hasError, validateDataTable, validateDatabase } from '../create/utils';
import { SelectorLoadDatabases } from './selector_helpers/load_databases';
import { SelectorLoadObjects } from './selector_helpers/load_objects';

export type BaseDataSourceForm = Pick<
  CreateAccelerationForm,
  'dataSource' | 'database' | 'dataTable'
> & { formErrors: Partial<CreateAccelerationForm['formErrors']> };

type DataSourceFormProps =
  | {
      formType: 'CreateAcceleration';
      dataSourceFormData: CreateAccelerationForm;
      setDataSourceFormData: React.Dispatch<React.SetStateAction<CreateAccelerationForm>>;
    }
  | {
      formType: 'SetupIntegration';
      dataSourceFormData: BaseDataSourceForm;
      setDataSourceFormData: React.Dispatch<React.SetStateAction<BaseDataSourceForm>>;
    };

interface DataSourceSelectorProps {
  http: CoreStart['http'];
  dataSourceFormProps: DataSourceFormProps;
  selectedDatasource: string;
  selectedDataSourceType: DatasourceType;
  dataSourcesPreselected: boolean;
  tableFieldsLoading: boolean;
  dataSourceMDSId?: string;
  hideHeader?: boolean;
  hideDataSourceDescription?: boolean;
}

export const DataSourceSelector: React.FC<DataSourceSelectorProps> = ({
  http,
  dataSourceFormProps: { dataSourceFormData, formType, setDataSourceFormData },
  selectedDatasource,
  selectedDataSourceType,
  dataSourcesPreselected,
  tableFieldsLoading,
  dataSourceMDSId,
  hideHeader,
  hideDataSourceDescription,
}) => {
  const { setToast } = useToast();
  const [databases, setDatabases] = useState<Array<EuiComboBoxOptionOption<string>>>([]);
  const [selectedDatabase, setSelectedDatabase] = useState<Array<EuiComboBoxOptionOption<string>>>(
    []
  );
  const [tables, setTables] = useState<Array<EuiComboBoxOptionOption<string>>>([]);
  const [selectedTable, setSelectedTable] = useState<Array<EuiComboBoxOptionOption<string>>>([]);
  const [loadingComboBoxes, setLoadingComboBoxes] = useState({
    dataSource: false,
    database: false,
    dataTable: false,
  });

  const dataSourceDescription = hideDataSourceDescription ? null : (
    <EuiDescriptionList>
      <EuiDescriptionListTitle>Data source</EuiDescriptionListTitle>
      <EuiDescriptionListDescription>{dataSourceFormData.dataSource}</EuiDescriptionListDescription>
    </EuiDescriptionList>
  );

  const loadDataSource = () => {
    if (formType === 'SetupIntegration') {
      return;
    }
    setLoadingComboBoxes({ ...loadingComboBoxes, dataSource: true });
    http
      .get(`${DATACONNECTIONS_BASE}/dataSourceMDSId=${dataSourceMDSId ?? ''}`)
      .then((res) => {
        const isValidDataSource = res.some(
          (connection: any) =>
            ['S3GLUE', 'SECURITYLAKE'].includes(connection.connector.toUpperCase()) &&
            connection.name === selectedDatasource
        );

        if (!isValidDataSource) {
          setToast(`Received an invalid datasource in create acceleration flyout`, 'danger');
        }
      })
      .catch((err) => {
        console.error(err);
        setToast(`failed to load datasources`, 'danger');
      });
    setLoadingComboBoxes({ ...loadingComboBoxes, dataSource: false });
  };

  const loadDatabases = () => {
    const dsCache = CatalogCacheManager.getOrCreateDataSource(dataSourceFormData.dataSource);

    if (dsCache.status === CachedDataSourceStatus.Updated && dsCache.databases.length > 0) {
      const databaseLabels = dsCache.databases.map((db) => ({ label: db.name }));
      setDatabases(databaseLabels);
    } else if (
      (dsCache.status === CachedDataSourceStatus.Updated && dsCache.databases.length === 0) ||
      dsCache.status === CachedDataSourceStatus.Empty
    ) {
      setDatabases([]);
    }

    setSelectedDatabase([]);
    setTables([]);
    setSelectedTable([]);
    setDataSourceFormData({ ...(dataSourceFormData as any), database: '', dataTable: '' });
  };

  const loadTables = () => {
    if (selectedDatabase.length > 0) {
      let dbCache = {} as CachedDatabase;
      try {
        dbCache = CatalogCacheManager.getDatabase(
          dataSourceFormData.dataSource,
          dataSourceFormData.database
        );
        if (dbCache.status === CachedDataSourceStatus.Updated && dbCache.tables.length > 0) {
          const tableLabels = dbCache.tables.map((tb) => ({ label: tb.name }));
          setTables(tableLabels);
        } else if (
          (dbCache.status === CachedDataSourceStatus.Updated && dbCache.tables.length === 0) ||
          dbCache.status === CachedDataSourceStatus.Empty
        ) {
          setTables([]);
        }
      } catch (error) {
        setTables([]);
        setToast('Your cache is outdated, refresh databases and tables', 'warning');
        console.error(error);
      }
      setSelectedTable([]);
      setDataSourceFormData({ ...(dataSourceFormData as any), dataTable: '' });
    }
  };

  useEffect(() => {
    loadDataSource();
  }, []);

  useEffect(() => {
    if (dataSourceFormData.dataSource !== '') {
      loadDatabases();
    }
  }, [dataSourceFormData.dataSource]);

  useEffect(() => {
    if (dataSourceFormData.database !== '') {
      loadTables();
    }
  }, [dataSourceFormData.database]);

  return (
    <>
      {!hideHeader && (
        <>
          <EuiText data-test-subj="datasource-selector-header">
            <h3>Select data source</h3>
          </EuiText>
          <EuiSpacer size="s" />
          <EuiText size="s" color="subdued">
            Select the data source to accelerate data from. External data sources may take time to
            load.
          </EuiText>
          <EuiSpacer size="m" />
        </>
      )}
      {dataSourcesPreselected ? (
        <>
          <EuiFlexGroup>
            <EuiFlexItem>{dataSourceDescription}</EuiFlexItem>
            <EuiFlexItem>
              <EuiDescriptionList>
                <EuiDescriptionListTitle>Database</EuiDescriptionListTitle>
                <EuiDescriptionListDescription>
                  {dataSourceFormData.database}
                </EuiDescriptionListDescription>
              </EuiDescriptionList>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiDescriptionList>
                <EuiDescriptionListTitle>Table</EuiDescriptionListTitle>
                <EuiDescriptionListDescription>
                  {dataSourceFormData.dataTable}
                </EuiDescriptionListDescription>
              </EuiDescriptionList>
            </EuiFlexItem>
          </EuiFlexGroup>
        </>
      ) : (
        <>
          {dataSourceDescription}
          <EuiSpacer size="m" />
          <EuiCompressedFormRow
            label="Database"
            helpText="Select the database that contains the tables you'd like to use."
            isInvalid={hasError(dataSourceFormData.formErrors, 'databaseError')}
            error={dataSourceFormData.formErrors.databaseError}
          >
            <EuiFlexGroup gutterSize="s">
              <EuiFlexItem>
                <EuiComboBox
                  placeholder="Select a database"
                  singleSelection={{ asPlainText: true }}
                  options={databases}
                  selectedOptions={selectedDatabase}
                  onChange={(databaseOptions) => {
                    if (databaseOptions.length > 0) {
                      setDataSourceFormData(
                        producer((accData) => {
                          accData.database = databaseOptions[0].label;
                          accData.formErrors.databaseError = validateDatabase(
                            databaseOptions[0].label
                          );
                        })
                      );
                      setSelectedDatabase(databaseOptions);
                    }
                  }}
                  isClearable={false}
                  isInvalid={hasError(dataSourceFormData.formErrors, 'databaseError')}
                  isDisabled={
                    loadingComboBoxes.database || loadingComboBoxes.dataTable || tableFieldsLoading
                  }
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <SelectorLoadDatabases
                  dataSourceName={dataSourceFormData.dataSource}
                  loadDatabases={loadDatabases}
                  loadingComboBoxes={loadingComboBoxes}
                  setLoadingComboBoxes={setLoadingComboBoxes}
                  tableFieldsLoading={tableFieldsLoading}
                  dataSourceMDSId={dataSourceMDSId}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiCompressedFormRow>
          <EuiCompressedFormRow
            label="Table"
            helpText={
              tableFieldsLoading
                ? 'Loading tables fields'
                : 'Select the Spark table that has the data you would like to index.'
            }
            isInvalid={hasError(dataSourceFormData.formErrors, 'dataTableError')}
            error={dataSourceFormData.formErrors.dataTableError}
          >
            <EuiFlexGroup gutterSize="s">
              <EuiFlexItem>
                <EuiComboBox
                  placeholder="Select a table"
                  singleSelection={{ asPlainText: true }}
                  options={tables}
                  selectedOptions={selectedTable}
                  onChange={(tableOptions) => {
                    if (tableOptions.length > 0) {
                      setDataSourceFormData(
                        producer((accData) => {
                          accData.dataTable = tableOptions[0].label;
                          accData.formErrors.dataTableError = validateDataTable(
                            tableOptions[0].label
                          );
                        })
                      );
                      setSelectedTable(tableOptions);
                    }
                  }}
                  isClearable={false}
                  isInvalid={hasError(dataSourceFormData.formErrors, 'dataTableError')}
                  isDisabled={
                    loadingComboBoxes.database || loadingComboBoxes.dataTable || tableFieldsLoading
                  }
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <SelectorLoadObjects
                  dataSourceName={dataSourceFormData.dataSource}
                  dataSourceType={selectedDataSourceType}
                  databaseName={dataSourceFormData.database}
                  loadTables={loadTables}
                  loadingComboBoxes={loadingComboBoxes}
                  setLoadingComboBoxes={setLoadingComboBoxes}
                  tableFieldsLoading={tableFieldsLoading}
                  dataSourceMDSId={dataSourceMDSId}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiCompressedFormRow>
        </>
      )}
    </>
  );
};
