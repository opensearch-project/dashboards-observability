/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';

jest.mock('echarts', () => ({
  init: jest.fn(() => ({
    setOption: jest.fn(),
    resize: jest.fn(),
    dispose: jest.fn(),
  })),
}));

global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
  unobserve: jest.fn(),
}));

// MonitorDetailFlyout instantiates AlertingOpenSearchService internally
// via `useMemo(() => new AlertingOpenSearchService(), [])` and calls
// `getRuleDetail(dsId, ruleId)` on mount. Mock the class so every instance
// shares one `getRuleDetail` spy the tests can drive per-case: resolve `null`
// (the default — flyout falls back to the summary), resolve a full detail
// (exercises the structured bucket view), or reject (exercises the
// detail-unavailable / suppressed-error-banner branches).
const mockGetRuleDetail = jest.fn();
jest.mock('../query_services/alerting_opensearch_service', () => ({
  AlertingOpenSearchService: jest.fn().mockImplementation(() => ({
    getRuleDetail: mockGetRuleDetail,
  })),
}));

// Stub the shared core refs so the Edit-redirect path can assert on
// `navigateToApp` without a real Core start contract.
jest.mock('../../../framework/core_refs', () => ({
  coreRefs: {
    application: { navigateToApp: jest.fn() },
  },
}));

import { MonitorDetailFlyout } from '../monitor_detail_flyout';
import { coreRefs } from '../../../framework/core_refs';
import type { UnifiedRule, UnifiedRuleSummary } from '../../../../common/types/alerting';

const navigateToApp = coreRefs.application!.navigateToApp as jest.Mock;

const mockMonitor: UnifiedRuleSummary = {
  id: 'mon-1',
  datasourceId: 'ds-1',
  datasourceType: 'opensearch',
  name: 'Test Monitor',
  enabled: true,
  severity: 'medium',
  query: '{}',
  condition: 'ctx.results[0].hits.total.value > 0',
  labels: {},
  annotations: {},
  monitorType: 'metric',
  status: 'active',
  healthStatus: 'healthy',
  createdBy: '',
  createdAt: new Date().toISOString(),
  lastModified: new Date().toISOString(),
  notificationDestinations: [],
  evaluationInterval: '1m',
  pendingPeriod: '5m',
};

