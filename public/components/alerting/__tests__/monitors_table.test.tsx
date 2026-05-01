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

// Phase 6b moved monitors_table.tsx → monitors_table/index.tsx;
// `../monitors_table` still resolves via TS's implicit index.tsx resolution.
import { MonitorsTable } from '../monitors_table';
import { Datasource } from '../../../../common/types/alerting';

const sampleRule = (overrides = {}) => ({
  id: 'r1',
  name: 'HighCPU',
  enabled: true,
  status: 'active' as const,
  severity: 'critical' as const,
  monitorType: 'metric' as const,
  healthStatus: 'healthy' as const,
  datasourceId: 'ds-1',
  datasourceType: 'prometheus' as const,
  query: 'rate(cpu[5m]) > 0.9',
  condition: '',
  labels: { team: 'infra' },
  annotations: {},
  createdBy: 'admin',
  createdAt: '2026-01-01T00:00:00Z',
  lastModified: '2026-01-01T00:00:00Z',
  notificationDestinations: [],
  evaluationInterval: '1m',
  pendingPeriod: '5m',
  ...overrides,
});

// Post-Phase 4: MonitorsTable no longer takes an apiClient prop — mutation
// dispatch happens inside the page via hooks. Props kept here are the
// display-and-interaction ones the component currently accepts.
const defaultProps = {
  rules: [sampleRule()],
  datasources: ([{ id: 'ds-1', name: 'prom1', type: 'prometheus' }] as unknown) as Datasource[],
  loading: false,
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
