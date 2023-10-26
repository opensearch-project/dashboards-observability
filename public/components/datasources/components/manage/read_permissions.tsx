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
import { coreRefs } from '../../../../../public/framework/core_refs';
import { useToast } from '../../../../../public/components/common/toast';

export const ReadPermissionsConfiguration = (props: { DataSourceName: string }) => {
  const { http } = coreRefs;
  const { setToast } = useToast();
  const [readRole, setReadRole] = useState(`fgac_role_datasource_${props.DataSourceName}_read`);

  const [createReadRoleSelectedOption, setCreateReadRoleSelectedOption] = useState('automaticread');

  const createReadRoleOptions = [
    {
      id: 'manualread',
      label: 'Manual configuration',
    },
    {
      id: 'automaticread',
      label: 'Automatically create role',
    },
  ];

  const automaticallyCreateReadRole = async () => {
    await http!
      .post(`/api/v1/configuration/roles/${readRole}`, {
        body: JSON.stringify({
          cluster_permissions: [],
          index_permissions: [
            {
              index_patterns: ['.query_result_index'],
              dls: `{\n  \"bool\": {\n    \"must\": {\n      \"match\": {\n        \"dataSourceName\": \"${props.DataSourceName}\"\n      }\n    }\n  }\n}`,
              fls: [],
              masked_fields: [],
              allowed_actions: ['read'],
            },
          ],
          tenant_permissions: [],
        }),
      })
      .then(() => {
        setToast(`${readRole} successfully created`);
      })
      .catch(() => {
        setToast(
          `Error in automatically creating ${readRole}. Please proceed to security plugin to manually create this role.`
        );
      });
  };

  return (
    <EuiFlexItem>
      <EuiFlexGroup direction={'column'}>
        <EuiFlexItem>
          <EuiText>
            <h3>Read permissions</h3>
          </EuiText>
          <EuiText size="s">
            <p>
              Configure an OpenSearch role that will have permission to read results from this
              datasource. This role must have read permissions on .query_result_index, and must have
              DLS to ensure it cannot read the results from other data sources.
            </p>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiRadioGroup
            options={createReadRoleOptions}
            idSelected={createReadRoleSelectedOption}
            onChange={(id) => {
              console.log(id);
              setCreateReadRoleSelectedOption(id);
            }}
            name="read-radio-group"
            legend={{
              children: <span>Set up role</span>,
            }}
          />
          {createReadRoleSelectedOption === 'automaticread' && (
            <div>
              <EuiSpacer size="m" />
              <EuiFieldText
                data-test-subj="role-name"
                value={readRole}
                onChange={(e) => {
                  setReadRole(e.target.value);
                }}
              />
              <EuiSpacer size="m" />
              <EuiButton onClick={automaticallyCreateReadRole}>Create</EuiButton>
            </div>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlexItem>
  );
};
