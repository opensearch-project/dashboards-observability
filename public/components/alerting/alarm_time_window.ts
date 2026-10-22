/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The time window that scopes a rule's state and history (the CloudWatch alarm flyout's state
 * timeline, metric preview and state history), plus the copy its panels show when the window
 * holds nothing.
 */
import { i18n } from '@osd/i18n';
import moment from 'moment';

export interface AlarmTimeWindow {
  startMs: number;
  endMs: number;
  /** How the panels name the window, e.g. "last 24h" or "the selected range". */
  label: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const UNIT_LABELS: Record<string, string> = {
  s: 's',
  m: 'm',
  h: 'h',
  d: 'd',
  w: 'w',
  M: 'mo',
  y: 'y',
};

/**
 * How to name a picker range in panel copy: "last 24h" for `now-24h` → `now`, otherwise
 * "the selected range".
 */
export function describeTimeRange(start?: string, end?: string): string {
  const match = start ? /^now-(\d+)([smhdwMy])$/.exec(start.trim()) : null;
  if (match && (end ?? 'now').trim() === 'now') {
    return i18n.translate('observability.alerting.alarmTimeWindow.lastRange', {
      defaultMessage: 'last {amount}{unit}',
      values: { amount: match[1], unit: UNIT_LABELS[match[2]] },
    });
  }
  return i18n.translate('observability.alerting.alarmTimeWindow.selectedRange', {
    defaultMessage: 'the selected range',
  });
}

/** The last 24h, the window used when the caller doesn't pass one. */
export function defaultAlarmTimeWindow(now: number = Date.now()): AlarmTimeWindow {
  return { startMs: now - DAY_MS, endMs: now, label: describeTimeRange('now-24h', 'now') };
}

/** Whether an ISO timestamp falls inside the window. */
export function isInWindow(timestamp: string | undefined, window: AlarmTimeWindow): boolean {
  if (!timestamp) return false;
  const t = new Date(timestamp).getTime();
  return Number.isFinite(t) && t >= window.startMs && t <= window.endMs;
}

/**
 * The copy for a panel with nothing in the window. With the alarm's last state change, and that
 * change before the window: "No changes in last 24h, last change 9/24". Otherwise: "No changes
 * in last 24h."
 */
export function noChangesInWindowMessage(window: AlarmTimeWindow, lastChange?: string): string {
  const t = lastChange ? new Date(lastChange).getTime() : NaN;
  if (Number.isFinite(t) && t < window.startMs) {
    return i18n.translate('observability.alerting.alarmTimeWindow.noChangesLastChange', {
      defaultMessage: 'No changes in {window}, last change {date}',
      values: { window: window.label, date: moment(t).format('M/D') },
    });
  }
  return i18n.translate('observability.alerting.alarmTimeWindow.noChanges', {
    defaultMessage: 'No changes in {window}.',
    values: { window: window.label },
  });
}

/** The copy for a panel whose datasource doesn't report state history. */
export function stateHistoryUnavailableMessage(datasourceType?: string): string {
  if (datasourceType === 'prometheus') {
    return i18n.translate('observability.alerting.alarmTimeWindow.unavailablePrometheus', {
      defaultMessage: "State history isn't available for Prometheus rules.",
    });
  }
  return i18n.translate('observability.alerting.alarmTimeWindow.unavailableOpenSearch', {
    defaultMessage: "State history isn't available for OpenSearch rules.",
  });
}