describe('MonitorDetailFlyout', () => {
  beforeEach(() => {
    // Default: detail fetch resolves null so the flyout renders from the
    // summary props (what the base render tests expect). Structured-view and
    // error-path tests override this with mockResolvedValue / mockRejectedValue.
    mockGetRuleDetail.mockReset();
    mockGetRuleDetail.mockResolvedValue(null);
    // The hook's catch path logs via console.error; silence it so the
    // rejection tests don't spam the runner output.
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore?.();
  });

  it('renders flyout with monitor name', () => {
    const { getByText } = render(
      <MonitorDetailFlyout
        monitor={mockMonitor}
        onClose={jest.fn()}
        onDelete={jest.fn()}
        onClone={jest.fn()}
      />
    );
    expect(getByText('Test Monitor')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    const { getByLabelText } = render(
      <MonitorDetailFlyout
        monitor={mockMonitor}
        onClose={onClose}
        onDelete={jest.fn()}
        onClone={jest.fn()}
      />
    );
    fireEvent.click(getByLabelText('Close this dialog'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders the Condition Preview accordion for non-PPL monitors', async () => {
    const { queryByText } = render(
      <MonitorDetailFlyout
        monitor={mockMonitor}
        onClose={jest.fn()}
        onDelete={jest.fn()}
        onClone={jest.fn()}
      />
    );
    // Body is gated on the detail-fetch promise; flush the queue so the
    // accordion list renders.
    await act(async () => {
      await Promise.resolve();
    });
    expect(queryByText('Condition Preview')).not.toBeNull();
  });

  it('hides the Condition Preview accordion for PPL monitors', async () => {
    // The server-side preview pipeline has no PPL branch, so the
    // accordion would otherwise render a permanent "no data" state for
    // every PPL monitor. Hide until a PPL preview ships.
    const pplMonitor: UnifiedRuleSummary = { ...mockMonitor, monitorType: 'ppl' };
    const { queryByText } = render(
      <MonitorDetailFlyout
        monitor={pplMonitor}
        onClose={jest.fn()}
        onDelete={jest.fn()}
        onClone={jest.fn()}
      />
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(queryByText('Condition Preview')).toBeNull();
  });

  // ==========================================================================
  // Composite (workflow) monitors — the safety-relevant branches. A composite
  // can't be safely cloned/deleted or edited through the monitor APIs used
  // here, so those actions MUST stay gated; a regression here risks workflow
  // corruption.
  // ==========================================================================
  const compositeMonitor: UnifiedRuleSummary = {
    ...mockMonitor,
    id: 'composite-1',
    name: 'Composite Monitor',
    monitorType: 'composite',
    labels: { monitor_kind: 'composite', composite_delegates: 'mon-a,mon-b' },
  };

  it('disables Edit / Clone / Delete / Enable for a pending optimistic rule', async () => {
    const onClone = jest.fn();
    const onDelete = jest.fn();
    const onEdit = jest.fn();
    // ppl/metric OS monitor would normally be editable + toggleable in place;
    // the synthetic new- id + pending status must gate every mutating action.
    const pendingMonitor: UnifiedRuleSummary = {
      ...mockMonitor,
      id: 'new-1-0',
      status: 'pending',
      monitorType: 'ppl',
    };
    const { getByText, queryByTestId } = render(
      <MonitorDetailFlyout
        monitor={pendingMonitor}
        onClose={jest.fn()}
        onDelete={onDelete}
        onClone={onClone}
        onEdit={onEdit}
        onToggleEnabled={jest.fn()}
      />
    );
    await act(async () => {
      await Promise.resolve();
    });

    const editBtn = getByText('Edit').closest('button');
    const cloneBtn = getByText('Clone').closest('button');
    const deleteBtn = getByText('Delete').closest('button');
    expect(editBtn).toBeDisabled();
    expect(cloneBtn).toBeDisabled();
    expect(deleteBtn).toBeDisabled();
    // Enable/Disable footer button is disabled (no active toggle control).
    expect(getByText('Disable rule').closest('button')).toBeDisabled();
    expect(queryByTestId('alertManagerMonitorDetailToggleEnabled')).toBeNull();
    // Not the clickable classic-edit redirect either.
    expect(queryByTestId('alertManagerMonitorDetailEditRedirect')).toBeNull();

    fireEvent.click(editBtn!);
    fireEvent.click(cloneBtn!);
    fireEvent.click(deleteBtn!);
    expect(onEdit).not.toHaveBeenCalled();
    expect(onClone).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('renders composite monitors with the member list and gates Clone/Delete', async () => {
    // Composite detail 404s on the monitors endpoint by design — reject so we
    // also assert the error banner is suppressed for composites.
    mockGetRuleDetail.mockRejectedValue(new Error('workflow not found on monitors endpoint'));
    const onClone = jest.fn();
    const onDelete = jest.fn();
    const { getByText, queryByText, queryByTestId } = render(
      <MonitorDetailFlyout
        monitor={compositeMonitor}
        onClose={jest.fn()}
        onDelete={onDelete}
        onClone={onClone}
        onEdit={jest.fn()}
      />
    );
    await act(async () => {
      await Promise.resolve();
    });

    // "Associated monitors" section titled + member ids listed in order.
    expect(getByText('Associated monitors')).toBeInTheDocument();
    expect(getByText('mon-a')).toBeInTheDocument();
    expect(getByText('mon-b')).toBeInTheDocument();

    // Clone/Delete are disabled and inert — the gating that protects the
    // workflow. `.closest('button')` reaches the actual control behind the
    // button label span.
    const cloneBtn = getByText('Clone').closest('button');
    const deleteBtn = getByText('Delete').closest('button');
    expect(cloneBtn).toBeDisabled();
    expect(deleteBtn).toBeDisabled();
    fireEvent.click(cloneBtn!);
    fireEvent.click(deleteBtn!);
    expect(onClone).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();

    // Edit isn't in-place for composites (only ppl/metric are), but #2823 routes
    // OpenSearch monitors to the classic experience rather than disabling Edit —
    // so it's the clickable redirect variant, not a dead button.
    expect(queryByTestId('alertManagerMonitorDetailEditRedirect')).not.toBeNull();

    // The detail 404 is expected for composites, so no error banner and no
    // threshold/pending/preview noise.
    expect(queryByTestId('alertManagerMonitorDetailLoadError')).toBeNull();
    expect(queryByText('Condition Preview')).toBeNull();
    expect(queryByText('Pending Period')).toBeNull();
    expect(queryByText('Threshold')).toBeNull();
  });

  // ==========================================================================
  // Bucket-level monitors — structured view derived from the raw monitor body.
  // ==========================================================================
  it('renders a bucket-level monitor as a structured view (indices, group-by, condition, query toggle)', async () => {
    const bucketMonitor: UnifiedRuleSummary = {
      ...mockMonitor,
      id: 'bucket-1',
      name: 'Bucket Monitor',
      monitorType: 'metric',
      condition: 'params._count > 5',
      query: JSON.stringify({ aggregations: {} }),
      labels: { monitor_kind: 'bucket' },
    };
    const rawDetail = {
      ...bucketMonitor,
      alertHistory: [],
      conditionPreviewData: [],
      raw: {
        id: 'bucket-1',
        type: 'monitor',
        monitor_type: 'bucket_level_monitor',
        inputs: [
          {
            search: {
              indices: ['logs-app-*'],
              query: {
                aggregations: {
                  by_service: { terms: { field: 'service.name' } },
                },
              },
            },
          },
        ],
      },
    } as unknown as UnifiedRule;
    mockGetRuleDetail.mockResolvedValue(rawDetail);

    const { getByText } = render(
      <MonitorDetailFlyout
        monitor={bucketMonitor}
        onClose={jest.fn()}
        onDelete={jest.fn()}
        onClone={jest.fn()}
      />
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(getByText('Target indices:')).toBeInTheDocument();
    expect(getByText('logs-app-*')).toBeInTheDocument();
    // Group-by field extracted from the aggregation's terms.field, shown as a badge.
    expect(getByText('service.name')).toBeInTheDocument();
    expect(getByText('Per-bucket condition')).toBeInTheDocument();
    // Raw aggregation query is tucked behind a toggle rather than dumped inline.
    expect(getByText('Show aggregation query')).toBeInTheDocument();
  });

  // ==========================================================================
  // Structured kinds whose detail fetch fails: show a plain "unavailable" note
  // instead of rendering the abbreviated summary string as malformed JSON.
  // ==========================================================================
  it('shows a plain unavailable note when a structured kind fails to load detail', async () => {
    mockGetRuleDetail.mockRejectedValue(new Error('detail fetch failed'));
    const clusterMonitor: UnifiedRuleSummary = {
      ...mockMonitor,
      id: 'cluster-1',
      name: 'Cluster Metrics Monitor',
      query: 'GET _cluster/health', // abbreviated, non-JSON summary string
      labels: { monitor_kind: 'cluster_metrics' },
    };
    const { getByText } = render(
      <MonitorDetailFlyout
        monitor={clusterMonitor}
        onClose={jest.fn()}
        onDelete={jest.fn()}
        onClone={jest.fn()}
      />
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(getByText('Detailed configuration is unavailable for this rule.')).toBeInTheDocument();
  });

  describe('Edit redirect to the classic experience', () => {
    // Non-PPL / non-metric OpenSearch monitor types can't be edited in this
    // flyout yet, so Edit deep-links to the classic alerting app instead of
    // being disabled.
    const logMonitor: UnifiedRuleSummary = {
      ...mockMonitor,
      monitorType: 'log',
      datasourceId: 'ds-1',
      labels: { monitor_type: 'query_level_monitor' },
    };

    beforeEach(() => {
      navigateToApp.mockClear();
    });

    it('confirms, then deep-links to the classic edit route with id, type, and MDS dataSourceId', () => {
      const { getByTestId, getByText } = render(
        <MonitorDetailFlyout
          monitor={logMonitor}
          onClose={jest.fn()}
          onDelete={jest.fn()}
          onClone={jest.fn()}
        />
      );

      // The redirect variant of Edit is clickable (not disabled) and opens a
      // heads-up confirmation before navigating.
      fireEvent.click(getByTestId('alertManagerMonitorDetailEditRedirect'));
      expect(navigateToApp).not.toHaveBeenCalled();

      fireEvent.click(getByText('Continue to classic experience'));
      expect(navigateToApp).toHaveBeenCalledWith('monitors', {
        path: '#/monitors/mon-1?action=edit-monitor&monitorType=query_level_monitor&dataSourceId=ds-1',
      });
    });

    it('does not navigate when the confirmation is cancelled', () => {
      const { getByTestId, getByText } = render(
        <MonitorDetailFlyout
          monitor={logMonitor}
          onClose={jest.fn()}
          onDelete={jest.fn()}
          onClone={jest.fn()}
        />
      );
      fireEvent.click(getByTestId('alertManagerMonitorDetailEditRedirect'));
      fireEvent.click(getByText('Cancel'));
      expect(navigateToApp).not.toHaveBeenCalled();
    });

    it('maps cluster-metrics monitors to the cluster_metrics_monitor type', () => {
      const clusterMonitor: UnifiedRuleSummary = {
        ...logMonitor,
        monitorType: 'cluster_metrics',
        // Cluster-metrics monitors are stored as query_level_monitor; only
        // monitor_kind distinguishes them.
        labels: { monitor_kind: 'cluster_metrics', monitor_type: 'query_level_monitor' },
      };
      const { getByTestId, getByText } = render(
        <MonitorDetailFlyout
          monitor={clusterMonitor}
          onClose={jest.fn()}
          onDelete={jest.fn()}
          onClone={jest.fn()}
        />
      );
      fireEvent.click(getByTestId('alertManagerMonitorDetailEditRedirect'));
      fireEvent.click(getByText('Continue to classic experience'));
      expect(navigateToApp).toHaveBeenCalledWith('monitors', {
        path: '#/monitors/mon-1?action=edit-monitor&monitorType=cluster_metrics_monitor&dataSourceId=ds-1',
      });
    });

    it('sends an empty dataSourceId for local-cluster monitors', () => {
      const localMonitor: UnifiedRuleSummary = {
        ...logMonitor,
        datasourceId: 'local-cluster',
        labels: { monitor_type: 'doc_level_monitor' },
      };
      const { getByTestId, getByText } = render(
        <MonitorDetailFlyout
          monitor={localMonitor}
          onClose={jest.fn()}
          onDelete={jest.fn()}
          onClone={jest.fn()}
        />
      );
      fireEvent.click(getByTestId('alertManagerMonitorDetailEditRedirect'));
      fireEvent.click(getByText('Continue to classic experience'));
      expect(navigateToApp).toHaveBeenCalledWith('monitors', {
        path: '#/monitors/mon-1?action=edit-monitor&monitorType=doc_level_monitor&dataSourceId=',
      });
    });
  });
});
