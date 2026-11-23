/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiBadge } from '@elastic/eui';
import { getSeverityLabel } from './enum_labels';

export interface SeverityTagProps {
  severity?: string | null;
  'data-test-subj'?: string;
}

/**
 * Severity as an outlined neutral tag with the word, the same in the tables and
 * the flyouts, so it never competes with the status.
 * Every severity, Critical included, uses the hollow badge: color belongs to the
 * status. Chart colors (`SEVERITY_HEX`) are unchanged.
 */
export const SeverityTag: React.FC<SeverityTagProps> = ({
  severity,
  'data-test-subj': dataTestSubj,
}) => (
  <EuiBadge color="hollow" data-test-subj={dataTestSubj} data-severity={severity || undefined}>
    {getSeverityLabel(severity)}
  </EuiBadge>
);
