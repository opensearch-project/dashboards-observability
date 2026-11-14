/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { I18nProvider } from '@osd/i18n/react';

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

// Capture `setToast` calls so tests can assert the page-level toasts fire
// on the same conditions the removed banner strip used to render for.
const mockSetToast = jest.fn();
jest.mock('../../common/toast', () => ({
  useToast: () => ({ setToast: mockSetToast }),
}));

// Mock `useAlerts` — this is the hook AlarmsPage consumes for Alerts-tab data.
// The mock captures its last-seen arguments so tests can assert on the
// hydrated picker state / refresh-token propagation.
const mockUseAlerts = jest.fn();
jest.mock('../hooks/use_alerts', () => ({
  useAlerts: (args: unknown) => mockUseAlerts(args),
}));

const mockUseRulesData = jest.fn();
jest.mock('../hooks/use_rules_data', () => ({
  useRulesData: (args: unknown) => mockUseRulesData(args),
}));

// Capture AlertsDashboard props so we can assert `startTime` / `endTime` /
// `startMs` / `endMs` / `datasourceErrorMap` are forwarded.
const mockDashboard = jest.fn();
jest.mock('../alerts_dashboard', () => ({
  AlertsDashboard: (props: unknown) => {
    mockDashboard(props);
    return <div data-test-subj="alertsDashboard" />;
  },
}));

// Capture MonitorsTable props so we can invoke onClone in tests.
const mockMonitorsTable = jest.fn();
jest.mock('../monitors_table', () => ({
  MonitorsTable: (props: unknown) => {
    mockMonitorsTable(props);
    return <div data-test-subj="monitorsTable" />;
  },
}));
// The routing stub puts a control in the tab row, like the real panel's
// source selector, so the tab-row slot can be asserted.
jest.mock('../notification_routing_panel', () => {
  const { TabRowActions } = jest.requireActual('../tab_row_actions');
  return {
    NotificationRoutingPanel: () => (
      <div data-test-subj="routingPanel">
        <TabRowActions>
          <button data-test-subj="routingSourceStub">Source</button>
        </TabRowActions>
      </div>
    ),
  };
});
jest.mock('../create_monitor', () => ({ CreateMonitor: () => null }));
// The Alert Manager "Create metrics rule" path renders CreateMetricsMonitor;
// capture its props so we can assert the group-scoped duplicate-name checker.
const mockMetricsFlyout = jest.fn();
jest.mock('../create_metrics_monitor', () => ({
  CreateMetricsMonitor: (props: unknown) => {
    mockMetricsFlyout(props);
    return null;
  },
}));
jest.mock('../create_monitor/edit_monitor', () => ({ EditMonitor: () => null }));
const mockAlertFlyout = jest.fn();
jest.mock('../alert_detail_flyout', () => ({
  AlertDetailFlyout: (props: unknown) => {
    mockAlertFlyout(props);
    return null;
  },
}));

const mockGetRuleDetail = jest.fn();
jest.mock('../query_services/alerting_opensearch_service', () => ({
  AlertingOpenSearchService: jest.fn().mockImplementation(() => ({
    getRuleDetail: mockGetRuleDetail,
  })),
}));

const mockCreateMonitor = jest.fn();
const mockDeleteMonitor = jest.fn();
const mockDeleteDetector = jest.fn();
const mockStopDetector = jest.fn();
const mockDeleteForecaster = jest.fn();
const mockStopForecaster = jest.fn();
jest.mock('../hooks/use_monitor_mutations', () => ({
  useMonitorMutations: () => ({
    createMonitor: mockCreateMonitor,
    deleteMonitor: mockDeleteMonitor,
    deleteDetector: mockDeleteDetector,
    stopDetector: mockStopDetector,
    deleteForecaster: mockDeleteForecaster,
    stopForecaster: mockStopForecaster,
    acknowledgeAlert: jest.fn(),
  }),
}));

import { AlarmsPage, parseAlarmsHashRoute } from '../alarms_page';
import type { CloudWatchTargets, Datasource } from '../../../../common/types/alerting';
import { cloudWatchDatasourcesFor } from '../../../../common/services/alerting/cloudwatch_datasource_id';
import { coreRefs } from '../../../framework/core_refs';
import { ALERT_MANAGER_SELECTED_DS_STORAGE_KEY } from '../../../../common/constants/alerting_settings';

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

const emptyRulesHookResult = {
  rules: [],
  rulesTotal: 0,
  isLoading: false,
  error: null,
  warnings: [],
  truncatedDatasourceNames: [],
  setRules: jest.fn(),
  setRulesTotal: jest.fn(),
  refetch: jest.fn(),
};

beforeEach(() => {
  mockUseAlerts.mockReset();
  mockUseAlerts.mockReturnValue(emptyHookResult);
  mockUseRulesData.mockReset();
  mockUseRulesData.mockReturnValue(emptyRulesHookResult);
  mockDashboard.mockClear();
  mockMonitorsTable.mockClear();
  mockSetToast.mockClear();
  mockGetRuleDetail.mockReset();
  mockCreateMonitor.mockReset();
  mockDeleteMonitor.mockReset();
  mockDeleteDetector.mockReset();
  mockStopDetector.mockReset();
  mockDeleteForecaster.mockReset();
  mockStopForecaster.mockReset();
  mockDeleteDetector.mockResolvedValue({ ok: true });
  mockStopDetector.mockResolvedValue({ ok: true });
  mockDeleteForecaster.mockResolvedValue({ ok: true });
  mockStopForecaster.mockResolvedValue({ ok: true });
  try {
    window.sessionStorage.clear();
  } catch (_e) {
    /* no-op */
  }
  // Reset the hash between tests — `AlarmsPage` reads `window.location.hash`
  // on mount (via `parseAlarmsHashRoute`) and will land on whatever tab a
  // prior test's interaction left in the URL. Without this reset, the
  // sequence "click Rules tab in test A → mount in test B" makes test B
  // start on the Rules tab, so `<AlertsDashboard>` never renders and
  // `mockDashboard.mock.calls` stays empty.
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
});

