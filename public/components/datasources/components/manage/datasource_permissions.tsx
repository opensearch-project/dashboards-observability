/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButton,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiRadioGroup,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import React, { useState } from 'react';
import { useToast } from '../../../../../public/components/common/toast';
import { coreRefs } from '../../../../../public/framework/core_refs';

export const DataSourcePermissionsConfiguration = (props: {
  DataSourceName: string;
  properties: any;
}) => {
  const { http } = coreRefs;
  const { setToast } = useToast();

  const [backendRole, setBackendRole] = useState(
    `fgac_role_datasource_${props.DataSourceName}_backend`
  );
  const [createBackendRoleSelectedOption, setCreateBackendRoleSelectedOption] = useState(
    'automatic'
  );

  const createBackendRoleOptions = [
    {
      id: 'manual',
      label: 'Manual configuration',
    },
    {
      id: 'automatic',
      label: 'Automatically create role',
    },
  ];

  const automaticallyCreateBackendRoleAndMapping = async () => {
    await http!
      .post(`/api/v1/configuration/roles/${backendRole}`, {
        body: JSON.stringify({
          cluster_permissions: [],
          index_permissions: [
            {
              index_patterns: ['.query_result_index'],
              dls: '',
              fls: [],
              masked_fields: [],
              allowed_actions: ['read', 'write'],
            },
            {
              index_patterns: ['.query_request_index'],
              dls: '',
              fls: [],
              masked_fields: [],
              allowed_actions: ['read', 'write'],
            },
            {
              index_patterns: ['flint*'],
              dls: '',
              fls: [],
              masked_fields: [],
              allowed_actions: ['read', 'write'],
            },
          ],
          tenant_permissions: [],
        }),
      })
      .then(() => {
        setToast(`${backendRole} successfully created`);
      })
      .catch(() => {
        setToast(
          `Error in automatically creating ${backendRole}. Please proceed to security plugin to manually create this role.`
        );
      });
    await http!
      .post(`/api/v1/configuration/rolesmapping/${backendRole}`, {
        body: JSON.stringify({
          backend_roles: [`${props.properties['glue.auth.role_arn']}`],
        }),
      })
      .then(() => {
        setToast(`${backendRole} successfully mapped to ${props.properties['glue.auth.role_arn']}`);
      })
      .catch(() => {
        setToast(
          `Error in automatically mapping role_arn to ${backendRole}. Please proceed to security plugin to manually map the role_arn to the ${backendRole} role.`
        );
      });
  };

  return (
    <EuiFlexItem>
      <EuiFlexGroup direction={'column'}>
        <EuiFlexItem>
          <EuiText>
            <h3>Data source permissions</h3>
          </EuiText>
          <EuiText size="s">
            <p>
              Configure an OpenSearch role that this datasource will use when writing data back to
              OpenSearch. This involves first creating a role with the appropriate permissions to
              write and read data back, and then mapping the role_arn as a backend role. This data
              source needs read and write permissions to the following indices: flint*,
              .query_request_index, and .query_result_index.
            </p>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiRadioGroup
            options={createBackendRoleOptions}
            idSelected={createBackendRoleSelectedOption}
            onChange={(id) => {
              setCreateBackendRoleSelectedOption(id);
            }}
            name="backend-radio-group"
            legend={{
              children: <span>Set up role</span>,
            }}
          />
          {createBackendRoleSelectedOption === 'automatic' && (
            <div>
              <EuiSpacer size="m" />
              <EuiFieldText
                data-test-subj="role-name"
                value={backendRole}
                onChange={(e) => {
                  setBackendRole(e.target.value);
                }}
              />
              <EuiSpacer size="m" />
              <EuiButton onClick={automaticallyCreateBackendRoleAndMapping}>Create</EuiButton>
            </div>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlexItem>
  );
};
