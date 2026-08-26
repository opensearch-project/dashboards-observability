/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';
import type { UnifiedAlertSeverity, UnifiedAlertState } from '../../../common/types/alerting';

/**
 * Human-readable, translatable labels for the raw alert enums.
 *
 * The wire format uses lowercase machine values (`critical`, `at_risk`, …).
 * Rendering those directly leaks the data model into the UI and cannot be
 * localised, so every surface that shows a severity or state to a user should
 * go through the getters below rather than interpolating the raw value.
 */

/**
 * Single placeholder for an absent value. Kept here — alongside the other
 * "how do we render a raw value as human text" rules — so surfaces stop
 * drifting between `—`, `---`, and `N/A` for the same empty cell.
 */
export const EMPTY_VALUE = '—';

export const SEVERITY_LABELS: Record<UnifiedAlertSeverity, string> = {
  critical: i18n.translate('observability.alerting.severityLabel.critical', {
    defaultMessage: 'Critical',
  }),
  high: i18n.translate('observability.alerting.severityLabel.high', {
    defaultMessage: 'High',
  }),
  medium: i18n.translate('observability.alerting.severityLabel.medium', {
    defaultMessage: 'Medium',
  }),
  low: i18n.translate('observability.alerting.severityLabel.low', {
    defaultMessage: 'Low',
  }),
  info: i18n.translate('observability.alerting.severityLabel.info', {
    defaultMessage: 'Info',
  }),
};

export const STATE_LABELS: Record<UnifiedAlertState, string> = {
  active: i18n.translate('observability.alerting.stateLabel.active', {
    defaultMessage: 'Active',
  }),
  pending: i18n.translate('observability.alerting.stateLabel.pending', {
    defaultMessage: 'Pending',
  }),
  acknowledged: i18n.translate('observability.alerting.stateLabel.acknowledged', {
    defaultMessage: 'Acknowledged',
  }),
  silenced: i18n.translate('observability.alerting.stateLabel.silenced', {
    defaultMessage: 'Silenced',
  }),
  resolved: i18n.translate('observability.alerting.stateLabel.resolved', {
    defaultMessage: 'Resolved',
  }),
  error: i18n.translate('observability.alerting.stateLabel.error', {
    defaultMessage: 'Error',
  }),
};

/**
 * Best-effort label for a value that isn't in the known enum — a backend may
 * add a state before the UI knows about it. Turns `awaiting_data` into
 * "Awaiting data" so an unrecognised value still reads as prose instead of
 * disappearing behind a placeholder.
 */
function humanizeUnknown(value: string): string {
  const spaced = value.replace(/[_-]+/g, ' ').trim();
  if (!spaced) return EMPTY_VALUE;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Display label for an alert severity. Returns {@link EMPTY_VALUE} when absent. */
export function getSeverityLabel(severity?: string | null): string {
  if (!severity) return EMPTY_VALUE;
  return SEVERITY_LABELS[severity as UnifiedAlertSeverity] ?? humanizeUnknown(severity);
}

/** Display label for an alert state. Returns {@link EMPTY_VALUE} when absent. */
export function getStateLabel(state?: string | null): string {
  if (!state) return EMPTY_VALUE;
  return STATE_LABELS[state as UnifiedAlertState] ?? humanizeUnknown(state);
}