describe('AlarmsPage', () => {
  it('renders tabs and defaults to Alerts tab', async () => {
    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    expect(screen.getByTestId('alertsDashboard')).toBeInTheDocument();
    expect(screen.getByTestId('alertManagerTabs-alerts')).toBeInTheDocument();
    expect(screen.getByTestId('alertManagerTabs-rules')).toBeInTheDocument();
    expect(screen.getByTestId('alertManagerTabs-routing')).toBeInTheDocument();
  });

  it('switches to Rules tab on click', async () => {
    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    fireEvent.click(screen.getByTestId('alertManagerTabs-rules'));
    expect(screen.getByTestId('monitorsTable')).toBeInTheDocument();
  });

  it("shows the active tab's controls in the tab row without header controls", async () => {
    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    const slot = screen.getByTestId('alertManagerTabActions');
    expect(slot).toBeEmptyDOMElement();

    fireEvent.click(screen.getByTestId('alertManagerTabs-routing'));
    expect(within(slot).getByTestId('routingSourceStub')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('routingPanel')).queryByTestId('routingSourceStub')
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('alertManagerTabs-alerts'));
    expect(slot).toBeEmptyDOMElement();
  });

  it("puts the active tab's controls on the page title row when the header supports it", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { coreRefs: headerRefs } = require('../../../framework/core_refs');
    // A HeaderControl stand-in that renders the right-side controls in place.
    headerRefs.chrome = { navGroup: { getNavGroupEnabled: () => true } };
    headerRefs.application = { setAppRightControls: jest.fn() };
    headerRefs.navigation = {
      ui: {
        HeaderControl: ({
          controls,
        }: {
          controls: Array<{ renderComponent?: React.ReactNode }>;
        }) => (
          <div data-test-subj="headerRightControls">
            {controls.map((c, i) => (
              <React.Fragment key={i}>{c.renderComponent}</React.Fragment>
            ))}
          </div>
        ),
      },
    };
    try {
      await act(async () => {
        render(<AlarmsPage {...defaultProps} />);
      });
      const header = screen.getByTestId('headerRightControls');
      const slot = within(header).getByTestId('alertManagerTabActions');
      // The slot moved out of the tab row.
      expect(screen.getAllByTestId('alertManagerTabActions')).toHaveLength(1);

      fireEvent.click(screen.getByTestId('alertManagerTabs-routing'));
      expect(within(slot).getByTestId('routingSourceStub')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('alertManagerTabs-alerts'));
      expect(slot).toBeEmptyDOMElement();
    } finally {
      delete headerRefs.chrome;
      delete headerRefs.application;
      delete headerRefs.navigation;
    }
  });

  it('links the Alerts breadcrumb back to the Alerts tab from a sub-tab', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { setNavBreadCrumbs } = require('../../../../common/utils/set_nav_bread_crumbs');
    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    // On the Alerts tab the trail is just the current page.
    expect((setNavBreadCrumbs as jest.Mock).mock.calls.slice(-1)[0][1]).toEqual([
      { text: 'Alerts' },
    ]);

    fireEvent.click(screen.getByTestId('alertManagerTabs-rules'));
    const trail = (setNavBreadCrumbs as jest.Mock).mock.calls.slice(-1)[0][1];
    expect(trail.map((c: { text: string }) => c.text)).toEqual(['Alerts', 'Rules']);
    expect(trail[0].href).toBe('#/alerts');
    expect(trail[1].href).toBeUndefined();

    // Cmd/Ctrl/Shift/Alt and middle clicks are left to the browser (open in a
    // new tab via the href): no preventDefault, no tab switch.
    for (const modifier of [
      { metaKey: true },
      { ctrlKey: true },
      { shiftKey: true },
      { altKey: true },
    ]) {
      const keep = jest.fn();
      await act(async () => {
        trail[0].onClick({ preventDefault: keep, button: 0, ...modifier });
      });
      expect(keep).not.toHaveBeenCalled();
    }
    const middle = jest.fn();
    await act(async () => {
      trail[0].onClick({ preventDefault: middle, button: 1 });
    });
    expect(middle).not.toHaveBeenCalled();
    expect(screen.getByTestId('monitorsTable')).toBeInTheDocument();

    // A plain left click switches tabs in place.
    const preventDefault = jest.fn();
    await act(async () => {
      trail[0].onClick({ preventDefault, button: 0 });
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(screen.getByTestId('alertsDashboard')).toBeInTheDocument();
  });

  it('scopes the duplicate-name check to the rule group', async () => {
    mockMetricsFlyout.mockClear();
    mockUseRulesData.mockReturnValue({
      ...emptyRulesHookResult,
      rules: [
        { id: 'r1', name: 'HighLatency', datasourceId: 'prom-1', group: 'payments' },
        { id: 'r2', name: 'OtherRule', datasourceId: 'prom-1', group: 'payments' },
      ] as unknown as never,
    });
    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    // MonitorsTable only renders on the Rules tab — switch to it first.
    await act(async () => {
      fireEvent.click(screen.getByTestId('alertManagerTabs-rules'));
    });
    // Open the metrics create flyout via the MonitorsTable's onCreateMonitor callback.
    const tableProps = mockMonitorsTable.mock.calls[mockMonitorsTable.mock.calls.length - 1][0];
    await act(async () => {
      tableProps.onCreateMonitor('metrics');
    });
    const flyoutProps = mockMetricsFlyout.mock.calls[mockMetricsFlyout.mock.calls.length - 1][0];
    const isNameTaken = flyoutProps.isNameTaken as (n: string, d: string, g?: string) => boolean;

    // Same name in the SAME group → duplicate.
    expect(isNameTaken('HighLatency', 'prom-1', 'payments')).toBe(true);
    // Same name in a DIFFERENT group → allowed (valid distinct rule).
    expect(isNameTaken('HighLatency', 'prom-1', 'checkout')).toBe(false);
    // No group supplied → datasource-wide (back-compat for PPL monitors).
    expect(isNameTaken('HighLatency', 'prom-1')).toBe(true);
  });

  it('refetches rules when switching into the Rules tab and forwards a Refresh handler', async () => {
    // Fresh spy so we count only calls made after mount (the mount fetch is
    // owned by useRulesData, which is mocked out here).
    (emptyRulesHookResult.refetch as jest.Mock).mockClear();
    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('alertManagerTabs-rules'));
    });
    // Switching INTO the Rules tab triggers a refetch so a rule created
    // elsewhere (e.g. the Metrics page flyout) appears without a manual reload.
    expect(emptyRulesHookResult.refetch).toHaveBeenCalled();
    // MonitorsTable receives a manual Refresh handler + spinner flag.
    const last = mockMonitorsTable.mock.calls[mockMonitorsTable.mock.calls.length - 1][0];
    expect(typeof last.onRefresh).toBe('function');
    expect('refreshing' in last).toBe(true);
  });

  it('forwards picker state + handlers to the AlertsDashboard (picker now lives in the timeline panel)', async () => {
    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    const last = mockDashboard.mock.calls[mockDashboard.mock.calls.length - 1][0];
    expect(last.pickerStart).toBe('now-24h');
    expect(last.pickerEnd).toBe('now');
    expect(typeof last.onTimeChange).toBe('function');
    expect(typeof last.onRefresh).toBe('function');
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

  it('invoking onRefresh on the dashboard increments the refreshToken passed to useAlerts', async () => {
    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    const before = mockUseAlerts.mock.calls[mockUseAlerts.mock.calls.length - 1][0].refreshToken;

    // The picker is now rendered inside AlertsDashboard (mocked here), so we
    // exercise the same path by invoking the forwarded callback directly.
    const dashboardProps = mockDashboard.mock.calls[mockDashboard.mock.calls.length - 1][0];
    await act(async () => {
      dashboardProps.onRefresh({ start: 'now-24h', end: 'now' });
    });

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

  it('fires a "Search incomplete" toast when a datasource reports a truncated result', async () => {
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
    const truncatedToast = mockSetToast.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('Search incomplete')
    );
    expect(truncatedToast).toBeDefined();
    expect(truncatedToast![1]).toBe('warning');
  });

  it('surfaces partial-success datasource errors in the facet indicator without a toast', async () => {
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
            error: 'Failed to fetch anomaly results: AD unavailable',
          },
        ],
        totalDatasources: 1,
        completedDatasources: 1,
        fetchedAt: '2026-01-01T00:00:00Z',
      },
    });

    await act(async () => {
      render(
        <AlarmsPage
          {...defaultProps}
          datasources={[
            {
              id: 'ds-1',
              name: 'Local',
              type: 'opensearch',
              connection: 'cluster',
              enabled: true,
            } as Datasource,
          ]}
        />
      );
    });

    // A per-datasource failure raises no toast: it isn't a response to a user action.
    const toastText = JSON.stringify(mockSetToast.mock.calls);
    expect(toastText).not.toContain('Could not connect');
    expect(toastText).not.toContain('AD unavailable');

    // AlertsDashboard receives the per-datasource error map, keyed by DS name.
    // The indicator message is framed with "Could not connect" and still
    // carries the underlying error text.
    const last = mockDashboard.mock.calls[mockDashboard.mock.calls.length - 1][0];
    expect(last.datasourceErrorMap.Local).toMatch(/^Could not connect\./);
    expect(last.datasourceErrorMap.Local).toContain('AD unavailable');
  });

  it('matches a status named by its id to the datasource row and raises no toast for it', async () => {
    const id = 'cloudwatch_eu-west-1_prod';
    mockUseAlerts.mockReturnValue({
      ...emptyHookResult,
      data: {
        results: [],
        datasourceStatus: [
          {
            datasourceId: id,
            // The server names a datasource it couldn't resolve by its id.
            datasourceName: id,
            datasourceType: 'cloudwatch',
            status: 'error',
            data: [],
            durationMs: 0,
            error: 'CloudWatch datasource is not available',
          },
        ],
        totalDatasources: 1,
        completedDatasources: 0,
        fetchedAt: '2026-01-01T00:00:00Z',
      },
    });
    const rowName = 'CloudWatch · Prod · eu-west-1';
    await act(async () => {
      render(
        <AlarmsPage
          {...defaultProps}
          datasources={[
            {
              id,
              name: rowName,
              type: 'cloudwatch',
              url: 'cloudwatch',
              enabled: true,
            } as Datasource,
          ]}
        />
      );
    });
    const last = mockDashboard.mock.calls[mockDashboard.mock.calls.length - 1][0];
    expect(Object.keys(last.datasourceErrorMap)).toEqual([rowName]);
    // CloudWatch access-denied / not-available failures don't pop up a toast.
    expect(mockSetToast).not.toHaveBeenCalled();
  });

  it('shows no CloudWatch experimental banner when a CloudWatch datasource is present', async () => {
    window.sessionStorage.removeItem('AlertManagerCloudWatchBannerDismissed');
    await act(async () => {
      render(
        <AlarmsPage
          {...defaultProps}
          datasources={[
            {
              id: 'cloudwatch',
              name: 'CloudWatch',
              type: 'cloudwatch',
              url: 'cloudwatch',
              enabled: true,
            } as Datasource,
          ]}
        />
      );
    });
    expect(screen.queryByTestId('cloudWatchExperimentalCallout')).not.toBeInTheDocument();
    expect(screen.queryByText(/experimental/i)).not.toBeInTheDocument();
  });

  it('raises no toast when several datasources fail', async () => {
    mockUseAlerts.mockReturnValue({
      ...emptyHookResult,
      data: {
        results: [],
        datasourceStatus: ['ds-1', 'ds-2'].map((dsId) => ({
          datasourceId: dsId,
          datasourceName: dsId,
          datasourceType: 'opensearch',
          status: 'error',
          data: [],
          durationMs: 0,
          error: 'ENOTFOUND',
        })),
        totalDatasources: 2,
        completedDatasources: 0,
        fetchedAt: '2026-01-01T00:00:00Z',
      },
    });
    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    const toastText = JSON.stringify(mockSetToast.mock.calls);
    expect(toastText).not.toContain('could not be reached');
    expect(toastText).not.toContain('Could not connect');
  });

  describe('every selected datasource unreachable', () => {
    const lastProps = (mock: jest.Mock) => mock.mock.calls[mock.mock.calls.length - 1][0];
    const osDatasources = ['ds-1', 'ds-2'].map((id) => ({
      id,
      name: `cluster-${id}`,
      type: 'opensearch',
      url: '',
      enabled: true,
    })) as Datasource[];
    const failedStatus = (dsIds: string[]) => ({
      ...emptyHookResult,
      data: {
        results: [],
        datasourceStatus: dsIds.map((dsId) => ({
          datasourceId: dsId,
          datasourceName: `cluster-${dsId}`,
          datasourceType: 'opensearch',
          status: 'error',
          data: [],
          durationMs: 0,
          error: 'ENOTFOUND',
        })),
        totalDatasources: dsIds.length,
        completedDatasources: 0,
        fetchedAt: '2026-01-01T00:00:00Z',
      },
    });
    const refs = coreRefs as unknown as { http?: { get: jest.Mock } };
    let savedHttp: unknown;
    beforeEach(() => {
      savedHttp = refs.http;
      // Every alerting probe fails, as it does when the clusters can't be reached.
      refs.http = { ...(refs.http || {}), get: jest.fn().mockRejectedValue(new Error('down')) };
    });
    afterEach(() => {
      refs.http = savedHttp as { get: jest.Mock };
    });

    it('passes each failed datasource to both tabs and holds back the plugin-missing toast', async () => {
      mockUseAlerts.mockReturnValue(failedStatus(['ds-1', 'ds-2']));
      await act(async () => {
        render(
          <AlarmsPage
            {...defaultProps}
            datasources={osDatasources}
            defaultDatasources={['ds-1', 'ds-2']}
          />
        );
      });
      const unreachable = lastProps(mockDashboard).unreachableDatasources;
      expect(unreachable.map((u: { name: string }) => u.name)).toEqual([
        'cluster-ds-1',
        'cluster-ds-2',
      ]);
      expect(unreachable[0].error).toContain('ENOTFOUND');
      expect(JSON.stringify(mockSetToast.mock.calls)).not.toContain('Alerting plugin not detected');
      await act(async () => {
        fireEvent.click(screen.getByTestId('alertManagerTabs-rules'));
      });
      expect(lastProps(mockMonitorsTable).unreachableDatasources).toHaveLength(2);
    });

    it('passes none when one selected datasource answered', async () => {
      mockUseAlerts.mockReturnValue(failedStatus(['ds-1']));
      await act(async () => {
        render(
          <AlarmsPage
            {...defaultProps}
            datasources={osDatasources}
            defaultDatasources={['ds-1', 'ds-2']}
          />
        );
      });
      expect(lastProps(mockDashboard).unreachableDatasources).toEqual([]);
    });
  });
  it('fires a "Showing current alerts only" toast when a datasource reports a legacy-fallback', async () => {
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
    const fallbackToast = mockSetToast.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('Showing current alerts only')
    );
    expect(fallbackToast).toBeDefined();
    expect(fallbackToast![1]).toBe('warning');
    expect(String(fallbackToast![2])).toContain('prom-prod');
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
    expect(screen.getByTestId('alertsDashboard')).toBeInTheDocument();

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

  it('handleCloneRule calls getRuleDetail and createMonitor without throwing', async () => {
    const fakeRaw = {
      id: 'mon-1',
      name: 'Test Monitor',
      type: 'monitor',
      last_update_time: 123,
      enabled_time: 456,
      schema_version: 1,
      owner: 'alerting',
      data_sources: {},
      triggers: [
        {
          ppl_trigger: {
            id: 'trig-1',
            name: 'High errors',
            actions: [{ id: 'act-1', name: 'notify' }],
          },
        },
      ],
    };
    mockGetRuleDetail.mockResolvedValue({ raw: fakeRaw });
    mockCreateMonitor.mockResolvedValue({ id: 'new-mon-1' });

    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });

    // Switch to Rules tab so MonitorsTable renders
    fireEvent.click(screen.getByTestId('alertManagerTabs-rules'));

    // Get the onClone prop passed to MonitorsTable
    const tableProps = mockMonitorsTable.mock.calls[mockMonitorsTable.mock.calls.length - 1][0] as {
      onClone: (monitor: unknown) => Promise<void>;
    };

    expect(tableProps.onClone).toBeDefined();

    // Invoke onClone — this would throw ReferenceError before the fix
    await act(async () => {
      await tableProps.onClone({
        id: 'mon-1',
        name: 'Test Monitor',
        datasourceId: 'ds-1',
        definitionType: 'monitor',
      });
    });

    expect(mockGetRuleDetail).toHaveBeenCalledWith('ds-1', 'mon-1', 'monitor');
    expect(mockCreateMonitor).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Test Monitor (Copy)' }),
      'ds-1'
    );
  });

  it('clones a cluster-metrics monitor with a valid cluster_metrics_monitor type', async () => {
    // `detail.raw` is now the faithful upstream document (getOSRuleDetail no
    // longer returns the lossy `mapMonitor` projection), so it carries the real
    // `cluster_metrics_monitor` type. Re-POSTing the normalized
    // `query_level_monitor` used to store the clone as a query-level monitor
    // with a `uri` input, and the classic editor then crashed on edit (read
    // `inputs[0].search.indices`) → blank page. The clone must preserve the
    // real type verbatim.
    const fakeRaw = {
      id: 'mon-cm',
      name: 'Cluster Health',
      type: 'monitor',
      monitor_type: 'cluster_metrics_monitor',
      last_update_time: 123,
      schema_version: 1,
      inputs: [{ uri: { api_type: 'CLUSTER_HEALTH', path: '/_cluster/health' } }],
      triggers: [{ query_level_trigger: { id: 'trig-1', name: 'Red', actions: [] } }],
    };
    mockGetRuleDetail.mockResolvedValue({ raw: fakeRaw });
    mockCreateMonitor.mockResolvedValue({ id: 'new-mon-cm' });

    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    fireEvent.click(screen.getByTestId('alertManagerTabs-rules'));

    const tableProps = mockMonitorsTable.mock.calls[mockMonitorsTable.mock.calls.length - 1][0] as {
      onClone: (monitor: unknown) => Promise<void>;
    };
    await act(async () => {
      await tableProps.onClone({
        id: 'mon-cm',
        name: 'Cluster Health',
        datasourceId: 'ds-1',
        definitionType: 'monitor',
      });
    });

    expect(mockCreateMonitor).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Cluster Health (Copy)',
        monitor_type: 'cluster_metrics_monitor',
      }),
      'ds-1'
    );
  });

  it('clones a bucket-level monitor preserving its wrapped trigger + type', async () => {
    // Regression: `mapMonitor` used to FLATTEN the `bucket_level_trigger`
    // wrapper (dropping `parent_bucket_path` / `buckets_path`) and expose that
    // in `raw`, so the clone re-POSTed a bare trigger → the backend rejected it
    // with "Incompatible trigger for monitor type [bucket_level_monitor]".
    // Now `raw` is faithful: the wrapper + its condition survive, and the clone
    // only strips the trigger id (and any nested action ids).
    const fakeRaw = {
      id: 'mon-bkt',
      name: 'Bucket Mon',
      type: 'monitor',
      monitor_type: 'bucket_level_monitor',
      inputs: [{ search: { indices: ['logs-*'], query: {} } }],
      triggers: [
        {
          bucket_level_trigger: {
            id: 'trig-bkt',
            name: 'b1',
            severity: '1',
            condition: {
              parent_bucket_path: 'composite_agg',
              buckets_path: { _count: '_count' },
              script: { source: 'params._count > 0', lang: 'painless' },
            },
            actions: [{ id: 'act-bkt', name: 'notify' }],
          },
        },
      ],
    };
    mockGetRuleDetail.mockResolvedValue({ raw: fakeRaw });
    mockCreateMonitor.mockResolvedValue({ id: 'new-mon-bkt' });

    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    fireEvent.click(screen.getByTestId('alertManagerTabs-rules'));

    const tableProps = mockMonitorsTable.mock.calls[mockMonitorsTable.mock.calls.length - 1][0] as {
      onClone: (monitor: unknown) => Promise<void>;
    };
    await act(async () => {
      await tableProps.onClone({
        id: 'mon-bkt',
        name: 'Bucket Mon',
        datasourceId: 'ds-1',
        definitionType: 'monitor',
      });
    });

    const payload = mockCreateMonitor.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.monitor_type).toBe('bucket_level_monitor');
    expect(payload.name).toBe('Bucket Mon (Copy)');
    const trigger = (payload.triggers as Array<Record<string, unknown>>)[0];
    const inner = trigger.bucket_level_trigger as Record<string, unknown>;
    // Wrapper + bucket-specific condition preserved; ids stripped.
    expect(inner).toBeDefined();
    expect(inner.id).toBeUndefined();
    expect((inner.condition as Record<string, unknown>).parent_bucket_path).toBe('composite_agg');
    expect((inner.actions as Array<Record<string, unknown>>)[0].id).toBeUndefined();
  });

  it('strips server-owned / response-derived fields from the clone payload', async () => {
    // The faithful upstream doc carries identity/audit/ownership/principal
    // fields and GET-only enrichments that must NOT be re-POSTed on create.
    const fakeRaw = {
      id: 'mon-strip',
      name: 'Strip Mon',
      type: 'monitor',
      monitor_type: 'query_level_monitor',
      inputs: [{ search: { indices: ['logs-*'], query: {} } }],
      triggers: [{ query_level_trigger: { id: 't', name: 't', actions: [] } }],
      // fields that must be dropped:
      version: 7,
      last_update_time: 123,
      enabled_time: 456,
      schema_version: 5,
      owner: 'alerting',
      user: { name: 'creator', backend_roles: ['admin'], roles: ['all_access'] },
      data_sources: { tenant: 't1' },
      item_type: 'query_level_monitor',
      associated_workflows: [{ id: 'wf1' }],
      associatedCompositeMonitorCnt: 2,
      last_run_context: { lastFired: 0 },
    };
    mockGetRuleDetail.mockResolvedValue({ raw: fakeRaw });
    mockCreateMonitor.mockResolvedValue({ id: 'new-strip' });

    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    fireEvent.click(screen.getByTestId('alertManagerTabs-rules'));
    const tableProps = mockMonitorsTable.mock.calls[mockMonitorsTable.mock.calls.length - 1][0] as {
      onClone: (monitor: unknown) => Promise<void>;
    };
    await act(async () => {
      await tableProps.onClone({
        id: 'mon-strip',
        name: 'Strip Mon',
        datasourceId: 'ds-1',
        definitionType: 'monitor',
      });
    });

    const payload = mockCreateMonitor.mock.calls[0][0] as Record<string, unknown>;
    for (const stripped of [
      'id',
      'version',
      'last_update_time',
      'enabled_time',
      'schema_version',
      'owner',
      'user',
      'data_sources',
      'item_type',
      'associated_workflows',
      'associatedCompositeMonitorCnt',
      'last_run_context',
    ]) {
      expect(payload[stripped]).toBeUndefined();
    }
    // …while legitimate create fields still round-trip.
    expect(payload.monitor_type).toBe('query_level_monitor');
    expect(payload.type).toBe('monitor');
    // Clones start disabled regardless of the source's enabled state.
    expect(payload.enabled).toBe(false);
  });

  it('clones a doc-level monitor preserving the document_level_trigger + doc-only fields', async () => {
    const fakeRaw = {
      id: 'mon-doc',
      name: 'Doc Mon',
      type: 'monitor',
      monitor_type: 'doc_level_monitor',
      // doc-level create-time fields that MUST survive in ...rest:
      delete_query_index_in_every_run: true,
      should_create_single_alert_for_findings: false,
      inputs: [
        {
          doc_level_input: {
            description: '',
            indices: ['logs-*'],
            queries: [{ id: 'q1', name: 'q1', query: 'x:1' }],
          },
        },
      ],
      triggers: [
        {
          document_level_trigger: {
            id: 'trig-doc',
            name: 'd1',
            severity: '2',
            condition: { script: { source: 'true', lang: 'painless' } },
            actions: [{ id: 'act-doc', name: 'notify' }],
          },
        },
      ],
    };
    mockGetRuleDetail.mockResolvedValue({ raw: fakeRaw });
    mockCreateMonitor.mockResolvedValue({ id: 'new-doc' });

    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    fireEvent.click(screen.getByTestId('alertManagerTabs-rules'));
    const tableProps = mockMonitorsTable.mock.calls[mockMonitorsTable.mock.calls.length - 1][0] as {
      onClone: (monitor: unknown) => Promise<void>;
    };
    await act(async () => {
      await tableProps.onClone({
        id: 'mon-doc',
        name: 'Doc Mon',
        datasourceId: 'ds-1',
        definitionType: 'monitor',
      });
    });

    const payload = mockCreateMonitor.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.monitor_type).toBe('doc_level_monitor');
    // doc-only create fields preserved
    expect(payload.delete_query_index_in_every_run).toBe(true);
    expect(payload.should_create_single_alert_for_findings).toBe(false);
    const inner = (payload.triggers as Array<Record<string, unknown>>)[0]
      .document_level_trigger as Record<string, unknown>;
    expect(inner).toBeDefined();
    expect(inner.id).toBeUndefined();
    expect((inner.actions as Array<Record<string, unknown>>)[0].id).toBeUndefined();
  });

  it('gives distinct names to two clones fired before the list refetches (in-flight dedup)', async () => {
    // Regression for the double-clone race: the first clone is not yet in
    // `rules` (no refetch has landed), so the dedup must remember the name it
    // just issued and hand the second clone `(Copy 2)`.
    const fakeRaw = {
      id: 'mon-race',
      name: 'Race Mon',
      type: 'monitor',
      monitor_type: 'query_level_monitor',
      inputs: [{ search: { indices: ['logs-*'], query: {} } }],
      triggers: [{ query_level_trigger: { id: 't', name: 't', actions: [] } }],
    };
    mockGetRuleDetail.mockResolvedValue({ raw: fakeRaw });
    mockCreateMonitor.mockResolvedValue({ id: 'new-race' });

    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    fireEvent.click(screen.getByTestId('alertManagerTabs-rules'));
    const tableProps = mockMonitorsTable.mock.calls[mockMonitorsTable.mock.calls.length - 1][0] as {
      onClone: (monitor: unknown) => Promise<void>;
    };
    const rule = {
      id: 'mon-race',
      name: 'Race Mon',
      datasourceId: 'ds-1',
      definitionType: 'monitor',
    };
    await act(async () => {
      await tableProps.onClone(rule);
      await tableProps.onClone(rule);
    });

    const names = mockCreateMonitor.mock.calls.map((c) => (c[0] as Record<string, unknown>).name);
    expect(names).toEqual(['Race Mon (Copy)', 'Race Mon (Copy 2)']);
  });

  it('gives an OpenSearch clone a unique name when the copy already exists', async () => {
    // A prior clone of the same monitor already sits in the list, so the bare
    // ` (Copy)` name is taken — the next clone must fall through to ` (Copy 2)`
    // instead of producing a second identical name.
    mockUseRulesData.mockReturnValue({
      ...emptyRulesHookResult,
      rules: [
        { id: 'mon-1', name: 'Test Monitor', datasourceId: 'ds-1' },
        { id: 'mon-1-copy', name: 'Test Monitor (Copy)', datasourceId: 'ds-1' },
      ],
    });
    const fakeRaw = {
      id: 'mon-1',
      name: 'Test Monitor',
      type: 'monitor',
      monitor_type: 'query_level_monitor',
      inputs: [{ search: { indices: ['logs-*'], query: {} } }],
      triggers: [],
    };
    mockGetRuleDetail.mockResolvedValue({ raw: fakeRaw });
    mockCreateMonitor.mockResolvedValue({ id: 'new-mon-2' });

    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    fireEvent.click(screen.getByTestId('alertManagerTabs-rules'));

    const tableProps = mockMonitorsTable.mock.calls[mockMonitorsTable.mock.calls.length - 1][0] as {
      onClone: (monitor: unknown) => Promise<void>;
    };
    await act(async () => {
      await tableProps.onClone({
        id: 'mon-1',
        name: 'Test Monitor',
        datasourceId: 'ds-1',
        definitionType: 'monitor',
      });
    });

    expect(mockCreateMonitor).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Test Monitor (Copy 2)' }),
      'ds-1'
    );
  });

  it.each([
    {
      definitionType: 'detector',
      stop: mockStopDetector,
      remove: mockDeleteDetector,
    },
    {
      definitionType: 'forecaster',
      stop: mockStopForecaster,
      remove: mockDeleteForecaster,
    },
  ])(
    'stops a running $definitionType before deleting it',
    async ({ definitionType, stop, remove }) => {
      const resource = {
        id: `${definitionType}-1`,
        name: `Running ${definitionType}`,
        datasourceId: 'ds-1',
        datasourceType: 'opensearch',
        definitionType,
        monitorType: definitionType,
        status: 'Running',
        enabled: true,
      };
      mockUseRulesData.mockReturnValue({
        ...emptyRulesHookResult,
        rules: [resource],
        rulesTotal: 1,
      });

      await act(async () => {
        render(<AlarmsPage {...defaultProps} />);
      });
      fireEvent.click(screen.getByTestId('alertManagerTabs-rules'));
      const tableProps = mockMonitorsTable.mock.calls[
        mockMonitorsTable.mock.calls.length - 1
      ][0] as {
        onDelete: (ids: string[]) => Promise<void>;
      };

      await act(async () => {
        await tableProps.onDelete([resource.id]);
      });

      expect(stop).toHaveBeenCalledWith(resource.id, resource.datasourceId);
      expect(remove).toHaveBeenCalledWith(resource.id, resource.datasourceId);
      expect(stop.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]);
    }
  );

  // ---- URL-reflects-active-tab ---------------------------------------------
  // `handleTabClick` mirrors the active tab into `window.location.hash` so
  // reload / bookmark / back-button round-trip the user's selection. The
  // tests below cover the two important cases: a click writes the hash,
  // and clicking the already-active tab is a no-op (otherwise we'd push
  // redundant history entries).

  it('writes the active tab into window.location.hash on tab click', async () => {
    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    fireEvent.click(screen.getByTestId('alertManagerTabs-rules'));
    expect(window.location.hash).toBe('#/rules');
  });

  it('updates the hash when switching from rules → routing', async () => {
    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    fireEvent.click(screen.getByTestId('alertManagerTabs-rules'));
    fireEvent.click(screen.getByTestId('alertManagerTabs-routing'));
    expect(window.location.hash).toBe('#/routing');
  });

  it('does not push redundant history entries when clicking the active tab', async () => {
    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    fireEvent.click(screen.getByTestId('alertManagerTabs-rules'));
    const lengthAfterFirstClick = window.history.length;
    // Click the same tab again — should be a no-op (no new history entry).
    fireEvent.click(screen.getByTestId('alertManagerTabs-rules'));
    expect(window.history.length).toBe(lengthAfterFirstClick);
    expect(window.location.hash).toBe('#/rules');
  });
});

