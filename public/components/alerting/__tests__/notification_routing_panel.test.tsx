/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const mockConfig = {
  available: true,
  cluster: { status: 'ready', peers: [], peerCount: 1 },
  uptime: new Date().toISOString(),
  versionInfo: { version: '0.27.0' },
  config: {
    route: { receiver: 'default', group_by: ['alertname'], group_wait: '30s' },
    receivers: [{ name: 'default', integrations: [{ type: 'webhook', summary: 'http://hook' }] }],
    inhibitRules: [],
  },
};

// Post-Phase 4: NotificationRoutingPanel instantiates AlertmanagerAdminService
// internally via `useMemo(() => new AlertmanagerAdminService(), [])` and
// calls `getConfig(dsId)` on the selected datasource. Each test re-configures
// the mock constructor below so success/error paths can be exercised
// independently.
const mockGetConfig = jest.fn();
jest.mock('../query_services/alertmanager_admin_service', () => ({
  AlertmanagerAdminService: jest.fn().mockImplementation(() => ({
    getConfig: mockGetConfig,
  })),
}));

import { NotificationRoutingPanel } from '../notification_routing_panel';
import { Datasource } from '../../../../common/types/alerting';

const promDs = ({
  id: '1',
  name: 'prom1',
  type: 'prometheus',
  directQueryName: 'prom1',
} as unknown) as Datasource;

describe('NotificationRoutingPanel', () => {
  beforeEach(() => {
    mockGetConfig.mockReset();
  });

  it('renders route tree and receivers after loading', async () => {
    mockGetConfig.mockResolvedValue(mockConfig);
    render(<NotificationRoutingPanel datasources={[promDs]} />);
    await waitFor(() => expect(screen.getByText('Route Tree')).toBeInTheDocument());
    expect(screen.getAllByText('default').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Receivers/)).toBeInTheDocument();
  });

  it('shows error callout when fetch fails', async () => {
    mockGetConfig.mockRejectedValue(new Error('timeout'));
    render(<NotificationRoutingPanel datasources={[promDs]} />);
    await waitFor(() => expect(screen.getByText('timeout')).toBeInTheDocument());
    expect(screen.getByText(/Error loading Alertmanager config/)).toBeInTheDocument();
  });
});
