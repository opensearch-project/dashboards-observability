/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiTabs } from '@elastic/eui';
import { EuiTab } from '@elastic/eui';
import { EuiIcon } from '@elastic/eui';
import {
  EuiBottomBar,
  EuiButton,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiFormRow,
  EuiLink,
  EuiHeader,
  EuiPage,
  EuiPageBody,
  EuiSelect,
  EuiSelectOption,
  EuiSteps,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiRadioGroup,
  EuiTextColor,
  EuiModal,
  EuiModalHeader,
  EuiModalBody,
  EuiBasicTable,
  EuiSwitch,
  EuiCallOut,
} from '@elastic/eui';
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
  { title: 'Name Integration', children: <EuiText /> },
  { title: 'Select index or data source for integration', children: <EuiText /> },
  { title: 'Select integration assets', children: <EuiText /> },
];

const ALLOWED_FILE_TYPES: EuiSelectOption[] = [
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
    <EuiForm>
      <EuiTitle>
        <h1>{STEPS[0].title}</h1>
      </EuiTitle>
      <EuiFormRow
        label="Name"
        helpText="The name will be used to label the newly added integration"
      >
        <EuiFieldText />
      </EuiFormRow>
    </EuiForm>
  );
}

function SetupIntegrationNewTable() {
  return (
    <EuiForm>
      <EuiTitle>
        <h2>{STEPS[1].title}</h2>
      </EuiTitle>
      <EuiCallOut title="There was no table found" iconType="iInCircle">
        <p>No problem, we can help. Tell us about your data.</p>
      </EuiCallOut>
      <EuiSpacer />
      <EuiFormRow label="Title">
        <EuiFieldText />
      </EuiFormRow>
      <EuiFormRow label="Description (optional)">
        <EuiFieldText />
      </EuiFormRow>
      <EuiFormRow label="File Type">
        <EuiSelect options={ALLOWED_FILE_TYPES} />
      </EuiFormRow>
      <EuiFormRow label="Location to store table">
        <EuiFieldText />
      </EuiFormRow>
    </EuiForm>
  );
}

function IntegrationDataModal(
  isDataModalVisible: boolean,
  setDataModalVisible: React.Dispatch<React.SetStateAction<boolean>>
): React.JSX.Element | null {
  let dataModal = null;
  if (isDataModalVisible) {
    dataModal = (
      <EuiModal onClose={() => setDataModalVisible(false)}>
        <EuiModalHeader>
          <h2>Data Table</h2>
        </EuiModalHeader>
        <EuiModalBody>
          <EuiBasicTable
            items={integrationDataTableData}
            columns={INTEGRATION_DATA_TABLE_COLUMNS}
          />
          <EuiSpacer />
          <EuiButton onClick={() => setDataModalVisible(false)} size="s">
            Close
          </EuiButton>
        </EuiModalBody>
      </EuiModal>
    );
  }
  return dataModal;
}

function SetupIntegrationExistingTable(
  isDataModalVisible: boolean,
  setDataModalVisible: React.Dispatch<React.SetStateAction<boolean>>
) {
  return (
    <EuiForm>
      <EuiTitle>
        <h1>{STEPS[1].title}</h1>
      </EuiTitle>
      <EuiFormRow label="Data" helpText="Manage data associated with this data source">
        <EuiSelect options={[{ value: 'test_s3', text: 'S3 connection name' }]} />
      </EuiFormRow>
      <EuiSpacer />
      <EuiLink onClick={() => setDataModalVisible(true)}>View table</EuiLink>
      {IntegrationDataModal(isDataModalVisible, setDataModalVisible)}
    </EuiForm>
  );
}