describe('AlarmsPage deep links', () => {
  const lastProps = (mock: jest.Mock) => mock.mock.calls[mock.mock.calls.length - 1][0];

  it("seeds only the linked tab's search and drops it after a tab click", async () => {
    window.history.replaceState(null, '', '#/rules?q=monitor_id%3Amon-1');
    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    expect(lastProps(mockMonitorsTable).initialSearchQuery).toBe('monitor_id:mon-1');

    // The Rules link must not leak into the Alerts tab…
    await act(async () => {
      fireEvent.click(screen.getByTestId('alertManagerTabs-alerts'));
    });
    expect(lastProps(mockDashboard).initialSearchQuery).toBeUndefined();
    expect(window.location.hash).toBe('#/alerts');

    // …or come back when the user returns to Rules.
    mockMonitorsTable.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByTestId('alertManagerTabs-rules'));
    });
    expect(lastProps(mockMonitorsTable).initialSearchQuery).toBeUndefined();
    expect(window.location.hash).toBe('#/rules');
  });

  it('re-applies a repeated link with a new key', async () => {
    window.history.replaceState(null, '', '#/rules?q=CheckoutErrors');
    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    const firstKey = lastProps(mockMonitorsTable).initialSearchQueryKey;
    await act(async () => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    const next = lastProps(mockMonitorsTable);
    expect(next.initialSearchQuery).toBe('CheckoutErrors');
    expect(next.initialSearchQueryKey).not.toBe(firstKey);
  });

  it("drops the link's query from the URL once the user edits the search", async () => {
    window.history.replaceState(null, '', '#/rules?q=monitor_id%3Amon-1&ds=ds-1');
    await act(async () => {
      render(<AlarmsPage {...defaultProps} />);
    });
    await act(async () => {
      lastProps(mockMonitorsTable).onInitialSearchQueryEdited();
    });
    // The link's datasource stays so a reload keeps it selected.
    expect(window.location.hash).toBe('#/rules?ds=ds-1');
  });

  it("tells the alert flyout whether the alert's monitor still exists", async () => {
    const datasources = [
      { id: 'ds-os', name: 'local', type: 'opensearch', url: '', enabled: true },
    ] as Datasource[];
    const alert = {
      id: 'a1',
      datasourceId: 'ds-os',
      datasourceType: 'opensearch',
      name: 'Gone — t',
      state: 'deleted',
      severity: 'high',
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      labels: { monitor_id: 'mon-gone' },
      annotations: {},
      monitorId: 'mon-gone',
    };
    mockUseRulesData.mockReturnValue({
      ...emptyRulesHookResult,
      rules: [{ id: 'mon-live', name: 'Live', datasourceId: 'ds-os' }] as unknown as never,
    });
    await act(async () => {
      render(
        <AlarmsPage {...defaultProps} datasources={datasources} defaultDatasources={['ds-os']} />
      );
    });
    // Not in the rules list: confirmed by looking the monitor up (404).
    mockGetRuleDetail.mockRejectedValue({ response: { status: 404 } });
    mockAlertFlyout.mockClear();
    await act(async () => {
      lastProps(mockDashboard).onViewDetail(alert);
    });
    expect(mockGetRuleDetail).toHaveBeenCalledWith('ds-os', 'mon-gone', 'monitor');
    expect(lastProps(mockAlertFlyout).sourceRuleStatus).toBe('missing');

    mockAlertFlyout.mockClear();
    await act(async () => {
      lastProps(mockDashboard).onViewDetail({
        ...alert,
        id: 'a2',
        monitorId: 'mon-live',
        labels: { monitor_id: 'mon-live' },
      });
    });
    expect(lastProps(mockAlertFlyout).sourceRuleStatus).toBe('exists');
  });

  it('looks a monitor up again after the rules list refetches, catching a mid-session delete', async () => {
    const datasources = [
      { id: 'ds-os', name: 'local', type: 'opensearch', url: '', enabled: true },
    ] as Datasource[];
    const alert = {
      id: 'a-1',
      datasourceId: 'ds-os',
      datasourceType: 'opensearch',
      name: 'Mon — t',
      state: 'active',
      severity: 'high',
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      labels: { monitor_id: 'mon-1' },
      annotations: {},
      monitorId: 'mon-1',
    };
    const backgroundRefetch = jest.fn();
    mockUseRulesData.mockReturnValue({ ...emptyRulesHookResult, rules: [], backgroundRefetch });
    mockGetRuleDetail.mockResolvedValue({ id: 'mon-1' });
    let view: ReturnType<typeof render> | undefined;
    await act(async () => {
      view = render(
        <AlarmsPage {...defaultProps} datasources={datasources} defaultDatasources={['ds-os']} />
      );
    });
    await act(async () => {
      lastProps(mockDashboard).onViewDetail(alert);
    });
    expect(lastProps(mockAlertFlyout).sourceRuleStatus).toBe('exists');
    expect(backgroundRefetch).toHaveBeenCalledTimes(1);

    // The monitor is deleted; the rules list refetches (still without it).
    mockGetRuleDetail.mockRejectedValue({ response: { status: 404 } });
    mockUseRulesData.mockReturnValue({ ...emptyRulesHookResult, rules: [], backgroundRefetch });
    await act(async () => {
      view!.rerender(
        <AlarmsPage {...defaultProps} datasources={datasources} defaultDatasources={['ds-os']} />
      );
    });
    expect(mockGetRuleDetail).toHaveBeenCalledTimes(2);
    expect(lastProps(mockAlertFlyout).sourceRuleStatus).toBe('missing');
    // The list refresh after a hit happens once per monitor — no refetch loop.
    expect(backgroundRefetch).toHaveBeenCalledTimes(1);
  });

  it("doesn't call a monitor deleted until the lookup confirms it", async () => {
    const datasources = [
      { id: 'ds-os', name: 'local', type: 'opensearch', url: '', enabled: true },
    ] as Datasource[];
    const alertFor = (monitorId: string) => ({
      id: `a-${monitorId}`,
      datasourceId: 'ds-os',
      datasourceType: 'opensearch',
      name: 'New — t',
      state: 'active',
      severity: 'high',
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      labels: { monitor_id: monitorId },
      annotations: {},
      monitorId,
    });
    const backgroundRefetch = jest.fn();
    mockUseRulesData.mockReturnValue({ ...emptyRulesHookResult, backgroundRefetch });
    await act(async () => {
      render(
        <AlarmsPage {...defaultProps} datasources={datasources} defaultDatasources={['ds-os']} />
      );
    });

    // A monitor created after the rules list loaded: the lookup finds it.
    let resolveLookup: (v: unknown) => void = () => {};
    mockGetRuleDetail.mockReturnValue(new Promise((r) => (resolveLookup = r)));
    await act(async () => {
      lastProps(mockDashboard).onViewDetail(alertFor('mon-new'));
    });
    // Pending → unknown, never "missing".
    expect(lastProps(mockAlertFlyout).sourceRuleStatus).toBe('unknown');
    await act(async () => {
      resolveLookup({ id: 'mon-new' });
    });
    expect(lastProps(mockAlertFlyout).sourceRuleStatus).toBe('exists');
    expect(backgroundRefetch).toHaveBeenCalled();

    // A lookup that fails for another reason stays unknown.
    mockGetRuleDetail.mockRejectedValue({ response: { status: 500 } });
    await act(async () => {
      lastProps(mockDashboard).onViewDetail(alertFor('mon-flaky'));
    });
    expect(lastProps(mockAlertFlyout).sourceRuleStatus).toBe('unknown');
  });
});

