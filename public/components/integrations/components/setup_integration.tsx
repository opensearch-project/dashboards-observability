/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiBottomBar,
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPage,
  EuiPageBody,
  EuiSteps,
  EuiText,
  OuiFlexGroup,
  OuiFlexItem,
} from '@elastic/eui';
import { EuiHeader } from '@opensearch-project/oui';
import { EuiContainedStepProps } from '@opensearch-project/oui/src/components/steps/steps';
import React, { useState } from 'react';

const STEPS: EuiContainedStepProps[] = [
  { title: 'Name Integration', children: <EuiText /> },
  { title: 'Select index or data source for integration', children: <EuiText /> },
  { title: 'Review associated index with data from table', children: <EuiText /> },
  { title: 'Select integration assets', children: <EuiText /> },
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
  return <EuiHeader>This is step one.</EuiHeader>;
}

function SetupIntegrationStepTwo() {
  return <EuiHeader>This is step two.</EuiHeader>;
}

function SetupIntegrationStepThree() {
  return <EuiHeader>This is step three.</EuiHeader>;
}

function SetupIntegrationStepFour() {
  return <EuiHeader>This is step four.</EuiHeader>;
}

function SetupIntegrationStep(activeStep: number) {
  switch (activeStep) {
    case 0:
      return SetupIntegrationStepOne();
    case 1:
      return SetupIntegrationStepTwo();
    case 2:
      return SetupIntegrationStepThree();
    case 3:
      return SetupIntegrationStepFour();
    default:
      return <EuiHeader>Something went wrong...</EuiHeader>;
  }
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
        <EuiBottomBar>
          <EuiText>Step Navigation</EuiText>
          <EuiButton onClick={() => setStep(Math.max(step - 1, 0))}>Previous Step</EuiButton>
          <EuiButton onClick={() => setStep(Math.min(step + 1, 3))}>Next Step</EuiButton>
        </EuiBottomBar>
      </EuiPageBody>
    </EuiPage>
  );
}
