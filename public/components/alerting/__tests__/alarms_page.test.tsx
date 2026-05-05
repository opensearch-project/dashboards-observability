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

// Stub heavy child components — use data-test-subj (project convention)
jest.mock('../alerts_dashboard', () => ({
  AlertsDashboard: () => <div data-test-subj="alerts-dashboard" />,
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

// Post-Phase 4: AlarmsPage no longer takes an apiClient prop. Data comes in
// via props (datasources, datasourcesLoading, defaultDatasources,
// maxDatasources); the page's children consume hooks internally.
const defaultProps = {
  datasources: [] as Datasource[],
  datasourcesLoading: false,
  defaultDatasources: [] as string[],
  maxDatasources: 5,
};

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
});