describe('parseAlarmsHashRoute', () => {
  it('returns empty when the hash is missing', () => {
    expect(parseAlarmsHashRoute('')).toEqual({});
    expect(parseAlarmsHashRoute('#')).toEqual({});
  });

  it('parses #/rules into the rules tab', () => {
    expect(parseAlarmsHashRoute('#/rules')).toEqual({ tab: 'rules' });
  });

  it('parses #/rules?q=foo into the rules tab + query', () => {
    expect(parseAlarmsHashRoute('#/rules?q=foo')).toEqual({ tab: 'rules', q: 'foo' });
  });

  it('decodes URL-encoded queries (label:value syntax for slo_id deep links)', () => {
    const labelQuery = 'slo_id:b4ea5ed2-12bb-44ce-bb20-74dc3e464328';
    expect(parseAlarmsHashRoute(`#/rules?q=${encodeURIComponent(labelQuery)}`)).toEqual({
      tab: 'rules',
      q: labelQuery,
    });
  });

  it('drops empty / whitespace-only q', () => {
    expect(parseAlarmsHashRoute('#/rules?q=')).toEqual({ tab: 'rules' });
    expect(parseAlarmsHashRoute('#/rules?q=%20')).toEqual({ tab: 'rules' });
  });

  it('parses the optional ds param alongside q (BUG-12 SLO deep-link)', () => {
    expect(parseAlarmsHashRoute('#/rules?q=slo_id:abc&ds=ds-prom-1')).toEqual({
      tab: 'rules',
      q: 'slo_id:abc',
      ds: 'ds-prom-1',
    });
  });

  it('parses ds without q', () => {
    expect(parseAlarmsHashRoute('#/rules?ds=ds-prom-1')).toEqual({
      tab: 'rules',
      ds: 'ds-prom-1',
    });
  });

  it('drops empty ds', () => {
    expect(parseAlarmsHashRoute('#/rules?q=slo_id:abc&ds=')).toEqual({
      tab: 'rules',
      q: 'slo_id:abc',
    });
  });

  it('falls back when the path segment is unknown', () => {
    expect(parseAlarmsHashRoute('#/something-else')).toEqual({});
  });
});

