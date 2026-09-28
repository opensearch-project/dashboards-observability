/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const mockExecuteQuery = jest.fn();
const mockExecuteInstantQuery = jest.fn();

jest.mock('../../../query_services/ppl_search_service', () => ({
  PPLSearchService: jest.fn().mockImplementation(() => ({ executeQuery: mockExecuteQuery })),
}));
jest.mock('../../../query_services/promql_search_service', () => ({
  PromQLSearchService: jest
    .fn()
    .mockImplementation(() => ({ executeInstantQuery: mockExecuteInstantQuery })),
}));
// Stable across renders, like the real context value.
const mockApmConfig = {
  config: {
    prometheusDataSource: { id: 'prom', name: 'prom' },
    tracesDataset: { id: 'traces-id', title: 'otel-v1-apm-span-*' },
    serviceMapDataset: { id: 'svcmap-id', title: 'otel-v2-apm-service-map*' },
  },
};
jest.mock('../../../config/apm_config_context', () => ({
  useApmConfig: () => mockApmConfig,
}));
jest.mock('../../../shared/hooks/use_chart_step_window', () => ({
  useChartStepWindow: () => ({ window: '1m', timeRangeSeconds: 900 }),
}));
jest.mock('../../../shared/components/promql_metric_card', () => ({
  PromQLMetricCard: ({ title }: { title: string }) => (
    <div data-test-subj="metricCard">{title}</div>
  ),
}));
jest.mock('../../../shared/components/promql_line_chart', () => ({
  PromQLLineChart: () => <div data-test-subj="promqlChart" />,
}));

import { DependencyDetails } from '../dependency_details';

const timeRange = { from: '2026-09-27T20:00:00.000Z', to: '2026-09-27T20:15:00.000Z' };

const renderPage = (dependencyName: string, nodeType: string) =>
  render(
    <DependencyDetails
      dependencyName={dependencyName}
      environment="generic:default"
      nodeType={nodeType}
      timeRange={timeRange}
      refreshTrigger={0}
    />
  );

const spanQueries = () =>
  mockExecuteQuery.mock.calls
    .map((c) => c[0] as string)
    .filter((q) => q.startsWith('source=otel-v1-apm-span-*'));

