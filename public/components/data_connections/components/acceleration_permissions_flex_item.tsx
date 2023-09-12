/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiComboBox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiRadioGroup,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import _ from 'lodash';
import React from 'react';
import { PermissionsFlexItem } from 'common/types/data_connections';
import { OPENSEARCH_DOCUMENTATION_URL } from '../../../../common/constants/data_connections';

export const AccelerationPermissionsFlexItem = (props: PermissionsFlexItem) => {
  const { roles, setSelectedRoles, selectedRoles, selectedRadio, radios, setSelectedRadio } = props;
  return (
    <EuiFlexItem>
      <EuiFlexGroup direction="row">
        <EuiFlexItem>
          <EuiText className="overview-title">Acceleration Permissions</EuiText>
          <EuiText size="s" className="overview-content">
            Control which OpenSearch roles have permissions to accelerate external data through
            OpenSearch indexing.{' '}
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
            name="acceleration-radio-group"
            legend={{
              children: <span>Access level</span>,
            }}
          />
          {selectedRadio === `0` ? (
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
