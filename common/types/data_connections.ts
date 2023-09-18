/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiRadioGroupOption } from '@elastic/eui';

export interface PermissionsConfiguration {
  roles: Array<{ label: string }>;
  selectedRoles: Array<{ label: string }>;
  selectedRadio: string;
  setSelectedRoles: React.Dispatch<React.SetStateAction<Array<{ label: string }>>>;
  setSelectedRadio: React.Dispatch<React.SetStateAction<string>>;
  radios: EuiRadioGroupOption[];
}
