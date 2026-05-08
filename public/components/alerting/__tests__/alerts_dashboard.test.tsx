/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from '@testing-library/react';

jest.mock('echarts', () => ({
  init: jest.fn(() => ({
    setOption: jest.fn(),
    resize: jest.fn(),
    dispose: jest.fn(),
  })),
  graphic: { LinearGradient: jest.fn() },
}));

global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
  unobserve: jest.fn(),
}));

import { AlertsDashboard } from '../alerts_dashboard';
import type { UnifiedAlertSummary, Datasource } from '../../../../common/types/alerting';

const sampleAlert: UnifiedAlertSummary = {
  id: 'a-1',
  datasourceId: 'ds-1',
  datasourceType: 'opensearch',
  name: 'HighCPU',
  state: 'active',
  severity: 'critical',
  startTime: new Date().toISOString(),
  lastUpdated: new Date().toISOString(),
  labels: {},
  annotations: {},
};

const sampleDs: Datasource = {
  id: 'ds-1',
  name: 'Local',
  type: 'opensearch',
  url: '',
  enabled: true,
};

const baseProps = {
  alerts: [] as UnifiedAlertSummary[],
  datasources: [sampleDs],
  loading: false,
  onViewDetail: jest.fn(),
  onAcknowledge: jest.fn(),
  selectedDsIds: ['ds-1'],
  onDatasourceChange: jest.fn(),
  maxDatasources: 5,
  onDatasourceCapReached: jest.fn(),
};

describe('AlertsDashboard', () => {
  it('renders empty state when no alerts', () => {
    const { getByText } = render(<AlertsDashboard {...baseProps} />);
    expect(getByText('No Active Alerts')).toBeInTheDocument();
  });

  it('renders alert table when alerts provided', () => {
    const { getByText } = render(<AlertsDashboard {...baseProps} alerts={[sampleAlert]} />);
    expect(getByText('HighCPU')).toBeInTheDocument();
  });
});