describe('DependencyDetails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteInstantQuery.mockResolvedValue({
      type: 'data_frame',
      fields: [
        { name: 'Series', values: ['{remoteOperation="HGET", service="cart"}'] },
        { name: 'Value', values: [440] },
      ],
    });
    mockExecuteQuery.mockImplementation((query: string) =>
      Promise.resolve(
        query.includes('dependencyAttributes')
          ? {
              jsonData: [
                {
                  'targetNode.dependencyAttributes': {
                    server: { address: 'valkey-cart', port: '6379' },
                    db: { system: { name: 'redis' } },
                  },
                },
              ],
            }
          : {
              jsonData: [
                {
                  spanId: 's1',
                  serviceName: 'cart',
                  name: 'HGET cart-42',
                  durationInNanos: 2_000_000,
                  'status.code': 0,
                  startTime: '2026-09-27 20:10:00',
                },
              ],
            }
      )
    );
  });

  it('renders the type badge, metric cards and the callers table', async () => {
    renderPage('redis:valkey-cart', 'database');

    expect(screen.getByText('Database')).toBeInTheDocument();
    expect(screen.getAllByTestId('metricCard')).toHaveLength(4);
    expect(await screen.findByText('440')).toBeInTheDocument();
    expect(mockExecuteInstantQuery.mock.calls[0][0].query).toContain(
      'remoteService="redis:valkey-cart"'
    );
  });

  it('matches caller spans on the node dependencyAttributes within the time range', async () => {
    renderPage('redis:valkey-cart', 'database');

    expect(await screen.findByText('HGET cart-42')).toBeInTheDocument();
    const attrQuery = mockExecuteQuery.mock.calls[0][0] as string;
    expect(attrQuery).toContain('source=otel-v2-apm-service-map*');
    expect(attrQuery).toContain("targetNode.keyAttributes.name = 'redis:valkey-cart'");
    const [spanQuery] = spanQueries();
    expect(spanQuery).toContain("startTime >= '2026-09-27 20:00:00.000'");
    expect(spanQuery).toContain("kind = 'SPAN_KIND_CLIENT'");
    expect(spanQuery).toContain("attributes.server.address = 'valkey-cart'");
    // The name prefix is the system, not a host.
    expect(spanQuery).not.toContain("attributes.server.address = 'redis'");
    // The safe query matched, so the legacy keys are never tried.
    expect(spanQueries()).toHaveLength(1);
    expect(spanQuery).not.toContain('attributes.db.system =');
  });

  it('tries the legacy keys only when nothing matched, and tolerates PPL rejecting them', async () => {
    mockExecuteQuery.mockImplementation((query: string) => {
      if (query.includes('dependencyAttributes')) return Promise.resolve({ jsonData: [] });
      return query.includes('attributes.db.system =')
        ? Promise.reject(new Error('EQUAL function expects ... but got [STRUCT,STRING]'))
        : Promise.resolve({ jsonData: [] });
    });

    renderPage('redis:valkey-cart', 'database');

    await waitFor(() => expect(spanQueries()).toHaveLength(2));
    expect(spanQueries()[0]).not.toContain('attributes.db.system =');
    expect(spanQueries()[1]).toContain("attributes.db.system = 'redis'");
    expect(
      await screen.findByText('No spans found for this dependency in the selected time range.')
    ).toBeInTheDocument();
  });

  it('shows spans found through the legacy keys', async () => {
    mockExecuteQuery.mockImplementation((query: string) => {
      if (query.includes('dependencyAttributes')) return Promise.resolve({ jsonData: [] });
      return Promise.resolve(
        query.includes('attributes.messaging.destination =')
          ? { jsonData: [{ spanId: 'l1', serviceName: 'checkout', name: 'orders publish' }] }
          : { jsonData: [] }
      );
    });

    renderPage('kafka:orders', 'messaging');

    expect(await screen.findByText('orders publish')).toBeInTheDocument();
    expect(spanQueries()).toHaveLength(2);
  });

  it('evaluates the callers query at the end of the selected range, not now', async () => {
    renderPage('redis:valkey-cart', 'database');

    await waitFor(() => expect(mockExecuteInstantQuery).toHaveBeenCalled());
    expect(mockExecuteInstantQuery.mock.calls[0][0].time).toBe(
      Math.floor(Date.parse(timeRange.to) / 1000)
    );
  });

  it('reads caller labels from the structured Labels field', async () => {
    mockExecuteInstantQuery.mockResolvedValue({
      type: 'data_frame',
      fields: [
        { name: 'Series', values: ['unparseable'] },
        { name: 'Labels', values: [{ service: 'checkout', remoteOperation: 'publish' }] },
        { name: 'Value', values: [12] },
      ],
    });

    renderPage('kafka:orders', 'messaging');

    expect(await screen.findByText('checkout')).toBeInTheDocument();
    expect(screen.getByText('publish')).toBeInTheDocument();
    // Brokers are reached by producers and consumers, not just callers.
    expect(screen.getAllByText('Producing or consuming service').length).toBeGreaterThan(0);
  });

  it('falls back to the node name when the attribute lookup fails (older data)', async () => {
    mockExecuteQuery.mockImplementation((query: string) =>
      query.includes('dependencyAttributes')
        ? Promise.reject(new Error('no such field'))
        : Promise.resolve({ jsonData: [] })
    );

    renderPage('kafka:orders', 'Messaging');

    // The safe query, then (nothing matched) the one with the legacy destination key.
    await waitFor(() => expect(spanQueries()).toHaveLength(2));
    expect(spanQueries()[0]).toContain("attributes.messaging.destination.name = 'orders'");
    expect(spanQueries()[0]).toContain("attributes.messaging.system = 'kafka'");
    expect(spanQueries()[0]).not.toContain('attributes.messaging.destination =');
    expect(
      await screen.findByText('No spans found for this dependency in the selected time range.')
    ).toBeInTheDocument();
  });
});
