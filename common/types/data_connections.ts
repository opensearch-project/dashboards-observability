/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiComboBoxOptionOption } from '@elastic/eui';

export interface PermissionsConfigurationProps {
  roles: Role[];
  selectedRoles: Role[];
  setSelectedRoles: React.Dispatch<React.SetStateAction<Role[]>>;
  layout: 'horizontal' | 'vertical';
}

export type Role = EuiComboBoxOptionOption;

export type DatasourceType = 'SPARK' | 'S3GLUE' | 'OPENSEARCH';
