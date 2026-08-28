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
  const trimmed = value.trim();
  if (!trimmed) return EMPTY_VALUE;
  // A value that already contains a space is a display-ready sentence — the
  // AD/forecaster side sends statuses like "Awaiting data to init" — so pass
  // it through untouched rather than re-casing it.
  if (/\s/.test(trimmed)) return trimmed;
  // A separated (`at_risk`) or all-caps (`AT_RISK`, `RUNNING`) token is
  // machine-style: normalize to sentence case so it reads as prose instead of
  // shouting ("At risk", not "AT RISK"). A token that's already mixed/lower
  // case with no separators only gets its first letter capitalized, so any
  // intentional internal casing is preserved.
  const machineStyle = /[_-]/.test(trimmed) || trimmed === trimmed.toUpperCase();
  const spaced = trimmed.replace(/[_-]+/g, ' ').trim();
  // A token that was only separators (`__`) collapses to empty — fall back to
  // the placeholder rather than rendering a lone space.
  if (!spaced) return EMPTY_VALUE;
  const rest = machineStyle ? spaced.slice(1).toLowerCase() : spaced.slice(1);
  return spaced.charAt(0).toUpperCase() + rest;
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

/**
 * Rule/monitor status and health values, which are a different vocabulary from
 * alert state. Only the OpenSearch-alerting side sends lowercase tokens; the
 * AD/forecaster side already sends display-ready sentences ("Running",
 * "Awaiting data to init"), which fall through {@link humanizeUnknown}
 * unchanged. Only the tokens that actually need translating are mapped.
 */
const MONITOR_STATE_LABELS: Record<string, string> = {
  active: i18n.translate('observability.alerting.monitorStateLabel.active', {
    defaultMessage: 'Active',
  }),
  pending: i18n.translate('observability.alerting.monitorStateLabel.pending', {
    defaultMessage: 'Pending',
  }),
  muted: i18n.translate('observability.alerting.monitorStateLabel.muted', {
    defaultMessage: 'Muted',
  }),
  disabled: i18n.translate('observability.alerting.monitorStateLabel.disabled', {
    defaultMessage: 'Disabled',
  }),
  healthy: i18n.translate('observability.alerting.monitorStateLabel.healthy', {
    defaultMessage: 'Healthy',
  }),
  failing: i18n.translate('observability.alerting.monitorStateLabel.failing', {
    defaultMessage: 'Failing',
  }),
  no_data: i18n.translate('observability.alerting.monitorStateLabel.noData', {
    defaultMessage: 'No data',
  }),
};

/**
 * Display label for a rule/monitor `status` or `healthStatus`. Returns
 * {@link EMPTY_VALUE} when absent. Unmapped values are humanized rather than
 * dropped, so a status the UI doesn't know yet still reads as prose.
 */
export function getMonitorStateLabel(value?: string | null): string {
  if (!value) return EMPTY_VALUE;
  return MONITOR_STATE_LABELS[value] ?? humanizeUnknown(value);
}
