/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiText,
  EuiHorizontalRule,
  EuiButton,
} from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { EuiPanel } from '@elastic/eui';
import { ConnectionManagementCallout } from './connection_management_callout';
import { Role } from '../../../../../common/types/data_connections';
import { coreRefs } from '../../../../../public/framework/core_refs';
import { QueryPermissionsConfiguration } from '../new/query_permissions';
import { DATACONNECTIONS_BASE, EDIT, SECURITY_ROLES } from '../../../../../common/constants/shared';
import { SaveOrCancel } from '../save_or_cancel';

interface AccessControlTabProps {
  dataConnection: string;
  connector: string;
  properties: unknown;
  allowedRoles: string[];
}

export const AccessControlTab = (props: AccessControlTabProps) => {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [roles, setRoles] = useState<Role[]>([]);
  const [hasSecurityAccess, setHasSecurityAccess] = useState(true);
  const { http } = coreRefs;

  useEffect(() => {
    http!
      .get(SECURITY_ROLES)
      .then((data) =>
        setRoles(
          Object.keys(data.data).map((key) => {
            return { label: key };
          })
        )
      )
      .catch((err) => setHasSecurityAccess(false));
  }, []);

  const [selectedQueryPermissionRoles, setSelectedQueryPermissionRoles] = useState<Role[]>(
    props.allowedRoles.map((role) => {
      return { label: role };
    })
  );

  const AccessControlDetails = () => {
    return (
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiFlexGroup direction="column">
            <EuiFlexItem grow={false}>
              <EuiText className="overview-title">Query access</EuiText>
              <EuiText size="s" className="overview-content">
                {selectedQueryPermissionRoles.length
                  ? `Restricted to ${selectedQueryPermissionRoles
                      .map((role) => role.label)
                      .join(',')}`
                  : 'Admin only'}
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
          layout={'vertical'}
          hasSecurityAccess={hasSecurityAccess}
        />
      </EuiFlexGroup>
    );
  };

  const saveChanges = () => {
    http!.post(`${DATACONNECTIONS_BASE}${EDIT}`, {
      body: JSON.stringify({
        name: props.dataConnection,
        allowedRoles: selectedQueryPermissionRoles.map((role) => role.label),
      }),
    });
    setMode('view');
  };

  const AccessControlHeader = () => {
    return (
      <EuiFlexGroup direction="row">
        <EuiFlexItem>
          <EuiText size="m">
            <h2 className="panel-title">Access control</h2>
            Control which OpenSearch users have access to this data source.
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton
            data-test-subj="createButton"
            onClick={() => setMode(mode === 'view' ? 'edit' : 'view')}
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
