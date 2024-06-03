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
  IntegrationConnectionInputs,
  IntegrationDetailsInputs,
  IntegrationQueryInputs,
  IntegrationWorkflowsInputs,
} from './setup_integration_inputs';

export const SetupIntegrationInputsForSecurityLake = ({
  config,
  updateConfig,
  integration,
  setupCallout,
  lockConnectionType,
}: IntegrationConfigProps) => {
  const http = coreRefs.http!;
  const [dataSourceFormData, setDataSourceFormData] = useState<BaseDataSourceForm>({
    dataSource: config.connectionDataSource,
    database: config.connectionDatabaseName || '',
    dataTable: config.connectionTableName,
    formErrors: {},
  });

  const [securityLakeWorkflows, setSecurityLakeWorkflows] = useState<
    IntegrationWorkflow[] | undefined
  >(undefined);

  useEffect(() => {
    updateConfig({
      connectionDatabaseName: dataSourceFormData.database,
      connectionTableName: dataSourceFormData.dataTable,
    });
  }, [dataSourceFormData]);

  useEffect(() => {
    setDataSourceFormData({
      ...dataSourceFormData,
      dataSource: config.connectionDataSource,
    });
  }, [config.connectionDataSource]);

  useEffect(() => {
    // TODO: Refactor the filter condition to use `applicable_data_sources` #1855
    setSecurityLakeWorkflows(
      integration.workflows?.filter((workflow) => workflow.name.includes('security-lake'))
    );
  }, integration.workflows);

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
      />
      <EuiSpacer />
      <EuiText>
        <h3>Integration data location</h3>
      </EuiText>

      {!lockConnectionType && (
        <>
          <EuiSpacer />
          <IntegrationConnectionInputs
            config={config}
            updateConfig={updateConfig}
            integration={integration}
            lockConnectionType={lockConnectionType}
          />
        </>
      )}

      <EuiSpacer size="s" />
      <DataSourceSelector
        http={http!}
        dataSourceFormProps={{
          formType: 'SetupIntegration',
          dataSourceFormData,
          setDataSourceFormData,
        }}
        selectedDatasource={config.connectionDataSource}
        selectedDataSourceType="SecurityLake"
        dataSourcesPreselected={false}
        tableFieldsLoading={false}
        hideHeader={true}
        hideDataSourceDescription={!lockConnectionType}
      />

      <EuiSpacer size="m" />

      <IntegrationQueryInputs
        config={config}
        updateConfig={updateConfig}
        integration={integration}
        isS3ConnectionWithLakeFormation={true}
      />
      {securityLakeWorkflows && (
        <>
          <EuiSpacer />
          <EuiText>
            <h3>Included resources</h3>
          </EuiText>
          <EuiFormRow>
            <EuiText grow={false} size="xs">
              <p>
                This integration offers resources compatible with your data source. These can
                include dashboards, visualizations, indexes, and queries. Select at least one of the
                following options.
              </p>
            </EuiText>
          </EuiFormRow>
          <EuiSpacer />
          <IntegrationWorkflowsInputs
            updateConfig={updateConfig}
            workflows={securityLakeWorkflows}
          />
        </>
      )}
      {/* Bottom bar will overlap content if there isn't some space at the end */}
      <EuiSpacer />
      <EuiSpacer />
    </>
  );
};
