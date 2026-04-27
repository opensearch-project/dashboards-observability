/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { NotificationRoutingPanel } from '../notification_routing_panel';
import { AlarmsApiClient } from '../services/alarms_client';
import { Datasource } from '../../../../common/types/alerting/types';

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

const makeApiClient = (cfg = mockConfig) =>
  (({ getAlertmanagerConfig: jest.fn().mockResolvedValue(cfg) } as unknown) as AlarmsApiClient);

const promDs = ({
  id: '1',
  name: 'prom1',
  type: 'prometheus',
  directQueryName: 'prom1',
} as unknown) as Datasource;

describe('NotificationRoutingPanel', () => {
  it('renders route tree and receivers after loading', async () => {
    render(<NotificationRoutingPanel apiClient={makeApiClient()} datasources={[promDs]} />);
    await waitFor(() => expect(screen.getByText('Route Tree')).toBeInTheDocument());
    expect(screen.getAllByText('default').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Receivers/)).toBeInTheDocument();
  });

  it('shows error callout when fetch fails', async () => {
    const client = ({
      getAlertmanagerConfig: jest.fn().mockRejectedValue(new Error('timeout')),
    } as unknown) as AlarmsApiClient;
    render(<NotificationRoutingPanel apiClient={client} datasources={[promDs]} />);
    await waitFor(() => expect(screen.getByText('timeout')).toBeInTheDocument());
    expect(screen.getByText(/Error loading Alertmanager config/)).toBeInTheDocument();
  });
});
