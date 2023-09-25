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
import React, { useEffect, useState } from 'react';
import { EuiPanel } from '@elastic/eui';
import { ConnectionManagementCallout } from './connection_management_callout';
import { coreRefs } from '../../../../framework/core_refs';
import { QueryPermissionsConfiguration } from './query_permissions';
import { DATACONNECTIONS_BASE } from '../../../../../common/constants/shared';
import { SaveOrCancel } from '../save_or_cancel';

interface AccessControlTabProps {
  dataConnection: string;
  connector: string;
  properties: unknown;
  allowedRoles: string[];
}

export const AccessControlTab = (props: AccessControlTabProps) => {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [roles, setRoles] = useState<Array<{ label: string }>>([]);
  const [selectedQueryPermissionRoles, setSelectedQueryPermissionRoles] = useState<
    Array<{ label: string }>
  >(
    props.allowedRoles.map((role) => {
      return { label: role };
    })
  );
  const { http } = coreRefs;

  useEffect(() => {
    http!.get('/api/v1/configuration/roles').then((data) =>
      setRoles(
        Object.keys(data.data).map((key) => {
          return { label: key };
        })
      )
    );
  }, []);

  const AccessControlDetails = () => {
    return (
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiFlexGroup direction="column">
            <EuiFlexItem grow={false}>
              <EuiText className="overview-title">Query access</EuiText>
              <EuiText size="s" className="overview-content">
                {selectedQueryPermissionRoles.length ? `Restricted` : '-'}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  const EditAccessControlDetails = () => {
    return (
      <EuiFlexGroup direction="column">
        <QueryPermissionsConfiguration
          roles={roles}
          selectedRoles={selectedQueryPermissionRoles}
          setSelectedRoles={setSelectedQueryPermissionRoles}
        />
      </EuiFlexGroup>
    );
  };

  const saveChanges = () => {
    http!.put(`${DATACONNECTIONS_BASE}`, {
      body: JSON.stringify({
        name: props.dataConnection,
        allowedRoles: selectedQueryPermissionRoles.map((role) => role.label),
        connector: props.connector,
        properties: props.properties,
      }),
    });
    setMode('view');
  };

  const AccessControlHeader = () => {
    return (
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
        <AccessControlHeader />
        <EuiHorizontalRule />
        {mode === 'view' ? <AccessControlDetails /> : <EditAccessControlDetails />}
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
