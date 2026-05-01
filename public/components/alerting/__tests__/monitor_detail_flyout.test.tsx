/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react';

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

// Post-Phase 4: MonitorDetailFlyout instantiates AlertingOpenSearchService
// internally via `useMemo(() => new AlertingOpenSearchService(), [])` and
// calls `getRuleDetail(dsId, ruleId)` on mount. Mock the class so the
// constructor returns a stubbed instance with `getRuleDetail` resolving to
// `null` — the flyout falls back to the monitor summary in that case,
// which is what these render tests exercise.
jest.mock('../query_services/alerting_opensearch_service', () => ({
  AlertingOpenSearchService: jest.fn().mockImplementation(() => ({
    getRuleDetail: jest.fn().mockResolvedValue(null),
  })),
}));

import { MonitorDetailFlyout } from '../monitor_detail_flyout';
import type { UnifiedRuleSummary } from '../../../../common/types/alerting';

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
});
