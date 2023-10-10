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
import React from 'react';
import { AuthMethod } from '../../../../../common/constants/data_connections';
import { Role } from '../../../../../common/types/data_connections';

export interface ReviewCloudWatchDatasourceProps {
  selectedQueryPermissionRoles: Role[];
  currentName: string;
  currentDetails: string;
  currentArn: string;
  currentStore: string;
  currentAuthMethod: AuthMethod;
  currentRegion: string;
  goBack: () => void;
}

export const ReviewCloudWatchDatasource = (props: ReviewCloudWatchDatasourceProps) => {
  const {
    currentStore,
    currentName,
    currentDetails,
    currentArn,
    selectedQueryPermissionRoles,
    currentAuthMethod,
    currentRegion,
    goBack,
  } = props;

  return (
    <div>
      <EuiPanel>
        <EuiTitle>
          <h1>{`Review Amazon CloudWatch Logs data source configuration`}</h1>
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
              <EuiFlexItem grow={false}>
                <EuiText className="overview-title">Amazon CloudWatch Logs Region</EuiText>
                <EuiText size="s" className="overview-content">
                  {currentRegion}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFlexGroup direction="column">
              <EuiFlexItem grow={false}>
                <EuiText className="overview-title">
                  Amazon CloudWatch Logs authentication ARN
                </EuiText>
                <EuiText size="s" className="overview-content">
                  {currentArn}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText className="overview-title">Amazon CloudWatch Logs index store URI</EuiText>
                <EuiText size="s" className="overview-content">
                  {currentStore}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFlexGroup direction="column">
              <EuiFlexItem grow={false}>
                <EuiText className="overview-title">Query permissions</EuiText>
                <EuiText size="s" className="overview-content">
                  {selectedQueryPermissionRoles && selectedQueryPermissionRoles.length
                    ? `Restricted - ${selectedQueryPermissionRoles
                        .map((role) => role.label)
                        .join(',')}`
                    : 'Everyone'}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText className="overview-title">Authentication method</EuiText>
                <EuiText size="s" className="overview-content">
                  {currentAuthMethod === 'basicauth' ? 'Basic authentication' : 'No authentication'}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    </div>
  );
};
