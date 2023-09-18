/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiComboBox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiRadioGroup,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import React, { useState } from 'react';
import {
  OPENSEARCH_DOCUMENTATION_URL,
  QUERY_ALL,
  QUERY_RESTRICTED,
} from '../../../../common/constants/data_connections';
import { PermissionsConfigurationProps } from '../../../../common/types/data_connections';

export const QueryPermissionsConfiguration = (props: PermissionsConfigurationProps) => {
  const { roles, selectedRoles, setSelectedRoles } = props;

  const [selectedRadio, setSelectedRadio] = useState(
    selectedRoles.length ? QUERY_RESTRICTED : QUERY_ALL
  );
  const radios = [
    {
      id: QUERY_RESTRICTED,
      label: 'Restricted - accessible by users with specific OpenSearch roles',
    },
    {
      id: QUERY_ALL,
      label: 'Everyone - accessible by all users on this cluster',
    },
  ];

  const ConfigureRoles = () => {
    return (
      <div>
        <EuiSpacer size="s" />
        <EuiText>OpenSearch Roles</EuiText>
        <EuiText size="xs">
          Select one or more OpenSearch roles that can query this data connection.
        </EuiText>
        <EuiComboBox
          placeholder="Select one or more options"
          options={roles}
          selectedOptions={selectedRoles}
          onChange={setSelectedRoles}
          isClearable={true}
          data-test-subj="query-permissions-combo-box"
        />
      </div>
    );
  };

  return (
    <EuiFlexItem>
      <EuiFlexGroup direction="row">
        <EuiFlexItem>
          <EuiText className="overview-title">Query Permissions</EuiText>
          <EuiText size="s" className="overview-content">
            Control which OpenSearch roles have query permissions on this data source.{' '}
            <EuiLink external={true} href={OPENSEARCH_DOCUMENTATION_URL} target="_blank">
              Learn more
            </EuiLink>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiRadioGroup
            options={radios}
            idSelected={selectedRadio}
            onChange={(id) => setSelectedRadio(id)}
            name="query-radio-group"
            legend={{
              children: <span>Access level</span>,
            }}
          />
          {selectedRadio === QUERY_RESTRICTED && <ConfigureRoles />}
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlexItem>
  );
};
