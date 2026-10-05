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
// Field names mapped in each index: the current semconv span keys, and a service map with
// dependencyAttributes. Tests override them per mapping.
const SPAN_FIELDS = [
  'attributes.db.system.name',
  'attributes.server.address',
  'attributes.net.peer.name',
  'attributes.db.namespace',
  'attributes.messaging.system',
  'attributes.messaging.destination.name',
  'attributes.peer.service',
];
const SERVICE_MAP_FIELDS = ['targetNode.dependencyAttributes.server.address'];
const mockGetMappedFieldNames = jest.fn();
jest.mock('../../../query_services/field_mapping_service', () => ({
  getMappedFieldNames: (...args: unknown[]) => mockGetMappedFieldNames(...args),
}));
const mockFields = (spanFields: string[], serviceMapFields: string[] = SERVICE_MAP_FIELDS) =>
  mockGetMappedFieldNames.mockImplementation((pattern: string) =>
    Promise.resolve(new Set(pattern.startsWith('otel-v1-apm-span') ? spanFields : serviceMapFields))
  );
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
const mockLineChart = jest.fn();
jest.mock('../../../shared/components/promql_line_chart', () => ({
  PromQLLineChart: (props: any) => {
    mockLineChart(props);
    return <div data-test-subj="promqlChart" />;
  },
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
    mockFields(SPAN_FIELDS);
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
    expect(spanQueries()).toHaveLength(1);
    // Only the columns the table shows are returned.
    expect(spanQuery).toContain(
      '| fields spanId, serviceName, name, durationInNanos, status.code, startTime'
    );
  });

  it('queries only the span keys mapped in the index (legacy keyword mapping)', async () => {
    // Older instrumentation maps db.system as a keyword: referencing db.system.name would
    // make PPL reject the whole query.
    mockFields(['attributes.db.system', 'attributes.server.address']);
    mockExecuteQuery.mockImplementation((query: string) =>
      Promise.resolve(
        query.includes('dependencyAttributes')
          ? { jsonData: [] }
          : { jsonData: [{ spanId: 'l1', serviceName: 'cart', name: 'HGET legacy' }] }
      )
    );

    renderPage('redis:valkey-cart', 'database');

    expect(await screen.findByText('HGET legacy')).toBeInTheDocument();
    expect(spanQueries()).toEqual([
      expect.stringContaining(
        "| where attributes.db.system = 'redis' | where attributes.server.address = 'valkey-cart' |"
      ),
    ]);
    expect(spanQueries()[0]).not.toContain('db.system.name');
    expect(spanQueries()[0]).not.toContain('net.peer.name');
  });

  it('parses the node name without an attribute query when the service map has none mapped', async () => {
    mockFields(SPAN_FIELDS, []);

    renderPage('kafka:orders', 'Messaging');

    await waitFor(() => expect(spanQueries()).toHaveLength(1));
    expect(mockExecuteQuery.mock.calls.map((c) => c[0] as string)).not.toContainEqual(
      expect.stringContaining('dependencyAttributes')
    );
    expect(spanQueries()[0]).toContain("attributes.messaging.destination.name = 'orders'");
    expect(spanQueries()[0]).toContain("attributes.messaging.system = 'kafka'");
  });

  it('sends no span query when none of the identifying keys is mapped', async () => {
    mockFields(['attributes.server.address'], []);

    renderPage('kafka:orders', 'messaging');

    expect(
      await screen.findByText('No spans found for this dependency in the selected time range.')
    ).toBeInTheDocument();
    expect(spanQueries()).toHaveLength(0);
  });

  it('reports a failed callers query instead of showing no callers', async () => {
    mockExecuteInstantQuery.mockRejectedValue(new Error('connect ECONNREFUSED'));

    renderPage('redis:valkey-cart', 'database');

    expect(await screen.findByTestId('dependencyCallersError')).toHaveTextContent(
      'connect ECONNREFUSED'
    );
    expect(screen.queryByText('No callers found in the selected time range.')).toBeNull();
  });

  it('reports failed span, attribute and field lookups instead of showing no spans', async () => {
    for (const fail of ['spans', 'attributes', 'fields']) {
      jest.clearAllMocks();
      mockFields(SPAN_FIELDS);
      if (fail === 'fields') mockGetMappedFieldNames.mockRejectedValue(new Error('field caps 403'));
      mockExecuteQuery.mockImplementation((query: string) =>
        (fail === 'attributes') === query.includes('dependencyAttributes')
          ? Promise.reject(new Error(`${fail} failed`))
          : Promise.resolve({ jsonData: [] })
      );

      const { unmount } = renderPage('redis:valkey-cart', 'database');

      expect(await screen.findByTestId('dependencySpansError')).toHaveTextContent(
        fail === 'fields' ? 'field caps 403' : `${fail} failed`
      );
      expect(
        screen.queryByText('No spans found for this dependency in the selected time range.')
      ).toBeNull();
      // A failed attribute lookup does not silently fall back to name parsing.
      if (fail !== 'spans') expect(spanQueries()).toHaveLength(0);
      unmount();
    }
  });

  it('caps and sorts the callers by requests', async () => {
    mockExecuteInstantQuery.mockResolvedValue({
      type: 'data_frame',
      fields: [
        {
          name: 'Labels',
          values: [
            { service: 'quiet', remoteOperation: 'GET' },
            { service: 'busy', remoteOperation: 'GET' },
          ],
        },
        { name: 'Value', values: [1, 99] },
      ],
    });

    renderPage('redis:valkey-cart', 'database');

    expect(await screen.findByText('busy')).toBeInTheDocument();
    expect(mockExecuteInstantQuery.mock.calls[0][0].query).toMatch(/^topk\(100, /);
    const rows = screen.getAllByRole('row').map((r) => r.textContent || '');
    const busy = rows.findIndex((r) => r.includes('busy'));
    const quiet = rows.findIndex((r) => r.includes('quiet'));
    expect(busy).toBeLessThan(quiet);
  });

  it('evaluates the callers query at the end of the selected range, not now', async () => {
    renderPage('redis:valkey-cart', 'database');

    await waitFor(() => expect(mockExecuteInstantQuery).toHaveBeenCalled());
    expect(mockExecuteInstantQuery.mock.calls[0][0].time).toBe(
      Math.floor(Date.parse(timeRange.to) / 1000)
    );
  });

  it('lists a broker producers and consumers with their role', async () => {
    mockExecuteInstantQuery.mockResolvedValue({
      type: 'data_frame',
      fields: [
        {
          name: 'Labels',
          values: [
            { service: 'checkout', remoteOperation: 'publish', spanKind: 'PRODUCER' },
            { service: 'shipping', remoteOperation: 'receive', spanKind: 'CONSUMER' },
          ],
        },
        { name: 'Value', values: [10, 10] },
      ],
    });

    renderPage('kafka:orders', 'messaging');

    expect(await screen.findByText('checkout')).toBeInTheDocument();
    expect(screen.getAllByText('Producer').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Consumer').length).toBeGreaterThan(0);
    // Cards and charts measure publishes only; callers keep both directions.
    expect(mockExecuteInstantQuery.mock.calls[0][0].query).toContain(
      'sum by (service, remoteOperation, spanKind)'
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

  it('explains an overflow node instead of querying spans for it', async () => {
    renderPage('OtherDatabase', 'database');

    expect(
      await screen.findByText(/groups dependencies over the data-prepper cardinality cap/)
    ).toBeInTheDocument();
    expect(mockExecuteQuery).not.toHaveBeenCalled();
    // Callers still come from the metrics.
    expect(await screen.findByText('440')).toBeInTheDocument();
  });

  it('wires chart brushing to onTimeRangeChange', () => {
    const onTimeRangeChange = jest.fn();
    render(
      <DependencyDetails
        dependencyName="redis:valkey-cart"
        environment="generic:default"
        nodeType="database"
        timeRange={timeRange}
        refreshTrigger={0}
        onTimeRangeChange={onTimeRangeChange}
      />
    );

    expect(screen.getAllByTestId('promqlChart')).toHaveLength(4);
    const charts = mockLineChart.mock.calls.map(([props]) => props);
    expect(charts.every((p) => p.onTimeRangeChange === onTimeRangeChange)).toBe(true);
  });

  it('falls back to the node name when the service map has no attributes for the node', async () => {
    mockExecuteQuery.mockImplementation((query: string) => Promise.resolve({ jsonData: [] }));

    renderPage('kafka:orders', 'Messaging');

    await waitFor(() => expect(spanQueries()).toHaveLength(1));
    expect(spanQueries()[0]).toContain("attributes.messaging.destination.name = 'orders'");
    expect(spanQueries()[0]).toContain("attributes.messaging.system = 'kafka'");
    expect(
      await screen.findByText('No spans found for this dependency in the selected time range.')
    ).toBeInTheDocument();
  });
});
