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
import React from 'react';
import { PermissionsFlexItem } from '../../../../common/types/data_connections';
import {
  OPENSEARCH_DOCUMENTATION_URL,
  QUERY_RESTRICT,
} from '../../../../common/constants/data_connections';

export const QueryPermissionsConfiguration = (props: PermissionsConfiguration) => {
  const { roles, setSelectedRoles, selectedRoles, selectedRadio, radios, setSelectedRadio } = props;
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
          {selectedRadio === QUERY_RESTRICT ? (
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
          ) : (
            <></>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlexItem>
  );
};
