/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SloHealthState } from './slo_types';

export const SLO_HEALTH_COLOR: Record<SloHealthState, string> = {
  breached: 'danger',
  warning: 'warning',
  ok: 'success',
  no_data: 'subdued',
  // Same neutral color as no_data — both are "no signal yet". The label
  // and tooltip differentiate the two states; color alone shouldn't.
  source_idle: 'subdued',
  stale: 'subdued',
  disabled: 'default',
  // Broken rules are as bad as a breach — alerts can't fire when the rule group is gone.
  rules_missing: 'danger',
};

export const SLO_HEALTH_ORDER: SloHealthState[] = [
  'breached',
  'rules_missing',
  'warning',
  'ok',
  'no_data',
  'source_idle',
  'stale',
  'disabled',
];

export function getSloHealthColor(state: SloHealthState | string | undefined | null): string {
  if (state && Object.prototype.hasOwnProperty.call(SLO_HEALTH_COLOR, state)) {
    return SLO_HEALTH_COLOR[state as SloHealthState];
  }
  return 'subdued';
}

/**
 * Short operator-facing labels for each SLO health state. Used by the detail
 * header's EuiHealth so the state is carried in text — not color alone (VD4).
 * Kept plain (no i18n) for symmetry with the rest of common/slo/state.ts; the
 * localized copy already lives on the service-details tab's internal table.
 */
const SLO_HEALTH_LABEL: Record<SloHealthState, string> = {
  breached: 'Breached',
  warning: 'Warning',
  ok: 'Healthy',
  no_data: 'No data',
  source_idle: 'Source idle',
  stale: 'Stale',
  disabled: 'Disabled',
  rules_missing: 'Rules missing',
};

export function getSloHealthLabel(state: SloHealthState | string | undefined | null): string {
  if (state && Object.prototype.hasOwnProperty.call(SLO_HEALTH_LABEL, state)) {
    return SLO_HEALTH_LABEL[state as SloHealthState];
  }
  return 'Unknown';
}
