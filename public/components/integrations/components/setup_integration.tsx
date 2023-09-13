/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Eui from '@elastic/eui';
import { EuiContainedStepProps } from '@opensearch-project/oui/src/components/steps/steps';
import React, { useState } from 'react';

interface IntegrationConfig {
  instance_name: string;
  datasource_name: string;
  datasource_description: string;
  datasource_filetype: string;
  datasourcee_location: string;
  connection_name: string;
  asset_accel: string;
  query_accel: string;
}

const STEPS: EuiContainedStepProps[] = [
  { title: 'Name Integration', children: <Eui.EuiText /> },
  { title: 'Select index or data source for integration', children: <Eui.EuiText /> },
  { title: 'Select integration assets', children: <Eui.EuiText /> },
];

const ALLOWED_FILE_TYPES: Eui.EuiSelectOption[] = [
  { value: 'parquet', text: 'parquet' },
  { value: 'json', text: 'json' },
];

const INTEGRATION_DATA_TABLE_COLUMNS = [
  {
    field: 'field',
    name: 'Field Name',
  },
  {
    field: 'type',
    name: 'Field Type',
  },
  {
    field: 'isTimestamp',
    name: 'Timestamp',
  },
];

const integrationDataTableData = [
  {
    field: 'spanId',
    type: 'string',
    isTimestamp: false,
  },
  {
    field: 'severity.number',
    type: 'long',
    isTimestamp: false,
  },
  {
    field: '@timestamp',
    type: 'date',
    isTimestamp: true,
  },
];

const getSteps = (activeStep: number): EuiContainedStepProps[] => {
  return STEPS.map((step, idx) => {
    let status: string = '';
    if (idx < activeStep) {
      status = 'complete';
    }
    if (idx > activeStep) {
      status = 'disabled';
    }
    return Object.assign({}, step, { status });
  });
};

function SetupIntegrationMetadata() {
  return (
    <Eui.EuiForm>
      <Eui.EuiTitle>
        <h1>{STEPS[0].title}</h1>
      </Eui.EuiTitle>
      <Eui.EuiFormRow
        label="Name"
        helpText="The name will be used to label the newly added integration"
      >
        <Eui.EuiFieldText />
      </Eui.EuiFormRow>
    </Eui.EuiForm>
  );
}

function SetupIntegrationNewTable() {
  return (
    <Eui.EuiForm>
      <Eui.EuiTitle>
        <h2>{STEPS[1].title}</h2>
      </Eui.EuiTitle>
      <Eui.EuiCallOut title="There was no table found" iconType="iInCircle">
        <p>No problem, we can help. Tell us about your data.</p>
      </Eui.EuiCallOut>
      <Eui.EuiSpacer />
      <Eui.EuiFormRow label="Title">
        <Eui.EuiFieldText />
      </Eui.EuiFormRow>
      <Eui.EuiFormRow label="Description (optional)">
        <Eui.EuiFieldText />
      </Eui.EuiFormRow>
      <Eui.EuiFormRow label="File Type">
        <Eui.EuiSelect options={ALLOWED_FILE_TYPES} />
      </Eui.EuiFormRow>
      <Eui.EuiFormRow label="Location to store table">
        <Eui.EuiFieldText />
      </Eui.EuiFormRow>
    </Eui.EuiForm>
  );
}

function IntegrationDataModal(
  isDataModalVisible: boolean,
  setDataModalVisible: React.Dispatch<React.SetStateAction<boolean>>
): React.JSX.Element | null {
  let dataModal = null;
  if (isDataModalVisible) {
    dataModal = (
      <Eui.EuiModal onClose={() => setDataModalVisible(false)}>
        <Eui.EuiModalHeader>
          <h2>Data Table</h2>
        </Eui.EuiModalHeader>
        <Eui.EuiModalBody>
          <Eui.EuiBasicTable
            items={integrationDataTableData}
            columns={INTEGRATION_DATA_TABLE_COLUMNS}
          />
          <Eui.EuiSpacer />
          <Eui.EuiButton onClick={() => setDataModalVisible(false)} size="s">
            Close
          </Eui.EuiButton>
        </Eui.EuiModalBody>
      </Eui.EuiModal>
    );
  }
  return dataModal;
}

function SetupIntegrationExistingTable(
  isDataModalVisible: boolean,
  setDataModalVisible: React.Dispatch<React.SetStateAction<boolean>>
) {
  return (
    <Eui.EuiForm>
      <Eui.EuiTitle>
        <h1>{STEPS[1].title}</h1>
      </Eui.EuiTitle>
      <Eui.EuiFormRow label="Data" helpText="Manage data associated with this data source">
        <Eui.EuiSelect options={[{ value: 'test_s3', text: 'S3 connection name' }]} />
      </Eui.EuiFormRow>
      <Eui.EuiSpacer />
      <Eui.EuiLink onClick={() => setDataModalVisible(true)}>View table</Eui.EuiLink>
      {IntegrationDataModal(isDataModalVisible, setDataModalVisible)}
    </Eui.EuiForm>
  );
}

