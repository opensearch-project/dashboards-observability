/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiBadge } from '@elastic/eui';
import { euiThemeVars } from '@osd/ui-shared-deps/theme';
import { getSeverityLabel } from './enum_labels';

/** Critical's tag color: dark filled, with no red. */
export const CRITICAL_TAG_COLOR = euiThemeVars.euiColorDarkestShade;

export interface SeverityTagProps {
  severity?: string | null;
  'data-test-subj'?: string;
}

/**
 * Severity as an outlined neutral tag with the word, the same in the tables and
 * the flyouts, so it never competes with the status.
 * Critical is a dark filled tag with white text. Chart
 * colors (`SEVERITY_HEX`) are unchanged.
 */
export const SeverityTag: React.FC<SeverityTagProps> = ({
  severity,
  'data-test-subj': dataTestSubj,
}) => (
  <EuiBadge
    color={severity === 'critical' ? CRITICAL_TAG_COLOR : 'hollow'}
    data-test-subj={dataTestSubj}
    data-severity={severity || undefined}
  >
    {getSeverityLabel(severity)}
  </EuiBadge>
);
