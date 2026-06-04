/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared toast helpers for the alert manager. Extracted from `alarms_page.tsx`
 * and `explore_create_monitor.tsx` so both create flows surface the same
 * "Monitor created → View rule" experience.
 *
 * Why a shared helper:
 *   - Both surfaces want the same wording, lifetime, and deep-link target.
 *   - The deep-link target needs `coreRefs.application.navigateToApp` plus a
 *     manual `hashchange` dispatch (the alarms page lives at a hash route,
 *     and SPA-internal hash changes don't always trigger React updates
 *     without nudging the listener) — putting that recipe in one place
 *     prevents drift.
 */
import React from 'react';
import { EuiLink } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { toMountPoint } from '../../../../../src/plugins/opensearch_dashboards_react/public';
import { observabilityAlertingID } from '../../../common/constants/shared';
import { coreRefs } from '../../framework/core_refs';

const TOAST_LIFETIME_MS = 12_000;

/**
 * Build the alarms-page deep link for the Rules tab pre-filtered to a
 * specific monitor name + datasource. The hash format is read by
 * `parseAlarmsHashRoute` in `alarms_page.tsx` — keep them in sync if
 * either changes.
 */
function buildRulesDeepLinkPath(monitorName: string, dsId: string): string {
  const params = new URLSearchParams({ q: monitorName, ds: dsId });
  return `#/rules?${params.toString()}`;
}

/**
 * Navigate to the alarms page Rules tab, filtered to the given monitor.
 * Works from any environment (local, MDS-enabled, custom basepath) because
 * `navigateToApp` resolves the basepath itself. The trailing `hashchange`
 * dispatch is what wakes the alarms-page hash listener when the link is
 * clicked from inside the same app (e.g. a Rules-page create toast) —
 * `navigateToApp` updates `location.hash` but the browser only fires
 * `hashchange` when the *URL* hash actually transitions; a no-op-looking
 * navigation can otherwise leave the listener stale.
 */
export function navigateToRuleInAlarmsPage(monitorName: string, dsId: string): void {
  const path = buildRulesDeepLinkPath(monitorName, dsId);
  coreRefs?.application?.navigateToApp(observabilityAlertingID, { path });
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/**
 * Show a "Monitor created" success toast with a long lifetime and a
 * "View rule" inline link that lands on the alarms page Rules tab,
 * filtered to the new monitor.
 *
 * No-ops gracefully when the toasts service hasn't been wired yet — same
 * shape as the existing `useToast` helper, so the create flow can call
 * this even on unusual init paths without throwing.
 */
export function showMonitorCreatedToast({
  monitorName,
  dsId,
}: {
  monitorName: string;
  dsId: string;
}): void {
  const toasts = coreRefs?.toasts;
  if (!toasts) return;

  toasts.addSuccess({
    title: i18n.translate('observability.alerting.toast.monitorCreated.title', {
      defaultMessage: 'Alert rule created',
    }),
    text: toMountPoint(
      <EuiLink
        onClick={() => navigateToRuleInAlarmsPage(monitorName, dsId)}
        data-test-subj="alertManagerToastViewRule"
      >
        {i18n.translate('observability.alerting.toast.monitorCreated.link', {
          defaultMessage: 'View rule',
        })}
      </EuiLink>
    ),
    toastLifeTimeMs: TOAST_LIFETIME_MS,
  });
}