function SetupIntegrationAccelerationStandard(
  integConfig: IntegrationConfig,
  setConfig: React.Dispatch<React.SetStateAction<IntegrationConfig>>
) {
  return (
    <Eui.EuiForm>
      <Eui.EuiFormRow
        label="Asset Quantity"
        helpText="Select the amount of assets you want to install"
      >
        <Eui.EuiRadioGroup
          options={[
            {
              id: 'index-only',
              label: (
                <Eui.EuiText>
                  None{': '}
                  <Eui.EuiTextColor color="subdued">
                    Set up indices, but don&apos;t install any assets.
                  </Eui.EuiTextColor>
                </Eui.EuiText>
              ),
            },
            {
              id: 'queries',
              label: (
                <Eui.EuiText>
                  Minimal{': '}
                  <Eui.EuiTextColor color="subdued">
                    Set up indices and include provided saved queries.
                  </Eui.EuiTextColor>
                </Eui.EuiText>
              ),
            },
            {
              id: 'visualizations',
              label: (
                <Eui.EuiText>
                  Complete{': '}
                  <Eui.EuiTextColor color="subdued">
                    Indices, queries, and visualizations for the data.
                  </Eui.EuiTextColor>
                </Eui.EuiText>
              ),
            },
            {
              id: 'all',
              label: (
                <Eui.EuiText>
                  Everything{': '}
                  <Eui.EuiTextColor color="subdued">
                    Includes additional assets such as detectors or geospatial.
                  </Eui.EuiTextColor>
                </Eui.EuiText>
              ),
            },
          ]}
          idSelected={integConfig.asset_accel}
          onChange={(id) => setConfig(Object.assign({}, integConfig, { asset_accel: id }))}
        />
      </Eui.EuiFormRow>

      <Eui.EuiFormRow label="Query Acceleration" helpText="Select your query acceleration option">
        <Eui.EuiRadioGroup
          options={[
            {
              id: 'none',
              label: (
                <Eui.EuiText>
                  None{': '}
                  <Eui.EuiTextColor color="subdued">
                    No acceleration. Cheap, but slow.
                  </Eui.EuiTextColor>
                </Eui.EuiText>
              ),
            },
            {
              id: 'basic',
              label: (
                <Eui.EuiText>
                  Basic{': '}
                  <Eui.EuiTextColor color="subdued">
                    Minimal optimizations balancing performance and cost.
                  </Eui.EuiTextColor>
                </Eui.EuiText>
              ),
            },
            {
              id: 'advanced',
              label: (
                <Eui.EuiText>
                  Advanced{': '}
                  <Eui.EuiTextColor color="subdued">
                    More intensive optimization for better performance.
                  </Eui.EuiTextColor>
                </Eui.EuiText>
              ),
            },
            {
              id: 'ultra',
              label: (
                <Eui.EuiText>
                  Ultra{': '}
                  <Eui.EuiTextColor color="subdued">
                    Ideal for performance-critical indices.
                  </Eui.EuiTextColor>
                </Eui.EuiText>
              ),
            },
          ]}
          idSelected={integConfig.query_accel}
          onChange={(id) => setConfig(Object.assign({}, integConfig, { query_accel: id }))}
        />
      </Eui.EuiFormRow>
    </Eui.EuiForm>
  );
}

function SetupIntegrationAccelerationAdvanced(
  integConfig: IntegrationConfig,
  setConfig: React.Dispatch<React.SetStateAction<IntegrationConfig>>
) {
  return (
    <Eui.EuiBasicTable
      columns={[
        {
          name: 'Name',
          field: 'name',
        },
        {
          name: 'Type',
          field: 'type',
        },
        {
          name: 'Acceleration Details',
          field: 'acceleration',
        },
        {
          name: 'Actions',
          actions: [
            {
              name: 'discover',
              description: 'Discover?',
              type: 'icon',
              icon: 'discoverApp',
              color: 'primary',
              onClick: () => {},
            },
            {
              name: 'configure',
              description: 'Configure Asset',
              type: 'icon',
              icon: 'indexSettings',
              color: 'primary',
              onClick: () => {},
            },
          ],
        },
      ]}
      items={[
        {
          name: '[NGINX Core Logs 1.0] Overview',
          type: 'dashboard',
          acceleration: 'Enhanced',
        },
        {
          name: 'ss4o_logs-*-*',
          type: 'index-pattern',
          acceleration: 'Status',
        },
        {
          name: 'Top Paths',
          type: 'visualization',
          acceleration: 'Query',
        },
      ]}
      hasActions={true}
    />
  );
}

