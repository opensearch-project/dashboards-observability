/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

jest.mock('../../../framework/core_refs', () => ({
  coreRefs: {
    http: { basePath: { get: jest.fn().mockReturnValue('') } },
    toasts: { addWarning: jest.fn() },
  },
}));

jest.mock('../../../../common/utils/set_nav_bread_crumbs', () => ({
  setNavBreadCrumbs: jest.fn(),
}));

jest.mock('../../../../../../src/plugins/opensearch_dashboards_react/public', () => ({
  toMountPoint: jest.fn((node: unknown) => node),
}));

jest.mock('../../common/toast', () => ({
  useToast: () => ({ setToast: jest.fn() }),
}));

// Mock `useAlerts` — this is the hook AlarmsPage consumes for Alerts-tab data.
// The mock captures its last-seen arguments so tests can assert on the
// hydrated picker state / refresh-token propagation.
const mockUseAlerts = jest.fn();
jest.mock('../hooks/use_alerts', () => ({
  useAlerts: (args: unknown) => mockUseAlerts(args),
}));

// Capture AlertsDashboard props so we can assert `startTime` / `endTime` /
// `startMs` / `endMs` / `truncated` / `fallbackHints` are forwarded.
const mockDashboard = jest.fn();
jest.mock('../alerts_dashboard', () => ({
  AlertsDashboard: (props: unknown) => {
    mockDashboard(props);
    return <div data-test-subj="alerts-dashboard" />;
  },
}));
jest.mock('../monitors_table', () => ({
  MonitorsTable: () => <div data-test-subj="monitors-table" />,
}));
jest.mock('../notification_routing_panel', () => ({
  NotificationRoutingPanel: () => <div data-test-subj="routing-panel" />,
}));
jest.mock('../create_monitor', () => ({ CreateMonitor: () => null }));
jest.mock('../create_logs_monitor', () => ({ CreateLogsMonitor: () => null }));
jest.mock('../create_metrics_monitor', () => ({ CreateMetricsMonitor: () => null }));
jest.mock('../alert_detail_flyout', () => ({ AlertDetailFlyout: () => null }));

import { AlarmsPage } from '../alarms_page';
import type { Datasource } from '../../../../common/types/alerting';

const defaultProps = {
  datasources: [] as Datasource[],
  datasourcesLoading: false,
  defaultDatasources: [] as string[],
  maxDatasources: 5,
};

const emptyHookResult = {
  data: null,
  isLoading: false,
  error: null,
  refetch: jest.fn(),
};

beforeEach(() => {
  mockUseAlerts.mockReset();
  mockUseAlerts.mockReturnValue(emptyHookResult);
  mockDashboard.mockClear();
  try {
    window.sessionStorage.clear();
  } catch (_e) {
    /* no-op */
  }
});

