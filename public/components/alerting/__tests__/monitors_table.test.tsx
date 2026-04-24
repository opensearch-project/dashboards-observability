/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// Stub flyout to avoid pulling in its dependency tree
jest.mock('../monitor_detail_flyout', () => ({
  MonitorDetailFlyout: () => <div data-test-subj="monitor-flyout" />,
}));

import { MonitorsTable } from '../monitors_table';
import { Datasource } from '../../../../common/types/alerting/types';
import { AlarmsApiClient } from '../services/alarms_client';

const sampleRule = (overrides = {}) => ({
  id: 'r1',
  name: 'HighCPU',
  status: 'active' as const,
  severity: 'critical' as const,
  monitorType: 'metric' as const,
  healthStatus: 'healthy' as const,
  datasourceId: 'ds-1',
  datasourceType: 'prometheus',
  query: 'rate(cpu[5m]) > 0.9',
  labels: { team: 'infra' },
  annotations: {},
  createdBy: 'admin',
  createdAt: '2026-01-01T00:00:00Z',
  lastModified: '2026-01-01T00:00:00Z',
  notificationDestinations: [],
  ...overrides,
});

const defaultProps = {
  rules: [sampleRule()],
  datasources: ([{ id: 'ds-1', name: 'prom1', type: 'prometheus' }] as unknown) as Datasource[],
  loading: false,
  apiClient: ({} as unknown) as AlarmsApiClient,
  onDelete: jest.fn(),
  selectedDsIds: ['ds-1'],
  onDatasourceChange: jest.fn(),
  maxDatasources: 5,
  onDatasourceCapReached: jest.fn(),
};

describe('MonitorsTable', () => {
  it('renders the table with a rule row', () => {
    render(<MonitorsTable {...defaultProps} />);
    expect(screen.getByText('HighCPU')).toBeInTheDocument();
    expect(screen.getByText(/monitors/)).toBeInTheDocument();
  });

  it('selects a row checkbox', () => {
    render(<MonitorsTable {...defaultProps} />);
    const checkbox = screen.getByLabelText('Select HighCPU');
    fireEvent.click(checkbox);
    // After selecting, the Delete button should appear
    expect(screen.getByText(/Delete/)).toBeInTheDocument();
  });
});
