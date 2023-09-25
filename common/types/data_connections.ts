/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PermissionsConfigurationProps {
  roles: Array<{ label: string }>;
  selectedRoles: Array<{ label: string }>;
  setSelectedRoles: React.Dispatch<React.SetStateAction<Array<{ label: string }>>>;
  layout: 'horizontal' | 'vertical';
}
