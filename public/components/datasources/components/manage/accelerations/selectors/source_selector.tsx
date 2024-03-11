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
  EuiFormRow,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import producer from 'immer';
import React, { useEffect, useState } from 'react';
import { CoreStart } from '../../../../../../../../../src/core/public';
import { DATACONNECTIONS_BASE } from '../../../../../../../common/constants/shared';
import { CreateAccelerationForm } from '../../../../../../../common/types/data_connections';
import { useToast } from '../../../../../common/toast';
import { hasError, validateDataTable, validateDatabase } from '../create/utils';

interface AccelerationDataSourceSelectorProps {
  http: CoreStart['http'];
  accelerationFormData: CreateAccelerationForm;
  setAccelerationFormData: React.Dispatch<React.SetStateAction<CreateAccelerationForm>>;
  selectedDatasource: string;
}

export const AccelerationDataSourceSelector = ({
  http,
  accelerationFormData,
  setAccelerationFormData,
  selectedDatasource,
}: AccelerationDataSourceSelectorProps) => {
  const { setToast } = useToast();
  const [databases, _setDatabases] = useState<Array<EuiComboBoxOptionOption<string>>>([]);
  const [selectedDatabase, setSelectedDatabase] = useState<Array<EuiComboBoxOptionOption<string>>>(
    []
  );
  const [tables, _setTables] = useState<Array<EuiComboBoxOptionOption<string>>>([]);
  const [selectedTable, setSelectedTable] = useState<Array<EuiComboBoxOptionOption<string>>>([]);
  const [loadingComboBoxes, setLoadingComboBoxes] = useState({
    dataSource: false,
    database: false,
    dataTable: false,
  });

  const loadDataSource = () => {
    setLoadingComboBoxes({ ...loadingComboBoxes, dataSource: true });
    http
      .get(DATACONNECTIONS_BASE)
      .then((res) => {
        const isValidDataSource = res.some(
          (connection: any) =>
            connection.connector.toUpperCase() === 'S3GLUE' &&
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
    // TODO: Load databases from cache
    // setLoadingComboBoxes({ ...loadingComboBoxes, database: true });
    // const query = {
    //   lang: 'sql',
    //   query: `SHOW SCHEMAS IN \`${accelerationFormData.dataSource}\``,
    //   datasource: accelerationFormData.dataSource,
    // };
    // executeAsyncQuery(
    //   accelerationFormData.dataSource,
    //   query,
    //   (response: AsyncApiResponse) => {
    //     const status = response.data.resp.status.toLowerCase();
    //     if (status === AsyncQueryStatus.Success) {
    //       let databaseOptions: Array<EuiComboBoxOptionOption<string>> = [];
    //       if (response.data.resp.datarows.length > 0)
    //         databaseOptions = response.data.resp.datarows.map((subArray: any[]) => ({
    //           label: subArray[0],
    //         }));
    //       setDatabases(databaseOptions);
    //       setLoadingComboBoxes({ ...loadingComboBoxes, database: false });
    //     }
    //     if (status === AsyncQueryStatus.Failed || status === AsyncQueryStatus.Cancelled) {
    //       setLoadingComboBoxes({ ...loadingComboBoxes, database: false });
    //     }
    //   },
    //   () => setLoadingComboBoxes({ ...loadingComboBoxes, database: false })
    // );
  };

  const loadTables = () => {
    // TODO: Load tables from cache
    // setLoadingComboBoxes({ ...loadingComboBoxes, dataTable: true });
    // const query = {
    //   lang: 'sql',
    //   query: `SHOW TABLES IN \`${accelerationFormData.dataSource}\`.\`${accelerationFormData.database}\``,
    //   datasource: accelerationFormData.dataSource,
    // };
    // executeAsyncQuery(
    //   accelerationFormData.dataSource,
    //   query,
    //   (response: AsyncApiResponse) => {
    //     const status = response.data.resp.status.toLowerCase();
    //     if (status === AsyncQueryStatus.Success) {
    //       let dataTableOptions: Array<EuiComboBoxOptionOption<string>> = [];
    //       if (response.data.resp.datarows.length > 0)
    //         dataTableOptions = response.data.resp.datarows.map((subArray) => ({
    //           label: subArray[1],
    //         }));
    //       setTables(dataTableOptions);
    //       setLoadingComboBoxes({ ...loadingComboBoxes, dataTable: false });
    //     }
    //     if (status === AsyncQueryStatus.Failed || status === AsyncQueryStatus.Cancelled) {
    //       setLoadingComboBoxes({ ...loadingComboBoxes, dataTable: false });
    //     }
    //   },
    //   () => setLoadingComboBoxes({ ...loadingComboBoxes, dataTable: false })
    // );
  };

  useEffect(() => {
    loadDataSource();
  }, []);

  useEffect(() => {
    if (accelerationFormData.dataSource !== '') {
      loadDatabases();
    }
  }, [accelerationFormData.dataSource]);

  useEffect(() => {
    if (accelerationFormData.database !== '') {
      loadTables();
    }
  }, [accelerationFormData.database]);

  return (
    <>
      <EuiText data-test-subj="datasource-selector-header">
        <h3>Select data source</h3>
      </EuiText>
      <EuiSpacer size="s" />
      <EuiText size="s" color="subdued">
        Select the data source to accelerate data from. External data sources may take time to load.
      </EuiText>
      <EuiSpacer size="m" />
      <EuiDescriptionList>
        <EuiDescriptionListTitle>Data source</EuiDescriptionListTitle>
        <EuiDescriptionListDescription>{selectedDatasource}</EuiDescriptionListDescription>
      </EuiDescriptionList>
      <EuiSpacer size="m" />
      <EuiFormRow
        label="Database"
        helpText="Select the database that contains the tables you'd like to use."
        isInvalid={hasError(accelerationFormData.formErrors, 'databaseError')}
        error={accelerationFormData.formErrors.databaseError}
      >
        <EuiComboBox
          placeholder="Select a database"
          singleSelection={{ asPlainText: true }}
          options={databases}
          selectedOptions={selectedDatabase}
          onChange={(databaseOptions) => {
            if (databaseOptions.length > 0) {
              setAccelerationFormData(
                producer((accData) => {
                  accData.database = databaseOptions[0].label;
                  accData.formErrors.databaseError = validateDatabase(databaseOptions[0].label);
                })
              );
              setSelectedDatabase(databaseOptions);
            }
          }}
          isClearable={false}
          isInvalid={hasError(accelerationFormData.formErrors, 'databaseError')}
          isLoading={loadingComboBoxes.database}
        />
      </EuiFormRow>
      <EuiFormRow
        label="Table"
        helpText="Select the Spark table that has the data you would like to index."
        isInvalid={hasError(accelerationFormData.formErrors, 'dataTableError')}
        error={accelerationFormData.formErrors.dataTableError}
      >
        <EuiComboBox
          placeholder="Select a table"
          singleSelection={{ asPlainText: true }}
          options={tables}
          selectedOptions={selectedTable}
          onChange={(tableOptions) => {
            if (tableOptions.length > 0) {
              setAccelerationFormData(
                producer((accData) => {
                  accData.dataTable = tableOptions[0].label;
                  accData.formErrors.dataTableError = validateDataTable(tableOptions[0].label);
                })
              );
              setSelectedTable(tableOptions);
            }
          }}
          isClearable={false}
          isInvalid={hasError(accelerationFormData.formErrors, 'dataTableError')}
          isLoading={loadingComboBoxes.dataTable}
        />
      </EuiFormRow>
    </>
  );
};
