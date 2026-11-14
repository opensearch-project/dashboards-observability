/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * use_alerting_page_toasts tests — the hook's whole reason to exist is
 * "fire once per transition, never on re-render." These tests exercise that
 * contract directly:
 *   - a sustained condition across many re-renders toasts exactly once
 *   - recover → recur re-fires
 *   - alerts-derived toasts are gated to the Alerts tab and fire on the
 *     later tab switch, while cross-cutting toasts fire on any tab
 */
import { renderHook } from '@testing-library/react';

const mockSetToast = jest.fn();
jest.mock('../../../common/toast', () => ({
  useToast: () => ({ setToast: mockSetToast }),
}));

import { useAlertingPageToasts, UseAlertingPageToastsParams } from '../use_alerting_page_toasts';

const base: UseAlertingPageToastsParams = {
  activeTab: 'alerts',
  alertsErrorMessage: null,
  rulesErrorMessage: null,
  alertingPluginMissing: false,
  alertingProbeLoading: false,
  alertsTruncated: false,
  fallbackHints: [],
};

// Fresh object each render so effect deps churn exactly like the real page,
// proving the ref-based dedup — not referential equality — is what suppresses
// duplicate toasts.
const props = (over: Partial<UseAlertingPageToastsParams>): UseAlertingPageToastsParams => ({
  ...base,
  fallbackHints: [],
  ...over,
});

beforeEach(() => mockSetToast.mockReset());

describe('useAlertingPageToasts — transition dedup', () => {
  it('fires a sustained alerts error exactly once across re-renders', () => {
    const { rerender } = renderHook((p: UseAlertingPageToastsParams) => useAlertingPageToasts(p), {
      initialProps: props({ alertsErrorMessage: 'boom' }),
    });
    rerender(props({ alertsErrorMessage: 'boom' }));
    rerender(props({ alertsErrorMessage: 'boom' }));

    const alertsErrorCalls = mockSetToast.mock.calls.filter((c) => c[0] === 'Error loading alerts');
    expect(alertsErrorCalls).toHaveLength(1);
    expect(alertsErrorCalls[0]).toEqual(['Error loading alerts', 'danger', 'boom']);
  });

  it('re-fires after the error clears and recurs', () => {
    const { rerender } = renderHook((p: UseAlertingPageToastsParams) => useAlertingPageToasts(p), {
      initialProps: props({ alertsErrorMessage: 'boom' }),
    });
    rerender(props({ alertsErrorMessage: null })); // recover
    rerender(props({ alertsErrorMessage: 'boom' })); // recur

    expect(mockSetToast.mock.calls.filter((c) => c[0] === 'Error loading alerts')).toHaveLength(2);
  });

  it('holds the plugin-missing toast while loading and does not re-fire it after a refresh', () => {
    const { rerender } = renderHook((p: UseAlertingPageToastsParams) => useAlertingPageToasts(p), {
      initialProps: props({ alertingPluginMissing: true, alertingProbeLoading: true }),
    });
    const pluginCalls = () =>
      mockSetToast.mock.calls.filter((c) => c[0] === 'Alerting plugin not detected');
    expect(pluginCalls()).toHaveLength(0);
    rerender(props({ alertingPluginMissing: true }));
    expect(pluginCalls()).toHaveLength(1);
    // A refresh: loading again, then settled with the same state.
    rerender(props({ alertingPluginMissing: true, alertingProbeLoading: true }));
    rerender(props({ alertingPluginMissing: true }));
    expect(pluginCalls()).toHaveLength(1);
  });
});

describe('useAlertingPageToasts — tab gating', () => {
  it('suppresses the alerts error toast on the Rules tab, then fires on switch to Alerts', () => {
    const { rerender } = renderHook((p: UseAlertingPageToastsParams) => useAlertingPageToasts(p), {
      initialProps: props({ activeTab: 'rules', alertsErrorMessage: 'boom' }),
    });
    expect(mockSetToast.mock.calls.filter((c) => c[0] === 'Error loading alerts')).toHaveLength(0);

    rerender(props({ activeTab: 'alerts', alertsErrorMessage: 'boom' }));
    expect(mockSetToast.mock.calls.filter((c) => c[0] === 'Error loading alerts')).toHaveLength(1);
  });

  it('gates the truncation toast to the Alerts tab', () => {
    const { rerender } = renderHook((p: UseAlertingPageToastsParams) => useAlertingPageToasts(p), {
      initialProps: props({ activeTab: 'rules', alertsTruncated: true }),
    });
    expect(
      mockSetToast.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].startsWith('Search incomplete')
      )
    ).toHaveLength(0);

    rerender(props({ activeTab: 'alerts', alertsTruncated: true }));
    expect(
      mockSetToast.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].startsWith('Search incomplete')
      )
    ).toHaveLength(1);
  });

  it('fires the plugin-missing and rules-error toasts regardless of active tab', () => {
    renderHook((p: UseAlertingPageToastsParams) => useAlertingPageToasts(p), {
      initialProps: props({
        activeTab: 'rules',
        alertingPluginMissing: true,
        rulesErrorMessage: 'rules boom',
      }),
    });
    expect(mockSetToast).toHaveBeenCalledWith(
      'Alerting plugin not detected',
      'warning',
      expect.any(String)
    );
    expect(mockSetToast).toHaveBeenCalledWith('Error loading data', 'danger', 'rules boom');
  });
});
