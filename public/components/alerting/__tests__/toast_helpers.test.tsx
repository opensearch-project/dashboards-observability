/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react';

const mockNavigateToApp = jest.fn();
const mockAddSuccess = jest.fn();

// `coreRefs` is a singleton populated during plugin start. Mock it so the
// helpers can read `toasts` and `application` without spinning up the
// real plugin lifecycle.
jest.mock('../../../framework/core_refs', () => ({
  coreRefs: {
    toasts: { addSuccess: (...args: unknown[]) => mockAddSuccess(...args) },
    application: { navigateToApp: (...args: unknown[]) => mockNavigateToApp(...args) },
  },
}));

// `toMountPoint` returns a mount function in the real implementation; in
// tests we just want to capture the React node so we can render it.
jest.mock('../../../../../../src/plugins/opensearch_dashboards_react/public', () => ({
  toMountPoint: (node: React.ReactNode) => node,
}));

// `observabilityAlertingID` — small constant; pin its value so we can
// assert against it.
jest.mock('../../../../common/constants/shared', () => ({
  observabilityAlertingID: 'observability-alerting',
}));

import { showMonitorCreatedToast, navigateToRuleInAlarmsPage } from '../toast_helpers';

beforeEach(() => {
  mockNavigateToApp.mockReset();
  mockAddSuccess.mockReset();
});

describe('showMonitorCreatedToast', () => {
  it('emits an addSuccess toast with the canonical title and a long lifetime', () => {
    showMonitorCreatedToast({ monitorName: 'my-monitor', dsId: 'ds-1' });

    expect(mockAddSuccess).toHaveBeenCalledTimes(1);
    const arg = mockAddSuccess.mock.calls[0][0];
    expect(arg.title).toBe('Alert rule created');
    // Long enough that a user reading from another tab still has a chance
    // to click "View rule" — anything under ~6s would feel rushed.
    expect(arg.toastLifeTimeMs).toBeGreaterThanOrEqual(8000);
  });

  it('text body contains a clickable "View rule" link that navigates to the Rules tab', () => {
    showMonitorCreatedToast({ monitorName: 'my-monitor', dsId: 'ds-1' });

    const arg = mockAddSuccess.mock.calls[0][0];
    // toMountPoint mock just passes the React node through. Render it and
    // click the link to exercise the deep-link handler.
    const { getByTestId } = render(<>{arg.text}</>);
    const link = getByTestId('alertManagerToastViewRule');
    fireEvent.click(link);

    expect(mockNavigateToApp).toHaveBeenCalledTimes(1);
    const [appId, opts] = mockNavigateToApp.mock.calls[0];
    expect(appId).toBe('observability-alerting');
    expect(opts.path).toContain('#/rules?');
    expect(opts.path).toContain('q=my-monitor');
    expect(opts.path).toContain('ds=ds-1');
  });

  it('URL-encodes monitor names with special characters', () => {
    showMonitorCreatedToast({ monitorName: 'name with spaces & symbols', dsId: 'ds-with-dash' });
    const arg = mockAddSuccess.mock.calls[0][0];
    const { getByTestId } = render(<>{arg.text}</>);
    fireEvent.click(getByTestId('alertManagerToastViewRule'));
    const [, opts] = mockNavigateToApp.mock.calls[0];
    // Spaces become `+` (URLSearchParams default); ampersand is encoded
    // so it doesn't break the param boundary.
    expect(opts.path).toContain('q=name+with+spaces+%26+symbols');
    expect(opts.path).toContain('ds=ds-with-dash');
  });

  it('no-ops gracefully when the toasts service is unavailable', () => {
    // Re-mock coreRefs without `toasts` for this test only.
    jest.isolateModules(() => {
      jest.doMock('../../../framework/core_refs', () => ({ coreRefs: {} }));
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { showMonitorCreatedToast: localShow } = require('../toast_helpers');
      // Should not throw.
      expect(() => localShow({ monitorName: 'x', dsId: 'y' })).not.toThrow();
    });
  });
});

describe('navigateToRuleInAlarmsPage', () => {
  it('builds a #/rules deep link with q + ds query params', () => {
    navigateToRuleInAlarmsPage('alpha', 'ds-42');
    const [appId, opts] = mockNavigateToApp.mock.calls[0];
    expect(appId).toBe('observability-alerting');
    expect(opts.path).toBe('#/rules?q=alpha&ds=ds-42');
  });

  it('dispatches a hashchange event so the alarms-page hash listener wakes', () => {
    const spy = jest.spyOn(window, 'dispatchEvent');
    navigateToRuleInAlarmsPage('beta', 'ds-1');
    // The spy intercepts every dispatch — find the hashchange one.
    const hashChangeCalls = spy.mock.calls.filter((c) => c[0]?.type === 'hashchange');
    expect(hashChangeCalls.length).toBeGreaterThan(0);
    spy.mockRestore();
  });
});
