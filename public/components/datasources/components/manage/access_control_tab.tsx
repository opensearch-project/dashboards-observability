/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiFlexGroup, EuiFlexItem, EuiSpacer, EuiText, EuiHorizontalRule } from '@elastic/eui';
import React, { useState } from 'react';
import { EuiPanel } from '@elastic/eui';
import { ConnectionManagementCallout } from './connection_management_callout';
import { Role } from '../../../../../common/types/data_connections';

interface AccessControlTabProps {
  dataConnection: string;
  connector: string;
  properties: unknown;
  allowedRoles: string[];
}

export const AccessControlTab = (props: AccessControlTabProps) => {
  const [selectedQueryPermissionRoles, setSelectedQueryPermissionRoles] = useState<Role[]>(
    props.allowedRoles.map((role) => {
      return { label: role };
    })
  );

  const AccessControlDetails = () => {
    return (
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiFlexGroup direction="column">
            <EuiFlexItem grow={false}>
              <EuiText className="overview-title">Query access</EuiText>
              <EuiText size="s" className="overview-content">
                {selectedQueryPermissionRoles.length
                  ? `Restricted to ${selectedQueryPermissionRoles
                      .map((role) => role.label)
                      .join(',')}`
                  : 'Everyone'}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  const AccessControlHeader = () => {
    return (
      <EuiFlexGroup direction="row">
        <EuiFlexItem>
          <EuiText size="m">
            <h2 className="panel-title">Access Control</h2>
            Control which OpenSearch users have access to this data source.
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  return (
    <>
      <EuiSpacer />
      <ConnectionManagementCallout />
      <EuiSpacer />
      <EuiPanel>
        <AccessControlHeader />
        <EuiHorizontalRule />
        <AccessControlDetails />
      </EuiPanel>
      <EuiSpacer />
      <EuiSpacer />
    </>
  );
};
