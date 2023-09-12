/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiRadioGroupOption } from '@elastic/eui';

export interface PermissionsFlexItem {
  roles: Array<{ label: string }>;
  selectedRoles: Array<{ label: string }>;
  selectedRadio: string;
  setSelectedRoles: (selectedRoles: Array<{ label: string }>) => void;
  setSelectedRadio: (selectedRadio: string) => void;
  radios: EuiRadioGroupOption[];
}
