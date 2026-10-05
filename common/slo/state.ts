/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';
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
 * Short operator-facing labels for each SLO health state — THE single source of
 * truth. Every SLO surface (detail header EuiHealth, listing Health cell,
 * listing filter panel) routes through {@link getSloHealthLabel} so the state
 * is carried in text — not color alone (VD4) — and reads identically everywhere.
 * Localized: en output matches the previous plain-English labels byte-for-byte,
 * so existing call sites are unaffected while non-en locales now translate.
 */
const SLO_HEALTH_LABEL: Record<SloHealthState, string> = {
  breached: i18n.translate('observability.slo.state.label.breached', {
    defaultMessage: 'Breached',
  }),
  warning: i18n.translate('observability.slo.state.label.warning', { defaultMessage: 'Warning' }),
  ok: i18n.translate('observability.slo.state.label.ok', { defaultMessage: 'Healthy' }),
  no_data: i18n.translate('observability.slo.state.label.noData', { defaultMessage: 'No data' }),
  source_idle: i18n.translate('observability.slo.state.label.sourceIdle', {
    defaultMessage: 'Source idle',
  }),
  stale: i18n.translate('observability.slo.state.label.stale', { defaultMessage: 'Stale' }),
  disabled: i18n.translate('observability.slo.state.label.disabled', {
    defaultMessage: 'Disabled',
  }),
  rules_missing: i18n.translate('observability.slo.state.label.rulesMissing', {
    defaultMessage: 'Rules missing',
  }),
};

export function getSloHealthLabel(state: SloHealthState | string | undefined | null): string {
  if (state && Object.prototype.hasOwnProperty.call(SLO_HEALTH_LABEL, state)) {
    return SLO_HEALTH_LABEL[state as SloHealthState];
  }
  return i18n.translate('observability.slo.state.label.unknown', { defaultMessage: 'Unknown' });
}
