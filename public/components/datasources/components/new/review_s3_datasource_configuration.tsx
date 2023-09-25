/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiPanel,
  EuiTitle,
  EuiSpacer,
  EuiText,
  EuiLink,
  EuiFormRow,
  EuiFieldText,
  EuiTextArea,
  EuiButton,
  EuiFlexGroup,
  EuiHorizontalRule,
  EuiFlexItem,
} from '@elastic/eui';
import React, { useState } from 'react';
import { OPENSEARCH_DOCUMENTATION_URL } from '../../../../../common/constants/data_connections';
import { QueryPermissionsConfiguration } from '../manage/query_permissions';

interface ConfigureS3DatasourceProps {
  selectedQueryPermissionRoles: Array<{ label: string }>;
  currentName: string;
  currentDetails: string;
  currentArn: string;
  currentStore: string;
}

export const ReviewS3Datasource = (props: ConfigureS3DatasourceProps) => {
  const {
    currentStore,
    currentName,
    currentDetails,
    currentArn,
    selectedQueryPermissionRoles,
  } = props;

  return (
    <div>
      <EuiPanel>
        <EuiTitle>
          <h1>{`Review S3 Data Source Configuration`}</h1>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiSpacer />
        <EuiText>
          <h3>Data source configuration</h3>
        </EuiText>
        <EuiHorizontalRule />
        <EuiSpacer />
        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiFlexGroup direction="column">
              <EuiFlexItem grow={false}>
                <EuiText className="overview-title">Data source name</EuiText>
                <EuiText size="s" className="overview-content">
                  {currentName}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText className="overview-title">Description</EuiText>
                <EuiText size="s" className="overview-content">
                  {currentDetails}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFlexGroup direction="column">
              <EuiFlexItem grow={false}>
                <EuiText className="overview-title">Glue authentication ARN</EuiText>
                <EuiText size="s" className="overview-content">
                  {currentArn}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText className="overview-title">Glue index store URI</EuiText>
                <EuiText size="s" className="overview-content">
                  {currentStore}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFlexGroup direction="column">
              <EuiFlexItem grow={false}>
                <EuiText className="overview-title">Query Permissions</EuiText>
                <EuiText size="s" className="overview-content">
                  {selectedQueryPermissionRoles
                    ? `Restricted - ${JSON.stringify(selectedQueryPermissionRoles)}`
                    : 'Everyone'}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    </div>
  );
};
