/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

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
} from '@elastic/eui';
import { EuiContainedStepProps } from '@opensearch-project/oui/src/components/steps/steps';
import React, { useState } from 'react';

const STEPS: EuiContainedStepProps[] = [
  { title: 'Name Integration', children: <EuiText /> },
  { title: 'Select index or data source for integration', children: <EuiText /> },
  { title: 'Review associated index with data from table', children: <EuiText /> },
  { title: 'Select integration assets', children: <EuiText /> },
];

const ALLOWED_FILE_TYPES: EuiSelectOption[] = [
  { value: 'parquet', text: 'parquet' },
  { value: 'json', text: 'json' },
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

function SetupIntegrationStepOne() {
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

function SetupIntegrationStepTwo() {
  return (
    <EuiForm>
      <EuiTitle>
        <h2>{STEPS[1].title}</h2>
      </EuiTitle>
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

function SetupIntegrationStepThree() {
  return (
    <EuiForm>
      <EuiTitle>
        <h1>{STEPS[2].title}</h1>
      </EuiTitle>
      <EuiFormRow label="Data" helpText="Manage data associated with this data source">
        <EuiSelect options={[{ value: 'test_s3', text: 'S3 connection name' }]} />
      </EuiFormRow>
      <EuiSpacer />
      <EuiLink>View table</EuiLink>
    </EuiForm>
  );
}

function SetupIntegrationStepFour(
  selectAsset: string,
  setSelectAsset: React.Dispatch<React.SetStateAction<string>>,
  selectQuery: string,
  setSelectQuery: React.Dispatch<React.SetStateAction<string>>
) {
  return (
    <EuiForm>
      <EuiTitle>
        <h1>{STEPS[3].title}</h1>
      </EuiTitle>
      <EuiFormRow label="Assets" helpText="Select the amount of assets you want to install">
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
          idSelected={selectAsset}
          onChange={setSelectAsset}
        />
      </EuiFormRow>

      <EuiFormRow label="Queries" helpText="Select your query acceleration option">
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
                    Basic optimizations balancing performance and cost.
                  </EuiTextColor>
                </EuiText>
              ),
            },
            {
              id: 'advanced',
              label: <EuiText>Advanced</EuiText>,
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
          idSelected={selectQuery}
          onChange={setSelectQuery}
        />
      </EuiFormRow>
    </EuiForm>
  );
}

function SetupIntegrationStep(activeStep: number) {
  const [selectAsset, setSelectAsset] = useState('visualizations');
  const [selectQuery, setSelectQuery] = useState('basic');

  switch (activeStep) {
    case 0:
      return SetupIntegrationStepOne();
    case 1:
      return SetupIntegrationStepTwo();
    case 2:
      return SetupIntegrationStepThree();
    case 3:
      return SetupIntegrationStepFour(selectAsset, setSelectAsset, selectQuery, setSelectQuery);
    default:
      return <EuiHeader>Something went wrong...</EuiHeader>;
  }
}

function SetupBottomBar(step: number, setStep: React.Dispatch<React.SetStateAction<number>>) {
  return (
    <EuiBottomBar>
      <EuiFlexGroup justifyContent="flexEnd">
        <EuiFlexItem grow={false}>
          <EuiButton iconType={'cross'} onClick={() => setStep(Math.max(step - 1, 0))}>
            Cancel
          </EuiButton>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton fill iconType={'check'} onClick={() => setStep(Math.min(step + 1, 3))}>
            {step === 3 ? 'Save' : 'Next'}
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
