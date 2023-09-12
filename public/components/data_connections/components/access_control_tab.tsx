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
  EuiBottomBar,
  EuiButtonEmpty,
} from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { EuiPanel } from '@elastic/eui';
import {
  ACCELERATION_ALL,
  ACCELERATION_RESTRICT,
  QUERY_ALL,
  QUERY_RESTRICT,
} from 'common/constants/data_connections';
import { AccessControlCallout } from './access_control_callout';
import { coreRefs } from '../../../../public/framework/core_refs';
import { QueryPermissionsFlexItem } from './query_permissions_flex_item';
import { AccelerationPermissionsFlexItem } from './acceleration_permissions_flex_item';

export const AccessControlTab = () => {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [roles, setRoles] = useState<Array<{ label: string }>>([]);
  const [selectedQueryPermissionRoles, setSelectedQueryPermissionRoles] = useState<
    Array<{ label: string }>
  >([]);
  const [selectedAccelerationPermissionRoles, setSelectedAccelerationPermissionRoles] = useState<
    Array<{ label: string }>
  >([]);
  const [queryPermissionRadioSelected, setQueryRadioIdSelected] = useState(`query-1`);
  const [accelerationPermissionRadioSelected, setAccelerationRadioIdSelected] = useState(
    `acceleration-1`
  );

  const [finalQueryPermissionsPlaceHolder, setFinalQueryPermissionsPlaceHolder] = useState<
    Array<{ label: string }>
  >([]);
  const [
    finalAccelerationPermissionsPlaceHolder,
    setFinalAccelerationPermissionsPlaceHolder,
  ] = useState<Array<{ label: string }>>([]);

  useEffect(() => {
    coreRefs.http!.get('/api/v1/configuration/roles').then((data) =>
      setRoles(
        Object.keys(data.data).map((key) => {
          return { label: key };
        })
      )
    );
  }, []);

  const queryRadios = [
    {
      id: QUERY_RESTRICT,
      label: 'Restricted - accessible by users with specific OpenSearch roles',
    },
    {
      id: QUERY_ALL,
      label: 'Everyone - accessible by all users on this cluster',
    },
  ];
  const accelerationRadios = [
    {
      id: ACCELERATION_RESTRICT,
      label: 'Restricted - accessible by users with specific OpenSearch roles',
    },
    {
      id: ACCELERATION_ALL,
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
                {finalQueryPermissionsPlaceHolder.length
                  ? `Restricted to ${finalQueryPermissionsPlaceHolder.map((role) => role.label)}`
                  : '-'}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFlexGroup direction="column">
            <EuiFlexItem grow={false}>
              <EuiText className="overview-title">Acceleration permissions</EuiText>
              <EuiText size="s" className="overview-content">
                {finalAccelerationPermissionsPlaceHolder.length
                  ? `Restricted to ${finalAccelerationPermissionsPlaceHolder.map(
                      (role) => role.label
                    )}`
                  : '-'}
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
          radios={queryRadios}
        />
        <AccelerationPermissionsFlexItem
          roles={roles}
          selectedRoles={selectedAccelerationPermissionRoles}
          setSelectedRoles={setSelectedAccelerationPermissionRoles}
          selectedRadio={accelerationPermissionRadioSelected}
          setSelectedRadio={setAccelerationRadioIdSelected}
          radios={accelerationRadios}
        />
      </EuiFlexGroup>
    );
  };

  const saveChanges = () => {
    setFinalAccelerationPermissionsPlaceHolder(selectedAccelerationPermissionRoles);
    setFinalQueryPermissionsPlaceHolder(selectedQueryPermissionRoles);
    setMode('view');
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
                mode === 'view'
                  ? () => {
                      setMode('edit');
                    }
                  : () => {
                      setMode('view');
                    }
              }
              fill={mode === 'view' ? true : false}
            >
              {mode === 'view' ? 'Edit' : 'Cancel'}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiHorizontalRule />
        {mode === 'view' ? renderViewAccessControlDetails() : renderEditAccessControlDetails()}
      </EuiPanel>
      <EuiSpacer />
      {mode === 'edit' ? (
        <EuiBottomBar affordForDisplacement={false}>
          <EuiFlexGroup justifyContent="flexEnd">
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                onClick={() => {
                  setMode('view');
                }}
                color="ghost"
                size="s"
                iconType="cross"
              >
                Discard change(s)
              </EuiButtonEmpty>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton onClick={saveChanges} size="s" iconType="check" fill>
                Save
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiBottomBar>
      ) : null}
    </>
  );
};
