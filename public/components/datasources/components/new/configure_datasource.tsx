/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiPage,
  EuiPageBody,
  EuiSpacer,
  EuiTitle,
  EuiText,
  EuiLink,
  EuiButton,
  EuiSteps,
  EuiPageSideBar,
  EuiPanel,
  EuiFormRow,
  EuiFieldText,
  EuiBottomBar,
  EuiButtonEmpty,
  EuiTextArea,
} from '@elastic/eui';
import React, { useState } from 'react';
import { ConfigureS3Datasource } from './configure_s3_datasource';

interface ConfigureDatasourceProps {
  type: string;
}

export function Configure(props: ConfigureDatasourceProps) {
  const { type } = props;

  const [name, setName] = useState('');
  const [details, setDetails] = useState('');
  const ConfigureDatasourceSteps = [
    {
      title: 'Step 1',
      children: (
        <EuiText>
          <p>Configure Connection</p>
        </EuiText>
      ),
    },
    {
      title: 'Step 2',
      children: (
        <EuiText>
          <p>Review Configuration</p>
        </EuiText>
      ),
    },
  ];

  const ConfigureDatasource = (configurationProps: { datasourceType: string }) => {
    const { datasourceType } = configurationProps;
    switch (datasourceType) {
      case 'S3':
        return (
          <ConfigureS3Datasource
            currentName={name}
            currentDetails={details}
            setNameForRequest={setName}
            setDetailsForRequest={setDetails}
          />
        );
      default:
        return <></>;
    }
  };

  return (
    <EuiPage>
      <EuiPageSideBar>
        <EuiSteps steps={ConfigureDatasourceSteps} />
      </EuiPageSideBar>
      <EuiPageBody>
        <ConfigureDatasource datasourceType={type} />
      </EuiPageBody>

      <EuiBottomBar>
        <EuiFlexGroup justifyContent="flexEnd">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={() => {}} color="ghost" size="s" iconType="cross">
              Cancel
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton onClick={() => {}} color="ghost" size="s" iconType="arrowLeft">
              Previous
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton onClick={() => {}} size="s" iconType="arrowRight" fill>
              Review Configuration
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiBottomBar>
    </EuiPage>
  );
}
