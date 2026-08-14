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
// `getRuleDetail(dsId, ruleId)` on mount. Mock the class so the
// constructor returns a stubbed instance with `getRuleDetail` resolving
// to `null` — the flyout falls back to the monitor summary in that
// case, which is what these render tests exercise.
jest.mock('../query_services/alerting_opensearch_service', () => ({
  AlertingOpenSearchService: jest.fn().mockImplementation(() => ({
    getRuleDetail: jest.fn().mockResolvedValue(null),
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
import type { UnifiedRuleSummary } from '../../../../common/types/alerting';

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
