/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Eui from '@elastic/eui';
import { EuiContainedStepProps } from '@opensearch-project/oui/src/components/steps/steps';
import React, { useState } from 'react';

interface IntegrationConfig {
  instanceName: string;
  useExisting: boolean;
  dataSourceName: string;
  dataSourceDescription: string;
  dataSourceFileType: string;
  dataSourceLocation: string;
  existingDataSourceName: string;
}

const STEPS: EuiContainedStepProps[] = [
  { title: 'Name Integration', children: <Eui.EuiText /> },
  { title: 'Select index or data source for integration', children: <Eui.EuiText /> },
  // { title: 'Select integration assets', children: <Eui.EuiText /> },
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

const getSetupStepStatus = (activeStep: number): EuiContainedStepProps[] => {
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

function SetupIntegrationMetadata({
  name,
  setName,
}: {
  name: string;
  setName: (name: string) => void;
}) {
  return (
    <Eui.EuiForm>
      <Eui.EuiTitle>
        <h1>{STEPS[0].title}</h1>
      </Eui.EuiTitle>
      <Eui.EuiFormRow
        label="Name"
        helpText="The name will be used to label the newly added integration"
      >
        <Eui.EuiFieldText value={name} onChange={(evt) => setName(evt.target.value)} />
      </Eui.EuiFormRow>
    </Eui.EuiForm>
  );
}

function IntegrationDataModal({ close }: { close: () => void }): React.JSX.Element {
  return (
    <Eui.EuiModal onClose={close}>
      <Eui.EuiModalHeader>
        <h2>Data Table</h2>
      </Eui.EuiModalHeader>
      <Eui.EuiModalBody>
        <Eui.EuiBasicTable
          items={integrationDataTableData}
          columns={INTEGRATION_DATA_TABLE_COLUMNS}
        />
        <Eui.EuiSpacer />
        <Eui.EuiButton onClick={close} size="s">
          Close
        </Eui.EuiButton>
      </Eui.EuiModalBody>
    </Eui.EuiModal>
  );
}

function SetupIntegrationNewTable({
  config,
  updateConfig,
}: {
  config: IntegrationConfig;
  updateConfig: (updates: Partial<IntegrationConfig>) => void;
}) {
  return (
    <div>
      <Eui.EuiFormRow label="Title">
        <Eui.EuiFieldText
          value={config.dataSourceName}
          onChange={(evt) => updateConfig({ dataSourceName: evt.target.value })}
        />
      </Eui.EuiFormRow>
      <Eui.EuiFormRow label="Description (optional)">
        <Eui.EuiFieldText
          value={config.dataSourceDescription}
          onChange={(evt) => updateConfig({ dataSourceDescription: evt.target.value })}
        />
      </Eui.EuiFormRow>
      <Eui.EuiFormRow label="File Type">
        <Eui.EuiSelect
          options={ALLOWED_FILE_TYPES}
          value={config.dataSourceFileType}
          onChange={(evt) => updateConfig({ dataSourceFileType: evt.target.value })}
        />
      </Eui.EuiFormRow>
      <Eui.EuiFormRow label="Location to store table">
        <Eui.EuiFieldText
          value={config.dataSourceLocation}
          onChange={(evt) => updateConfig({ dataSourceLocation: evt.target.value })}
        />
      </Eui.EuiFormRow>
    </div>
  );
}

function SetupIntegrationExistingTable({
  config,
  updateConfig,
  showDataModal,
  setShowDataModal,
}: {
  config: IntegrationConfig;
  updateConfig: (updates: Partial<IntegrationConfig>) => void;
  showDataModal: boolean;
  setShowDataModal: (visible: boolean) => void;
}) {
  const dataModal = showDataModal ? (
    <IntegrationDataModal close={() => setShowDataModal(false)} />
  ) : null;
  return (
    <div>
      <Eui.EuiFormRow label="Data Source" helpText="Manage data associated with this data source">
        <Eui.EuiSelect
          options={[
            { value: 'test_s3', text: 'S3 connection name' },
            { value: 'logs_idx', text: 'SS4O Logs Index' },
          ]}
          value={config.existingDataSourceName}
          onChange={(evt) => updateConfig({ existingDataSourceName: evt.target.value })}
        />
      </Eui.EuiFormRow>
      <Eui.EuiSpacer />
      <Eui.EuiLink onClick={() => setShowDataModal(true)}>View table</Eui.EuiLink>
      {dataModal}
    </div>
  );
}

function SetupIntegrationDataSource({
  config,
  updateConfig,
  showDataModal,
  setShowDataModal,
  tableDetected,
  setTableDetected,
}: {
  config: IntegrationConfig;
  updateConfig: (updates: Partial<IntegrationConfig>) => void;
  showDataModal: boolean;
  setShowDataModal: (show: boolean) => void;
  tableDetected: boolean;
  setTableDetected: (detected: boolean) => void;
}) {
  let tableForm;
  if (tableDetected && config.useExisting) {
    tableForm = (
      <SetupIntegrationExistingTable
        config={config}
        updateConfig={updateConfig}
        showDataModal={showDataModal}
        setShowDataModal={(x) => setShowDataModal(x)}
      />
    );
  } else {
    tableForm = <SetupIntegrationNewTable config={config} updateConfig={updateConfig} />;
  }

  let tablesNotFoundMessage = null;
  if (!tableDetected) {
    tablesNotFoundMessage = (
      <>
        <Eui.EuiCallOut title="No tables were found" iconType="iInCircle">
          <p>No problem, we can help. Tell us about your data.</p>
        </Eui.EuiCallOut>
        <Eui.EuiSpacer />
      </>
    );
  }

  return (
    <div>
      <Eui.EuiSwitch
        label="(debug) Table detected"
        checked={tableDetected}
        onChange={(event) => setTableDetected(event.target.checked)}
      />
      <Eui.EuiSpacer size="xxl" />
      <Eui.EuiForm>
        <Eui.EuiTitle>
          <h1>{STEPS[1].title}</h1>
        </Eui.EuiTitle>
        <Eui.EuiSpacer />
        {tablesNotFoundMessage}
        <Eui.EuiSwitch
          label="Use existing Data Source"
          checked={config.useExisting && tableDetected}
          onChange={(evt) => updateConfig({ useExisting: evt.target.checked })}
          disabled={!tableDetected}
        />
        <Eui.EuiSpacer />
        {tableForm}
      </Eui.EuiForm>
    </div>
  );
}

function SetupIntegrationStep({
  activeStep,
  config,
  updateConfig,
}: {
  activeStep: number;
  config: IntegrationConfig;
  updateConfig: (updates: Partial<IntegrationConfig>) => void;
}) {
  const [isDataModalVisible, setDataModalVisible] = useState(false);
  const [tableDetected, setTableDetected] = useState(false);

  switch (activeStep) {
    case 0:
      return (
        <SetupIntegrationMetadata
          name={config.instanceName}
          setName={(name) => updateConfig({ instanceName: name })}
        />
      );
    case 1:
      return (
        <SetupIntegrationDataSource
          config={config}
          updateConfig={updateConfig}
          showDataModal={isDataModalVisible}
          setShowDataModal={(show: boolean) => setDataModalVisible(show)}
          tableDetected={tableDetected}
          setTableDetected={(detected: boolean) => setTableDetected(detected)}
        />
      );
    default:
      return (
        <Eui.EuiHeader>
          Attempted to access integration setup step that doesn&apos;t exist. This is a bug.
        </Eui.EuiHeader>
      );
  }
}

function SetupBottomBar({
  step,
  setStep,
  config,
}: {
  step: number;
  setStep: (step: number) => void;
  config: IntegrationConfig;
}) {
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
            <Eui.EuiButton iconType={'returnKey'} onClick={() => setStep(step - 1)}>
              Back
            </Eui.EuiButton>
          </Eui.EuiFlexItem>
        ) : null}
        <Eui.EuiFlexItem grow={false}>
          <Eui.EuiButton
            fill
            iconType={'check'}
            onClick={() => {
              if (step < STEPS.length - 1) {
                setStep(step + 1);
              } else {
                console.log(config);
              }
            }}
          >
            {step === STEPS.length - 1 ? 'Save' : 'Next'}
          </Eui.EuiButton>
        </Eui.EuiFlexItem>
      </Eui.EuiFlexGroup>
    </Eui.EuiBottomBar>
  );
}