function SetupIntegrationAcceleration(
  integConfig: IntegrationConfig,
  setConfig: React.Dispatch<React.SetStateAction<IntegrationConfig>>,
  isStandard: boolean,
  setIsStandard: React.Dispatch<React.SetStateAction<boolean>>
) {
  return (
    <Eui.EuiForm>
      <Eui.EuiTitle>
        <h1>{STEPS[2].title}</h1>
      </Eui.EuiTitle>
      <Eui.EuiTabs>
        <Eui.EuiTab isSelected={isStandard} onClick={() => setIsStandard(true)}>
          Standard
        </Eui.EuiTab>
        <Eui.EuiTab isSelected={!isStandard} onClick={() => setIsStandard(false)}>
          Advanced
        </Eui.EuiTab>
      </Eui.EuiTabs>
      <Eui.EuiSpacer />
      {isStandard
        ? SetupIntegrationAccelerationStandard(integConfig, setConfig)
        : SetupIntegrationAccelerationAdvanced(integConfig, setConfig)}
    </Eui.EuiForm>
  );
}

function SetupIntegrationStep(activeStep: number) {
  const [integConfig, setConfig] = useState({
    instance_name: 'NginX Access 2.0',
    datasource_name: 'ss4o_logs-nginx-*-*',
    datasource_description: 'Integration for viewing Nginx logs in S3.',
    datasource_filetype: 'parquet',
    datasourcee_location: 'ss4o_logs-nginx-*-*',
    connection_name: 'S3 connection name',
    asset_accel: 'visualizations',
    query_accel: 'basic',
  });
  const [isDataModalVisible, setDataModalVisible] = useState(false);
  const [tableDetected, setTableDetected] = useState(false);
  const [isStandard, setIsStandard] = useState(true);

  switch (activeStep) {
    case 0:
      return SetupIntegrationMetadata();
    case 1:
      let tableForm;
      if (tableDetected) {
        tableForm = SetupIntegrationExistingTable(isDataModalVisible, setDataModalVisible);
      } else {
        tableForm = SetupIntegrationNewTable();
      }
      return (
        <div>
          {tableForm}
          <Eui.EuiSpacer size="xxl" />
          <Eui.EuiSwitch
            label="(debug) Table detected"
            checked={tableDetected}
            onChange={(event) => setTableDetected(event.target.checked)}
          />
        </div>
      );
    case 2:
      return SetupIntegrationAcceleration(integConfig, setConfig, isStandard, setIsStandard);
    default:
      return <Eui.EuiHeader>Something went wrong...</Eui.EuiHeader>;
  }
}

function SetupBottomBar(step: number, setStep: React.Dispatch<React.SetStateAction<number>>) {
  return (
    <Eui.EuiBottomBar>
      <Eui.EuiFlexGroup justifyContent="flexEnd">
        <Eui.EuiFlexItem grow={false}>
          <Eui.EuiButton
            color="danger"
            iconType={'cross'}
            onClick={() => {
              // TODO evil hack because props aren't set up
              let hash = window.location.hash;
              hash = hash.trim();
              hash = hash.substring(0, hash.lastIndexOf('/setup'));
              window.location.hash = hash;
            }}
          >
            Cancel
          </Eui.EuiButton>
        </Eui.EuiFlexItem>
        <Eui.EuiFlexItem>
          <Eui.EuiSpacer />
        </Eui.EuiFlexItem>
        {step > 0 ? (
          <Eui.EuiFlexItem grow={false}>
            <Eui.EuiButton iconType={'returnKey'} onClick={() => setStep(Math.max(step - 1, 0))}>
              Back
            </Eui.EuiButton>
          </Eui.EuiFlexItem>
        ) : null}
        <Eui.EuiFlexItem grow={false}>
          <Eui.EuiButton fill iconType={'check'} onClick={() => setStep(Math.min(step + 1, 2))}>
            {step === STEPS.length - 1 ? 'Save' : 'Next'}
          </Eui.EuiButton>
        </Eui.EuiFlexItem>
      </Eui.EuiFlexGroup>
    </Eui.EuiBottomBar>
  );
}

export function SetupIntegrationStepsPage() {
  const [step, setStep] = useState(0);

  return (
    <Eui.EuiPage>
      <Eui.EuiPageBody>
        <Eui.EuiFlexGroup>
          <Eui.EuiFlexItem>
            <Eui.EuiSteps steps={getSteps(step)} />
          </Eui.EuiFlexItem>
          <Eui.EuiFlexItem>{SetupIntegrationStep(step)}</Eui.EuiFlexItem>
        </Eui.EuiFlexGroup>
        {SetupBottomBar(step, setStep)}
      </Eui.EuiPageBody>
    </Eui.EuiPage>
  );
}