describe('AlarmsPage CloudWatch regions', () => {
  const lastProps = (mock: jest.Mock) => mock.mock.calls[mock.mock.calls.length - 1][0];
  const refs = coreRefs as unknown as {
    cloudwatchEnabled?: boolean;
    toasts: { addWarning: jest.Mock };
  };
  const targets: CloudWatchTargets = {
    regions: [
      { id: 'us-east-1', name: 'us-east-1' },
      { id: 'eu-west-1', name: 'eu-west-1' },
    ],
    defaultRegion: 'us-east-1',
    scopes: [
      { label: 'CloudWatch', relation: 'own' },
      { id: 'scope-b', label: 'Shared', relation: 'other' },
    ],
  };
  const osDs: Datasource = {
    id: 'os-1',
    name: 'Local',
    type: 'opensearch',
    url: '',
    enabled: true,
  };
  const datasources = [osDs, ...cloudWatchDatasourcesFor(targets, ['us-east-1', 'eu-west-1'])];
  const renderPage = async (props: Record<string, unknown> = {}) => {
    const onCloudWatchRegionsChange = jest.fn();
    await act(async () => {
      render(
        <AlarmsPage
          {...defaultProps}
          datasources={datasources}
          defaultDatasources={['os-1', 'cloudwatch']}
          cloudWatchTargets={targets}
          cloudWatchRegions={['us-east-1']}
          onCloudWatchRegionsChange={onCloudWatchRegionsChange}
          {...props}
        />
      );
    });
    return onCloudWatchRegionsChange;
  };

  beforeEach(() => {
    window.localStorage.clear();
    refs.cloudwatchEnabled = true;
    refs.toasts.addWarning.mockClear();
  });
  afterAll(() => {
    refs.cloudwatchEnabled = undefined;
  });

  it('passes the CloudWatch regions to both tabs', async () => {
    await renderPage();
    const cw = lastProps(mockDashboard).cloudWatch;
    expect(cw).toEqual(
      expect.objectContaining({
        regions: targets.regions,
        defaultRegion: 'us-east-1',
        selectedRegions: ['us-east-1'],
        regionCounts: expect.any(Object),
      })
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('alertManagerTabs-rules'));
    });
    expect(lastProps(mockMonitorsTable).cloudWatch).toEqual(
      expect.objectContaining({ regions: targets.regions, selectedRegions: ['us-east-1'] })
    );
  });

  it('selects an added region for the scopes that already have a selection', async () => {
    const onRegions = await renderPage();
    expect(lastProps(mockDashboard).selectedDsIds).toEqual(['os-1', 'cloudwatch']);
    await act(async () => {
      lastProps(mockDashboard).cloudWatch.onRegionsChange(['us-east-1', 'eu-west-1']);
    });
    expect(onRegions).toHaveBeenCalledWith(['us-east-1', 'eu-west-1']);
    expect(lastProps(mockDashboard).selectedDsIds).toEqual([
      'os-1',
      'cloudwatch',
      'cloudwatch_eu-west-1',
    ]);
    expect(refs.toasts.addWarning).not.toHaveBeenCalled();
  });

  it("drops a removed region's datasources from the selection", async () => {
    const onRegions = await renderPage({
      cloudWatchRegions: ['us-east-1', 'eu-west-1'],
      defaultDatasources: ['os-1', 'cloudwatch', 'cloudwatch_eu-west-1_scope-b'],
    });
    expect(lastProps(mockDashboard).selectedDsIds).toEqual([
      'os-1',
      'cloudwatch',
      'cloudwatch_eu-west-1_scope-b',
    ]);
    await act(async () => {
      lastProps(mockDashboard).cloudWatch.onRegionsChange(['us-east-1']);
    });
    expect(onRegions).toHaveBeenCalledWith(['us-east-1']);
    expect(lastProps(mockDashboard).selectedDsIds).toEqual(['os-1', 'cloudwatch']);
  });

  it('counts a CloudWatch account once toward the cap', async () => {
    // Cap 2: Local + the default account in two regions still fits.
    const onRegions = await renderPage({ maxDatasources: 2 });
    await act(async () => {
      lastProps(mockDashboard).cloudWatch.onRegionsChange(['us-east-1', 'eu-west-1']);
    });
    expect(onRegions).toHaveBeenCalledWith(['us-east-1', 'eu-west-1']);
    expect(lastProps(mockDashboard).selectedDsIds).toEqual([
      'os-1',
      'cloudwatch',
      'cloudwatch_eu-west-1',
    ]);
    expect(refs.toasts.addWarning).not.toHaveBeenCalled();
  });

  it('keeps every region of the selected accounts when clamping the default selection', async () => {
    await renderPage({
      maxDatasources: 2,
      cloudWatchRegions: ['us-east-1', 'eu-west-1'],
      defaultDatasources: [
        'os-1',
        'cloudwatch',
        'cloudwatch_eu-west-1',
        'cloudwatch_us-east-1_scope-b',
      ],
    });
    expect(lastProps(mockDashboard).selectedDsIds).toEqual([
      'os-1',
      'cloudwatch',
      'cloudwatch_eu-west-1',
    ]);
  });

  it('passes the CloudWatch regions without a Regions choice, and none with CloudWatch off', async () => {
    await renderPage({ cloudWatchTargets: undefined });
    expect(lastProps(mockDashboard).cloudWatch).toBeUndefined();
    mockDashboard.mockClear();
    // One region: the facet gets it but shows no Regions control.
    await renderPage({ cloudWatchTargets: { ...targets, regions: targets.regions.slice(0, 1) } });
    expect(lastProps(mockDashboard).cloudWatch.regions).toHaveLength(1);
    mockDashboard.mockClear();
    refs.cloudwatchEnabled = false;
    await renderPage();
    expect(lastProps(mockDashboard).cloudWatch).toBeUndefined();
  });
  it('offers a retry in the CloudWatch group when the accounts could not be read', async () => {
    const onCloudWatchRetry = jest.fn();
    await renderPage({ cloudWatchTargets: undefined, cloudWatchFailed: true, onCloudWatchRetry });
    const cw = lastProps(mockDashboard).cloudWatch;
    expect(cw).toEqual(expect.objectContaining({ failed: true, regions: [] }));
    cw.onRetry();
    expect(onCloudWatchRetry).toHaveBeenCalledTimes(1);
  });
  it('applies a datasource link once the CloudWatch accounts have loaded', async () => {
    window.localStorage.setItem(
      ALERT_MANAGER_SELECTED_DS_STORAGE_KEY,
      JSON.stringify(['cloudwatch_us-east-1_scope-b'])
    );
    window.history.replaceState(null, '', '#/alerts?ds=os-1');
    const props = {
      ...defaultProps,
      defaultDatasources: [],
      cloudWatchTargets: targets,
      cloudWatchRegions: ['us-east-1'],
      onCloudWatchRegionsChange: jest.fn(),
    };
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(<AlarmsPage {...props} datasources={[osDs]} cloudWatchLoading={true} />);
    });
    expect(lastProps(mockDashboard).selectedDsIds).toEqual([]);
    await act(async () => {
      view.rerender(<AlarmsPage {...props} datasources={datasources} cloudWatchLoading={false} />);
    });
    expect(lastProps(mockDashboard).selectedDsIds).toEqual([
      'cloudwatch_us-east-1_scope-b',
      'os-1',
    ]);
    window.history.replaceState(null, '', '#/');
  });

  it('is unchanged without the CloudWatch props', async () => {
    await act(async () => {
      render(<AlarmsPage {...defaultProps} datasources={[osDs]} />);
    });
    expect(lastProps(mockDashboard).cloudWatch).toBeUndefined();
    expect(lastProps(mockDashboard).selectedDsIds).toEqual(['os-1']);
  });

  describe('CloudWatch account error indicator', () => {
    const cwStatus = (
      failures: Array<{ id: string; category?: 'PERMISSION_DENIED' | 'RATE_LIMITED' }>
    ) => ({
      ...emptyHookResult,
      data: {
        results: [],
        datasourceStatus: failures.map(({ id, category }) => ({
          datasourceId: id,
          datasourceName: id,
          datasourceType: 'cloudwatch',
          status: 'error',
          data: [],
          durationMs: 0,
          error: category ?? 'failed',
          errorDetail: category
            ? {
                category,
                code: category === 'PERMISSION_DENIED' ? 'ACCESS_DENIED' : 'THROTTLED',
                title: category === 'PERMISSION_DENIED' ? 'Access denied' : 'Throttled',
                message: 'm',
                retryable: category !== 'PERMISSION_DENIED',
              }
            : undefined,
        })),
        totalDatasources: failures.length,
        completedDatasources: 0,
        fetchedAt: '2026-01-01T00:00:00Z',
      },
    });
    const ownUsEast = datasources.find(
      (d) => d.type === 'cloudwatch' && d.id === 'cloudwatch'
    ) as Datasource;
    const ownEuWest = datasources.find(
      (d) => d.type === 'cloudwatch' && d.region === 'eu-west-1' && !d.cloudWatchScope
    ) as Datasource;

    it('shows it when every selected region failed with a non-permission error', async () => {
      mockUseAlerts.mockReturnValue(cwStatus([{ id: ownUsEast.id, category: 'RATE_LIMITED' }]));
      await renderPage();
      expect(Object.keys(lastProps(mockDashboard).datasourceErrorMap)).toEqual([ownUsEast.name]);
    });

    it('stays quiet for a permission error', async () => {
      mockUseAlerts.mockReturnValue(
        cwStatus([{ id: ownUsEast.id, category: 'PERMISSION_DENIED' }])
      );
      await renderPage();
      expect(lastProps(mockDashboard).datasourceErrorMap).toEqual({});
    });

    it('stays quiet when only some selected regions failed', async () => {
      mockUseAlerts.mockReturnValue(cwStatus([{ id: ownUsEast.id, category: 'RATE_LIMITED' }]));
      await renderPage({
        defaultDatasources: ['os-1', ownUsEast.id, ownEuWest.id],
        cloudWatchRegions: ['us-east-1', 'eu-west-1'],
      });
      expect(lastProps(mockDashboard).selectedDsIds).toEqual(
        expect.arrayContaining([ownUsEast.id, ownEuWest.id])
      );
      expect(lastProps(mockDashboard).datasourceErrorMap).toEqual({});
    });
  });
});
describe('AlarmsPage cap toasts', () => {
  const lastProps = (mock: jest.Mock) => mock.mock.calls[mock.mock.calls.length - 1][0];
  const refs = coreRefs as unknown as {
    cloudwatchEnabled?: boolean;
    http: { basePath: { get: jest.Mock } };
    toasts: { addWarning: jest.Mock };
  };
  const targets: CloudWatchTargets = {
    regions: [
      { id: 'us-east-1', name: 'us-east-1' },
      { id: 'eu-west-1', name: 'eu-west-1' },
    ],
    defaultRegion: 'us-east-1',
    scopes: [{ label: 'CloudWatch', relation: 'own' }],
  };
  const lastToast = () =>
    refs.toasts.addWarning.mock.calls[refs.toasts.addWarning.mock.calls.length - 1][0];
  beforeEach(() => {
    refs.toasts.addWarning.mockClear();
  });
  afterEach(() => {
    refs.http.basePath.get.mockReturnValue('');
    refs.cloudwatchEnabled = undefined;
  });
  it('states the workspace limit from the setting and links to that setting in the workspace', async () => {
    refs.http.basePath.get.mockReturnValue('/osd/w/ws1');
    await act(async () => {
      render(<AlarmsPage {...defaultProps} maxDatasources={7} />);
    });
    act(() => lastProps(mockDashboard).onDatasourceCapReached());
    const toast = lastToast();
    expect(toast.title).toBe('Maximum 7 datasources can be selected');
    render(<I18nProvider>{toast.text}</I18nProvider>);
    const body = screen.getByTestId('alertManagerMaxDatasourcesSettingsLink').parentElement!;
    expect(body).toHaveTextContent(
      'The limit is 7 datasources. Clear one to add another, or change it in settings.'
    );
    const link = screen.getByTestId('alertManagerMaxDatasourcesSettingsLink');
    expect(link).toHaveTextContent(/^settings$/);
    const href = '/osd/w/ws1/app/settings/observability:alertmanagermaxdatasources';
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', href);
    expect(link).not.toHaveAttribute('target');
  });
  it('states the CloudWatch account and region bound without a settings link', async () => {
    refs.cloudwatchEnabled = true;
    await act(async () => {
      render(
        <AlarmsPage
          {...defaultProps}
          datasources={cloudWatchDatasourcesFor(targets, ['us-east-1', 'eu-west-1'])}
          defaultDatasources={['cloudwatch']}
          cloudWatchTargets={targets}
          cloudWatchRegions={['us-east-1']}
          onCloudWatchRegionsChange={jest.fn()}
        />
      );
    });
    act(() => lastProps(mockDashboard).cloudWatch.onPairCapReached());
    const toast = lastToast();
    expect(toast.text).toBe(
      'CloudWatch is limited to 20 account and region combinations. Clear an account or a region to add another.'
    );
    expect(typeof toast.text).toBe('string');
  });
});