export function SetupIntegrationStepsPage() {
  const [integConfig, setConfig] = useState({
    instanceName: '',
    useExisting: true,
    dataSourceName: '',
    dataSourceDescription: '',
    dataSourceFileType: 'parquet',
    dataSourceLocation: '',
    existingDataSourceName: '',
  } as IntegrationConfig);
  const [step, setStep] = useState(0);

  const updateConfig = (updates: Partial<IntegrationConfig>) =>
    setConfig(Object.assign({}, integConfig, updates));

  return (
    <Eui.EuiPage>
      <Eui.EuiPageBody>
        <Eui.EuiFlexGroup>
          <Eui.EuiFlexItem>
            <Eui.EuiSteps steps={getSetupStepStatus(step)} />
          </Eui.EuiFlexItem>
          <Eui.EuiFlexItem>
            <SetupIntegrationStep
              activeStep={step}
              config={integConfig}
              updateConfig={updateConfig}
            />
          </Eui.EuiFlexItem>
        </Eui.EuiFlexGroup>
        <SetupBottomBar
          step={step}
          setStep={(x) => setStep(Math.min(Math.max(x, 0), STEPS.length - 1))}
          config={integConfig}
        />
      </Eui.EuiPageBody>
    </Eui.EuiPage>
  );
}
