/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButton,
  EuiFieldText,
  EuiFlexGroup,
  EuiHorizontalRule,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { useEffect, useState } from 'react';
import React from 'react';
import { useToast } from '../../../../../public/components/common/toast';
import { coreRefs } from '../../../../../public/framework/core_refs';
import { QueryPermissionsConfiguration } from '../new/query_permissions';
import { SECURITY_ROLES } from '../../../../../common/constants/shared';
import { Role } from '../../../../../common/types/data_connections';
import { ReadPermissionsConfiguration } from './read_permissions';
import { DataSourcePermissionsConfiguration } from './datasource_permissions';
import { AccessControlTabProps } from './access_control_tab';

export const EditAccessControlDetails = (props: AccessControlTabProps) => {
  const { http } = coreRefs;
  const { setToast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [hasSecurityAccess, setHasSecurityAccess] = useState(true);

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

  return (
    <>
      <EuiFlexGroup direction="column">
        <QueryPermissionsConfiguration
          roles={roles}
          selectedRoles={selectedQueryPermissionRoles}
          setSelectedRoles={setSelectedQueryPermissionRoles}
          layout={'vertical'}
          hasSecurityAccess={hasSecurityAccess}
        />
      </EuiFlexGroup>
      <EuiHorizontalRule />
      <EuiFlexGroup direction="column">
        <ReadPermissionsConfiguration DataSourceName={props.dataConnection} />
      </EuiFlexGroup>
      <EuiHorizontalRule />
      <EuiFlexGroup direction="column">
        <DataSourcePermissionsConfiguration
          DataSourceName={props.dataConnection}
          properties={props.properties}
        />
      </EuiFlexGroup>
    </>
  );
};
