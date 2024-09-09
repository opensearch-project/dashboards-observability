/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiCompressedSwitch, EuiSpacer } from '@elastic/eui';

interface SwitchButtonProps {
  currentValue: boolean;
  title: string;
  onToggle: (value: boolean) => void;
}
export const SwitchButton = ({ currentValue, onToggle, title }: SwitchButtonProps) => {
  return (
    <>
      <EuiSpacer />
      <EuiCompressedSwitch
        label={title}
        checked={currentValue}
        onChange={(e) => onToggle(e.target.checked)}
      />
    </>
  );
};
