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
} from '@elastic/eui';
import React from 'react';
import { OPENSEARCH_DOCUMENTATION_URL } from '../../../../common/constants/data_connections';

interface ConfigureDatasourceProps {
  type: string;
}

export function Configure(props: ConfigureDatasourceProps) {
  const { type } = props;
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
    return (
      <div>
        <EuiPanel>
          <EuiTitle>
            <h1>{`Configure ${datasourceType} Connection`}</h1>
          </EuiTitle>
          <EuiSpacer size="s" />
          <EuiText size="s" color="subdued">
            {`Connect to ${datasourceType} with OpenSearch and OpenSearch Dashboards `}
            <EuiLink external={true} href={OPENSEARCH_DOCUMENTATION_URL} target="blank">
              Learn more
            </EuiLink>
          </EuiText>
          <EuiSpacer />
          <EuiText>
            <h3>Connection Details</h3>
          </EuiText>
          <EuiSpacer />
          <EuiFormRow label="Title">
            <EuiFieldText data-test-subj="data-source-name" name="first" />
          </EuiFormRow>
          <EuiFormRow label="Description - Optional">
            <EuiFieldText data-test-subj="data-source-name" name="first" />
          </EuiFormRow>

          <EuiFormRow label="Endpoint URL">
            <EuiFieldText data-test-subj="data-source-name" name="first" />
          </EuiFormRow>
        </EuiPanel>
      </div>
    );
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
