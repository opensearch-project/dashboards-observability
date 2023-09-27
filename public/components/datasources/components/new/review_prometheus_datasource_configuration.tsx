/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiPanel,
  EuiTitle,
  EuiSpacer,
  EuiText,
  EuiFlexGroup,
  EuiHorizontalRule,
  EuiFlexItem,
  EuiButton,
} from '@elastic/eui';
import { Role } from 'common/types/data_connections';
import React from 'react';

interface ConfigurePrometheusDatasourceProps {
  selectedQueryPermissionRoles: Role[];
  currentName: string;
  currentDetails: string;
  currentArn: string;
  currentStore: string;
  currentUsername: string;
  goBack: () => void;
}

export const ReviewPrometheusDatasource = (props: ConfigurePrometheusDatasourceProps) => {
  const {
    currentStore,
    currentName,
    currentDetails,
    currentUsername,
    selectedQueryPermissionRoles,
    goBack,
  } = props;

  return (
    <div>
      <EuiPanel>
        <EuiTitle>
          <h1>{`Review Prometheus Data Source Configuration`}</h1>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiSpacer />
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiText>
              <h3>Data source configuration</h3>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton onClick={goBack}>Edit</EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
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
                <EuiText className="overview-title">Prometheus URI</EuiText>
                <EuiText size="s" className="overview-content">
                  {currentStore}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText className="overview-title">Authentication method</EuiText>
                <EuiText size="s" className="overview-content">
                  {currentUsername ? 'Basic auth' : 'AWSSigV4'}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFlexGroup direction="column">
              <EuiFlexItem grow={false}>
                <EuiText className="overview-title">Query Permissions</EuiText>
                <EuiText size="s" className="overview-content">
                  {selectedQueryPermissionRoles && selectedQueryPermissionRoles.length
                    ? `Restricted - ${selectedQueryPermissionRoles
                        .map((role) => role.label)
                        .join(',')}`
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
