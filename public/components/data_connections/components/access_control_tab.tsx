/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiPageHeader,
  EuiPageHeaderSection,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiHorizontalRule,
  htmlIdGenerator,
  EuiRadioGroup,
  EuiComboBox,
} from '@elastic/eui';
import _ from 'lodash';
import React, { useEffect, useState } from 'react';
import { EuiPanel } from '@elastic/eui';
import { render } from 'mustache';
import { OPENSEARCH_DOCUMENTATION_URL } from '../../../../common/constants/data_connections';
import { AccessControlCallout } from './access_control_callout';
import { coreRefs } from '../../../../public/framework/core_refs';
import { QueryPermissionsFlexItem } from './query_permissions_flex_item';
import { AccelerationPermissionsFlexItem } from './acceleration_permissions_flex_item';

export const AccessControlTab = () => {
  const [mode, setMode] = useState<'view' | 'edit'>('edit');
  const [roles, setRoles] = useState<Array<{ label: string }>>([]);
  const [selectedQueryPermissionRoles, setSelectedQueryPermissionRoles] = useState<
    Array<{ label: string }>
  >([]);
  const [selectedAccelerationPermissionRoles, setSelectedAccelerationPermissionRoles] = useState<
    Array<{ label: string }>
  >([]);
  const [queryPermissionRadioSelected, setQueryRadioIdSelected] = useState(`1`);
  const [accelerationPermissionRadioSelected, setAccelerationRadioIdSelected] = useState(`1`);

  useEffect(() => {
    coreRefs.http!.get('/api/v1/configuration/roles').then((data) =>
      setRoles(
        Object.keys(data.data).map((key) => {
          return { label: key };
        })
      )
    );
  }, []);

  const radios = [
    {
      id: `0`,
      label: 'Restricted - accessible by users with specific OpenSearch roles',
    },
    {
      id: `1`,
      label: 'Everyone - accessible by all users on this cluster',
    },
  ];
  const radios2 = [
    {
      id: `0`,
      label: 'Restricted - accessible by users with specific OpenSearch roles',
    },
    {
      id: `1`,
      label: 'Everyone - accessible by all users on this cluster',
    },
  ];

  const renderViewAccessControlDetails = () => {
    return (
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiFlexGroup direction="column">
            <EuiFlexItem grow={false}>
              <EuiText className="overview-title">Query access</EuiText>
              <EuiText size="s" className="overview-content">
                {'-'}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFlexGroup direction="column">
            <EuiFlexItem grow={false}>
              <EuiText className="overview-title">Acceleration permissions</EuiText>
              <EuiText size="s" className="overview-content">
                {'-'}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  const renderEditAccessControlDetails = () => {
    return (
      <EuiFlexGroup direction="column">
        <QueryPermissionsFlexItem
          roles={roles}
          selectedRoles={selectedQueryPermissionRoles}
          setSelectedRoles={setSelectedQueryPermissionRoles}
          selectedRadio={queryPermissionRadioSelected}
          setSelectedRadio={setQueryRadioIdSelected}
          radios={radios}
        />
        <AccelerationPermissionsFlexItem
          roles={roles}
          selectedRoles={selectedAccelerationPermissionRoles}
          setSelectedRoles={setSelectedAccelerationPermissionRoles}
          selectedRadio={accelerationPermissionRadioSelected}
          setSelectedRadio={setAccelerationRadioIdSelected}
          radios={radios2}
        />
      </EuiFlexGroup>
    );
  };

  return (
    <>
      <EuiSpacer />
      <AccessControlCallout />
      <EuiSpacer />
      <EuiPanel>
        <EuiFlexGroup direction="row">
          <EuiFlexItem>
            <EuiText size="m">
              <h2 className="panel-title">Access Control</h2>
              Control which OpenSearch users have access to this data source.
            </EuiText>
          </EuiFlexItem>

          <EuiFlexItem grow={false}>
            <EuiButton
              data-test-subj="createButton"
              onClick={
                mode === 'edit'
                  ? () => {
                      setMode('view');
                    }
                  : () => {
                      setMode('edit');
                    }
              }
              fill={mode === 'edit' ? true : false}
            >
              {mode === 'edit' ? 'Edit' : 'View'}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiHorizontalRule />
        {mode === 'edit' ? renderViewAccessControlDetails() : renderEditAccessControlDetails()}
      </EuiPanel>
    </>
  );
};