function SetupIntegrationAccelerationStandard(
  integConfig: IntegrationConfig,
  setConfig: React.Dispatch<React.SetStateAction<IntegrationConfig>>
) {
  return (
    <EuiForm>
      <EuiFormRow label="Asset Quantity" helpText="Select the amount of assets you want to install">
        <EuiRadioGroup
          options={[
            {
              id: 'index-only',
              label: (
                <EuiText>
                  None{': '}
                  <EuiTextColor color="subdued">
                    Set up indices, but don&apos;t install any assets.
                  </EuiTextColor>
                </EuiText>
              ),
            },
            {
              id: 'queries',
              label: (
                <EuiText>
                  Minimal{': '}
                  <EuiTextColor color="subdued">
                    Set up indices and include provided saved queries.
                  </EuiTextColor>
                </EuiText>
              ),
            },
            {
              id: 'visualizations',
              label: (
                <EuiText>
                  Complete{': '}
                  <EuiTextColor color="subdued">
                    Indices, queries, and visualizations for the data.
                  </EuiTextColor>
                </EuiText>
              ),
            },
            {
              id: 'all',
              label: (
                <EuiText>
                  Everything{': '}
                  <EuiTextColor color="subdued">
                    Includes additional assets such as detectors or geospatial.
                  </EuiTextColor>
                </EuiText>
              ),
            },
          ]}
          idSelected={integConfig.asset_accel}
          onChange={(id) => setConfig(Object.assign({}, integConfig, { asset_accel: id }))}
        />
      </EuiFormRow>

      <EuiFormRow label="Query Acceleration" helpText="Select your query acceleration option">
        <EuiRadioGroup
          options={[
            {
              id: 'none',
              label: (
                <EuiText>
                  None{': '}
                  <EuiTextColor color="subdued">No acceleration. Cheap, but slow.</EuiTextColor>
                </EuiText>
              ),
            },
            {
              id: 'basic',
              label: (
                <EuiText>
                  Basic{': '}
                  <EuiTextColor color="subdued">
                    Minimal optimizations balancing performance and cost.
                  </EuiTextColor>
                </EuiText>
              ),
            },
            {
              id: 'advanced',
              label: (
                <EuiText>
                  Advanced{': '}
                  <EuiTextColor color="subdued">
                    More intensive optimization for better performance.
                  </EuiTextColor>
                </EuiText>
              ),
            },
            {
              id: 'ultra',
              label: (
                <EuiText>
                  Ultra{': '}
                  <EuiTextColor color="subdued">
                    Ideal for performance-critical indices.
                  </EuiTextColor>
                </EuiText>
              ),
            },
          ]}
          idSelected={integConfig.query_accel}
          onChange={(id) => setConfig(Object.assign({}, integConfig, { query_accel: id }))}
        />
      </EuiFormRow>
    </EuiForm>
  );
}

function SetupIntegrationAccelerationAdvanced(
  integConfig: IntegrationConfig,
  setConfig: React.Dispatch<React.SetStateAction<IntegrationConfig>>
) {
  return (
    <EuiBasicTable
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
    <EuiForm>
      <EuiTitle>
        <h1>{STEPS[2].title}</h1>
      </EuiTitle>
      <EuiTabs>
        <EuiTab isSelected={isStandard} onClick={() => setIsStandard(true)}>
          Standard
        </EuiTab>
        <EuiTab isSelected={!isStandard} onClick={() => setIsStandard(false)}>
          Advanced
        </EuiTab>
      </EuiTabs>
      <EuiSpacer />
      {isStandard
        ? SetupIntegrationAccelerationStandard(integConfig, setConfig)
        : SetupIntegrationAccelerationAdvanced(integConfig, setConfig)}
    </EuiForm>
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
          <EuiSpacer size="xxl" />
          <EuiSwitch
            label="(debug) Table detected"
            checked={tableDetected}
            onChange={(event) => setTableDetected(event.target.checked)}
          />
        </div>
      );
    case 2:
      return SetupIntegrationAcceleration(integConfig, setConfig, isStandard, setIsStandard);
    default:
      return <EuiHeader>Something went wrong...</EuiHeader>;
  }
}

function SetupBottomBar(step: number, setStep: React.Dispatch<React.SetStateAction<number>>) {
  return (
    <EuiBottomBar>
      <EuiFlexGroup justifyContent="flexEnd">
        <EuiFlexItem grow={false}>
          <EuiButton
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
          </EuiButton>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiSpacer />
        </EuiFlexItem>
        {step > 0 ? (
          <EuiFlexItem grow={false}>
            <EuiButton iconType={'returnKey'} onClick={() => setStep(Math.max(step - 1, 0))}>
              Back
            </EuiButton>
          </EuiFlexItem>
        ) : null}
        <EuiFlexItem grow={false}>
          <EuiButton fill iconType={'check'} onClick={() => setStep(Math.min(step + 1, 2))}>
            {step === STEPS.length - 1 ? 'Save' : 'Next'}
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiBottomBar>
  );
}

export function SetupIntegrationStepsPage() {
  const [step, setStep] = useState(0);

  return (
    <EuiPage>
      <EuiPageBody>
        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiSteps steps={getSteps(step)} />
          </EuiFlexItem>
          <EuiFlexItem>{SetupIntegrationStep(step)}</EuiFlexItem>
        </EuiFlexGroup>
        {SetupBottomBar(step, setStep)}
      </EuiPageBody>
    </EuiPage>
  );
}