describe('AlarmsPage', () => {
  it('renders tabs and defaults to Alerts tab', async () => {
    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    expect(screen.getByTestId('alerts-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('alertManager-tabs-alerts')).toBeInTheDocument();
    expect(screen.getByTestId('alertManager-tabs-rules')).toBeInTheDocument();
    expect(screen.getByTestId('alertManager-tabs-routing')).toBeInTheDocument();
  });

  it('switches to Rules tab on click', async () => {
    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    fireEvent.click(screen.getByTestId('alertManager-tabs-rules'));
    expect(screen.getByTestId('monitors-table')).toBeInTheDocument();
  });

  it('renders the time-range bar (picker + refresh) only on the Alerts tab', async () => {
    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    expect(screen.getByTestId('alertManager-timeRangeBar')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('alertManager-tabs-rules'));
    expect(screen.queryByTestId('alertManager-timeRangeBar')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('alertManager-tabs-routing'));
    expect(screen.queryByTestId('alertManager-timeRangeBar')).not.toBeInTheDocument();
  });

  it('defaults startTime=now-24h / endTime=now when sessionStorage is empty', async () => {
    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    const last = mockUseAlerts.mock.calls[mockUseAlerts.mock.calls.length - 1][0];
    expect(last.startTime).toBe('now-24h');
    expect(last.endTime).toBe('now');
    expect(last.refreshToken).toBe(0);
  });

  it('hydrates startTime / endTime from sessionStorage on mount', async () => {
    window.sessionStorage.setItem('AlertManagerStartTime', 'now-24h');
    window.sessionStorage.setItem('AlertManagerEndTime', 'now-5m');

    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    const last = mockUseAlerts.mock.calls[mockUseAlerts.mock.calls.length - 1][0];
    expect(last.startTime).toBe('now-24h');
    expect(last.endTime).toBe('now-5m');
  });

  it('clicking refresh increments the refreshToken passed to useAlerts', async () => {
    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    const before = mockUseAlerts.mock.calls[mockUseAlerts.mock.calls.length - 1][0].refreshToken;

    // The built-in EuiSuperDatePicker refresh button (showUpdateButton=true default)
    const refreshBtn = screen.getByTestId('superDatePickerApplyTimeButton');
    fireEvent.click(refreshBtn);

    const after = mockUseAlerts.mock.calls[mockUseAlerts.mock.calls.length - 1][0].refreshToken;
    expect(after).toBe(before + 1);
  });

  it('does not render a separate refresh button outside the picker', async () => {
    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    expect(screen.queryByTestId('alertManager-refreshButton')).not.toBeInTheDocument();
  });

  it('forwards resolved startMs / endMs as numbers to AlertsDashboard', async () => {
    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    const last = mockDashboard.mock.calls[mockDashboard.mock.calls.length - 1][0];
    expect(typeof last.startMs).toBe('number');
    expect(typeof last.endMs).toBe('number');
    expect(last.endMs).toBeGreaterThan(last.startMs);
  });

  it('forwards `truncated` from hook data.datasourceStatus to AlertsDashboard', async () => {
    mockUseAlerts.mockReturnValue({
      ...emptyHookResult,
      data: {
        results: [],
        datasourceStatus: [
          {
            datasourceId: 'ds-1',
            datasourceName: 'Local',
            datasourceType: 'opensearch',
            status: 'success',
            data: [],
            durationMs: 10,
            truncated: true,
          },
        ],
        totalDatasources: 1,
        completedDatasources: 1,
        fetchedAt: '2026-01-01T00:00:00Z',
      },
    });

    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    const last = mockDashboard.mock.calls[mockDashboard.mock.calls.length - 1][0];
    expect(last.truncated).toBe(true);
  });

  it('forwards `fallbackHints` built from datasourceStatus entries with a fallback marker', async () => {
    mockUseAlerts.mockReturnValue({
      ...emptyHookResult,
      data: {
        results: [],
        datasourceStatus: [
          {
            datasourceId: 'p-1',
            datasourceName: 'prom-prod',
            datasourceType: 'prometheus',
            status: 'success',
            data: [],
            durationMs: 10,
            fallback: 'prometheus-alerts-current-only',
          },
          {
            datasourceId: 'os-1',
            datasourceName: 'os-prod',
            datasourceType: 'opensearch',
            status: 'success',
            data: [],
            durationMs: 10,
          },
        ],
        totalDatasources: 2,
        completedDatasources: 2,
        fetchedAt: '2026-01-01T00:00:00Z',
      },
    });

    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    const last = mockDashboard.mock.calls[mockDashboard.mock.calls.length - 1][0];
    expect(last.fallbackHints).toEqual([
      { datasourceName: 'prom-prod', fallback: 'prometheus-alerts-current-only' },
    ]);
  });

  it('passes selectedDsIds, startTime, endTime, refreshToken together to useAlerts', async () => {
    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    const last = mockUseAlerts.mock.calls[mockUseAlerts.mock.calls.length - 1][0];
    expect(last).toEqual(
      expect.objectContaining({
        dsIds: expect.any(Array),
        startTime: expect.any(String),
        endTime: expect.any(String),
        refreshToken: expect.any(Number),
      })
    );
  });

  it('does not crash when sessionStorage contains a malformed date-math expression; heals to defaults', async () => {
    // Corrupted value — parseDateMathMs would throw on this. The guarded
    // useMemo catches and substitutes the default range, AND an effect
    // heals the component state + sessionStorage back to defaults so the
    // hook stops forwarding garbage to the backend (which would otherwise
    // reject it with a 400 on every refetch).
    window.sessionStorage.setItem('AlertManagerStartTime', 'totally-broken-expr');
    window.sessionStorage.setItem('AlertManagerEndTime', 'also-broken');

    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });

    // The page still mounted.
    expect(screen.getByTestId('alerts-dashboard')).toBeInTheDocument();

    // The dashboard received numeric (valid) startMs/endMs derived from
    // the fallback defaults.
    const lastDashboard = mockDashboard.mock.calls[mockDashboard.mock.calls.length - 1][0];
    expect(typeof lastDashboard.startMs).toBe('number');
    expect(typeof lastDashboard.endMs).toBe('number');
    expect(Number.isFinite(lastDashboard.startMs)).toBe(true);
    expect(Number.isFinite(lastDashboard.endMs)).toBe(true);
    expect(lastDashboard.endMs).toBeGreaterThan(lastDashboard.startMs);

    // Healing: the hook's most recent call should see the default
    // strings, not the corrupted ones. Without this, the backend route
    // would keep rejecting the request with a 400.
    const lastHookCall = mockUseAlerts.mock.calls[mockUseAlerts.mock.calls.length - 1][0];
    expect(lastHookCall.startTime).toBe('now-24h');
    expect(lastHookCall.endTime).toBe('now');

    // sessionStorage has also been healed so a reload starts clean.
    expect(window.sessionStorage.getItem('AlertManagerStartTime')).toBe('now-24h');
    expect(window.sessionStorage.getItem('AlertManagerEndTime')).toBe('now');
  });
});
