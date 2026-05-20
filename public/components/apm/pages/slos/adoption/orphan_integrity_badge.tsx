/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * W4.8 — integrity badge rendered in the Recover / Clone adoption tables.
 *
 * Surfaces the outcome of the server-side `verifyProvenance` check as a
 * coloured `EuiHealth` badge. The badge is the operator's only signal that
 * a row is safe (or not) to adopt, so the copy is deliberately explicit.
 */

import React from 'react';
import { EuiHealth, EuiIcon, EuiToolTip } from '@elastic/eui';
import type { OrphanSpecIntegrity } from '../slo_api_client';

export interface OrphanIntegrityBadgeProps {
  integrity: OrphanSpecIntegrity;
  /** Optional — if set, a `data-test-subj` is appended with this id suffix. */
  testSubjSuffix?: string;
}

interface BadgeSpec {
  color: 'success' | 'warning' | 'danger';
  iconType: string;
  label: string;
  tooltip: string;
}

const BADGE_SPEC: Record<OrphanSpecIntegrity, BadgeSpec> = {
  ok: {
    color: 'success',
    iconType: 'check',
    label: 'Ready to adopt',
    tooltip: 'Provenance hash matches the embedded spec — recovery is safe.',
  },
  mismatch: {
    color: 'warning',
    iconType: 'alert',
    label: 'Spec drift detected',
    tooltip: 'Rules may have been edited out-of-band. Recovery is disabled.',
  },
  unsupported_schema: {
    color: 'danger',
    iconType: 'questionInCircle',
    label: 'Unknown schema',
    tooltip: 'Provenance schema version is not recognized by this plugin version.',
  },
};

export const OrphanIntegrityBadge: React.FC<OrphanIntegrityBadgeProps> = ({
  integrity,
  testSubjSuffix,
}) => {
  const spec = BADGE_SPEC[integrity];
  const testSubj = testSubjSuffix
    ? `sloAdoption-integrityBadge-${integrity}-${testSubjSuffix}`
    : `sloAdoption-integrityBadge-${integrity}`;
  return (
    <EuiToolTip content={spec.tooltip}>
      <EuiHealth color={spec.color} data-test-subj={testSubj}>
        <span>
          <EuiIcon type={spec.iconType} size="s" /> {spec.label}
        </span>
      </EuiHealth>
    </EuiToolTip>
  );
};
