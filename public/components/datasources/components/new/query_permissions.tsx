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
} from '../../../../../common/constants/data_connections';
import { PermissionsConfigurationProps } from '../../../../../common/types/data_connections';

export const QueryPermissionsConfiguration = (props: PermissionsConfigurationProps) => {
  const { roles, selectedRoles, setSelectedRoles, layout } = props;

  const [selectedAccessLevel, setSelectedAccessLevel] = useState(
    selectedRoles.length ? QUERY_RESTRICTED : QUERY_ALL
  );
  const accessLevelOptions = [
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
      <EuiFlexGroup direction={layout === 'horizontal' ? 'row' : 'column'}>
        <EuiFlexItem>
          <EuiText>
            <h3>Query permissions</h3>
          </EuiText>
          <EuiText size="s">
            <p>
              Control which OpenSearch roles have permission to query and index data from this data
              source
            </p>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiRadioGroup
            options={accessLevelOptions}
            idSelected={selectedAccessLevel}
            onChange={(id) => setSelectedAccessLevel(id)}
            name="query-radio-group"
            legend={{
              children: <span>Query access level</span>,
            }}
          />
          {selectedAccessLevel === QUERY_RESTRICTED && <ConfigureRoles />}
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlexItem>
  );
};
