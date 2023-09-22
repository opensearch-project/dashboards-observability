/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiText,
  EuiHorizontalRule,
} from '@elastic/eui';
import React, { useState } from 'react';
import { EuiPanel } from '@elastic/eui';
import { ConnectionManagementCallout } from './connection_management_callout';
import { coreRefs } from '../../../../framework/core_refs';
import { DATACONNECTIONS_BASE } from '../../../../../common/constants/shared';
import { SaveOrCancel } from '../save_or_cancel';
import { ConnectionConfiguration } from '../new/connection_configuration';

interface ConnectionDetailProps {
  dataConnection: string;
  connector: string;
  allowedRoles: string[];
  properties: unknown;
}

export const ConnectionDetails = (props: ConnectionDetailProps) => {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const { http } = coreRefs;

  const { dataConnection, connector, allowedRoles, properties } = props;
  const [connectionDetails, setConnectionDetails] = useState('');
  const onChange = (e) => {
    setConnectionDetails(e.target.value);
  };
  const authenticationOptions = [{ value: 'option_one', text: 'Username & Password' }];

  const [selectedAuthenticationMethod, setSelectedAuthenticationMethod] = useState(
    authenticationOptions[0].value
  );

  const onAuthenticationMethodChange = (e) => {
    setSelectedAuthenticationMethod(e.target.value);
  };

  const ConnectionConfigurationView = () => {
    return (
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiFlexGroup direction="column">
            <EuiFlexItem grow={false}>
              <EuiText className="overview-title">Data source name</EuiText>
              <EuiText size="s" className="overview-content">
                {dataConnection}
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText className="overview-title">Spark endpoint URL</EuiText>
              <EuiText size="s" className="overview-content">
                {'-'}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFlexGroup direction="column">
            <EuiFlexItem grow={false}>
              <EuiText className="overview-title">Description</EuiText>
              <EuiText size="s" className="overview-content">
                {'-'}
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText className="overview-title">Authentication method</EuiText>
              <EuiText size="s" className="overview-content">
                {'-'}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  const EditConnectionConfiguration = () => {
    return (
      <EuiFlexGroup direction="column">
        <ConnectionConfiguration
          connectionName={dataConnection}
          connectionDetails={connectionDetails}
          onConnectionDetailsChange={onChange}
          authenticationOptions={authenticationOptions}
          setSelectedAuthenticationMethod={onAuthenticationMethodChange}
          selectedAuthenticationMethod={selectedAuthenticationMethod}
        />
      </EuiFlexGroup>
    );
  };

  const saveChanges = () => {
    http!.put(`${DATACONNECTIONS_BASE}`, {
      body: JSON.stringify({
        name: props.dataConnection,
        allowedRoles: props.allowedRoles,
        connector: props.connector,
        properties: props.properties,
      }),
    });
    setMode('view');
  };

  const ConnectionConfigurationHeader = () => {
    return (
      <EuiFlexGroup direction="row">
        <EuiFlexItem>
          <EuiText size="m">
            <h2 className="panel-title">Data source configurations</h2>
            Control configurations for your data source.
          </EuiText>
        </EuiFlexItem>

        <EuiFlexItem grow={false}>
          <EuiButton
            data-test-subj="createButton"
            onClick={() => setMode(mode === 'view' ? 'edit' : 'view')}
            fill={mode === 'view' ? true : false}
          >
            {mode === 'view' ? 'Edit' : 'Cancel'}
          </EuiButton>
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
        <ConnectionConfigurationHeader />
        <EuiHorizontalRule />
        {mode === 'view' ? <ConnectionConfigurationView /> : <EditConnectionConfiguration />}
      </EuiPanel>
      <EuiSpacer />
      {mode === 'edit' && (
        <SaveOrCancel
          onCancel={() => {
            setMode('view');
          }}
          onSave={saveChanges}
        />
      )}
      <EuiSpacer />
    </>
  );
};
