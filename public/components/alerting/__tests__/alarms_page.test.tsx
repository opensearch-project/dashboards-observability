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
jest.mock('../notification_routing_panel', () => ({
  NotificationRoutingPanel: () => <div data-test-subj="routingPanel" />,
}));
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
jest.mock('../alert_detail_flyout', () => ({ AlertDetailFlyout: () => null }));

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

const emptyRulesHookResult = {
  rules: [],
  rulesTotal: 0,
  isLoading: false,
  error: null,
  warnings: [],
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

  it('surfaces partial-success datasource errors as a toast + facet error indicator', async () => {
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

    // Page-level toast fires — replaces the banner strip.
    const singleTitleCall = mockSetToast.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('Could not connect to')
    );
    expect(singleTitleCall).toBeDefined();
    expect(singleTitleCall![1]).toBe('warning');

    // AlertsDashboard receives the per-datasource error map, keyed by DS name.
    // The indicator message is framed with "Could not connect" (matching the
    // toast) and still carries the underlying error text.
    const last = mockDashboard.mock.calls[mockDashboard.mock.calls.length - 1][0];
    expect(last.datasourceErrorMap.Local).toMatch(/^Could not connect\./);
    expect(last.datasourceErrorMap.Local).toContain('AD unavailable');
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
