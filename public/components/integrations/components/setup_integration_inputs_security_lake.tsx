/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  EuiCallOut,
  EuiFormRow,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiHorizontalRule,
} from '@elastic/eui';
import { coreRefs } from '../../../framework/core_refs';
import {
  BaseDataSourceForm,
  DataSourceSelector,
} from '../../datasources/components/manage/accelerations/create_accelerations_flyout/selectors/source_selector';
import { IntegrationConfigProps } from './setup_integration';
import {
  IntegrationDetailsInputs,
  IntegrationQueryInputs,
  IntegrationWorkflowsInputs,
} from './setup_integration_inputs';

export const SetupIntegrationInputsForSecurityLake = ({
  config,
  updateConfig,
  integration,
  setupCallout,
  isS3ConnectionWithLakeFormation,
}: IntegrationConfigProps) => {
  const http = coreRefs.http!;
  const [dataSourceFormData, setDataSourceFormData] = useState<BaseDataSourceForm>({
    dataSource: config.connectionDataSource,
    database: config.connectionDatabaseName || '',
    dataTable: config.connectionTableName,
    formErrors: {},
  });

  useEffect(() => {
    updateConfig({
      connectionDatabaseName: dataSourceFormData.database,
      connectionTableName: dataSourceFormData.dataTable,
    });
  }, [dataSourceFormData]);

  return (
    <>
      <EuiTitle>
        <h1>Add integration</h1>
      </EuiTitle>
      <EuiHorizontalRule margin="s" />
      {setupCallout.show ? (
        <>
          <EuiCallOut title={setupCallout.title} color="danger">
            <p>{setupCallout.text}</p>
          </EuiCallOut>
          <EuiSpacer size="s" />
        </>
      ) : null}
      <IntegrationDetailsInputs
        config={config}
        updateConfig={updateConfig}
        integration={integration}
        isS3ConnectionWithLakeFormation={isS3ConnectionWithLakeFormation}
      />
      <EuiSpacer />
      {config.connectionType === 's3' ? (
        <>
          <EuiText>
            <h3>Integration data location</h3>
          </EuiText>
          <EuiSpacer size="s" />

          <DataSourceSelector
            http={http!}
            dataSourceFormProps={{
              formType: 'SetupIntegration',
              dataSourceFormData,
              setDataSourceFormData,
            }}
            selectedDatasource={config.connectionDataSource}
            dataSourcesPreselected={false}
            tableFieldsLoading={false}
          />

          <EuiSpacer size="m" />

          <IntegrationQueryInputs
            config={config}
            updateConfig={updateConfig}
            integration={integration}
            isS3ConnectionWithLakeFormation={isS3ConnectionWithLakeFormation}
          />
          {integration.workflows ? (
            <>
              <EuiSpacer />
              <EuiText>
                <h3>Included resources</h3>
              </EuiText>
              <EuiFormRow>
                <EuiText grow={false} size="xs">
                  <p>
                    This integration offers resources compatible with your data source. These can
                    include dashboards, visualizations, indexes, and queries. Select at least one of
                    the following options.
                  </p>
                </EuiText>
              </EuiFormRow>
              <EuiSpacer />
              <IntegrationWorkflowsInputs updateConfig={updateConfig} integration={integration} />
            </>
          ) : null}
          {/* Bottom bar will overlap content if there isn't some space at the end */}
          <EuiSpacer />
          <EuiSpacer />
        </>
      ) : null}
    </>
  );
};
