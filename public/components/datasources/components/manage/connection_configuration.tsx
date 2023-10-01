/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiFieldPassword,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTextArea,
} from '@elastic/eui';
import { EuiSelectOption } from '@elastic/eui/src/components/form/select';
import React, { useState } from 'react';

interface ConnectionConfigurationProps {
  connectionName: string;
  connectionDetails: string;
  onConnectionDetailsChange: (e: any) => void;
  authenticationOptions: EuiSelectOption[];
  setSelectedAuthenticationMethod: (authenticationMethod: EuiSelectOption) => void;
  selectedAuthenticationMethod: string;
}

export const ConnectionConfiguration = (props: ConnectionConfigurationProps) => {
  const {
    connectionName,
    connectionDetails,
    onConnectionDetailsChange,
    authenticationOptions,
    selectedAuthenticationMethod,
    setSelectedAuthenticationMethod,
  } = props;
  const [details, setDetails] = useState(connectionDetails);

  const [password, setPassword] = useState('');

  const NameRow = () => {
    return (
      <EuiFlexGroup direction="row">
        <EuiFlexItem>
          <EuiText className="overview-title">Data source name</EuiText>
          <EuiText size="s" className="overview-content">
            This is the name of the data source and how it will be referenced in OpenSearch
            Dashboards.
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFormRow label="Data source name">
            <EuiFieldText placeholder={connectionName} readOnly />
          </EuiFormRow>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  const SparkEndpointRow = () => {
    return (
      <EuiFlexGroup direction="row">
        <EuiFlexItem>
          <EuiText className="overview-title">Spark endpoint URL</EuiText>
          <EuiText size="s" className="overview-content">
            {
              "The URL for your Spark cluster and where your data is. This is what OpenSearch will connect to. The endpoint URL can't be changed. If you'd like to use another endpoint create a new data source."
            }
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFormRow label="Spark endpoint URL">
            <EuiFieldText placeholder={'-'} readOnly />
          </EuiFormRow>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  return (
    <EuiFlexItem>
      <NameRow />
      <EuiSpacer />
      <EuiFlexGroup direction="row">
        <EuiFlexItem>
          <EuiText className="overview-title">Description - optional</EuiText>
          <EuiText size="s" className="overview-content">
            Text that can help identify the data source or share additional details
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFormRow label="Description">
            <EuiTextArea
              placeholder="Placeholder text"
              aria-label="test"
              value={details}
              onChange={(e) => {
                setDetails(e.target.value);
              }}
              onBlur={onConnectionDetailsChange}
            />
          </EuiFormRow>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer />
      <SparkEndpointRow />
      <EuiSpacer />
      <EuiFlexGroup direction="row">
        <EuiFlexItem>
          <EuiText className="overview-title">Authentication details</EuiText>
          <EuiText size="s" className="overview-content">
            This is information used to authenticate and create a data source with Spark.
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFormRow label="Authentication method">
            <EuiSelect
              options={authenticationOptions}
              value={selectedAuthenticationMethod}
              onChange={(e) => setSelectedAuthenticationMethod(e)}
            />
          </EuiFormRow>
          <EuiFormRow label="Username">
            <EuiFieldText placeholder={'Username placeholder'} />
          </EuiFormRow>
          <EuiFormRow label="Password">
            <EuiFieldPassword
              type="dual"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </EuiFormRow>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlexItem>
  );
};
