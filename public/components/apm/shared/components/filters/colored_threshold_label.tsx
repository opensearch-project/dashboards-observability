/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiText } from '@elastic/eui';
import { euiThemeVars } from '@osd/ui-shared-deps/theme';

export interface ColoredThresholdLabelProps {
  threshold: string;
  color: string;
}

/**
 * ColoredThresholdLabel - Displays a colored indicator circle with threshold text
 * Used in checkbox filters to provide visual SLO-style color coding
 */
export const ColoredThresholdLabel: React.FC<ColoredThresholdLabelProps> = ({
  threshold,
  color,
}) => (
  <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
    <EuiFlexItem grow={false}>
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          backgroundColor: color,
          border: `1px solid ${euiThemeVars.euiColorLightShade}`,
          flexShrink: 0,
        }}
      />
    </EuiFlexItem>
    <EuiFlexItem grow={false}>
      <EuiText size="s">{threshold}</EuiText>
    </EuiFlexItem>
  </EuiFlexGroup>
);
