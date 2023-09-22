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
import { OPENSEARCH_DOCUMENTATION_URL } from '../../../../../common/constants/data_connections';

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
            <h3>Data source details</h3>
          </EuiText>
          <EuiSpacer />
          <EuiFormRow label="Title">
            <EuiFieldText data-test-subj="data-source-name" />
          </EuiFormRow>
          <EuiFormRow label="Description - Optional">
            <EuiFlexGroup direction="row">
              <EuiText className="overview-title">Description - optional</EuiText>
              <EuiText size="s" className="overview-content">
                Text that can help identify the data source or share additional details
              </EuiText>

              <EuiFormRow label="Description">
                <EuiTextArea
                  placeholder="Placeholder text"
                  aria-label="test"
                  onChange={(e) => {
                    setDetails(e.target.value);
                  }}
                />
              </EuiFormRow>
            </EuiFlexGroup>
          </EuiFormRow>

          <EuiFormRow label="Endpoint URL">
            <EuiFieldText data-test-subj="data-source-endpoint-URL" />
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
