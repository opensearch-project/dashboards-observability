/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Fragment } from 'react';
import { EuiSpacer, EuiCompressedFormRow, EuiSwitch, htmlIdGenerator } from '@elastic/eui';

interface EUISwitch {
  label: string;
  disabled: boolean;
  checked: boolean;
  handleChange: (isChecked: boolean) => void;
}
export const ConfigSwitch: React.FC<EUISwitch> = ({ label, disabled, checked, handleChange }) => (
  <Fragment key={`config-switch-${label}`}>
    <EuiCompressedFormRow label={label}>
      <EuiSwitch
        id={htmlIdGenerator('switch-button')()}
        showLabel={false}
        disabled={disabled}
        label={label}
        checked={checked}
        onChange={(e) => handleChange(e.target.checked)}
        compressed
      />
    </EuiCompressedFormRow>
    <EuiSpacer size="s" />
  </Fragment>
);
