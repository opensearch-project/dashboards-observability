/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DirectQueryPrometheusBackend } from '../directquery_prometheus_backend';
import type { Datasource, Logger } from '../../../../common/types/alerting';

const mockLogger: Logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

const mockClient = {
  transport: { request: jest.fn() },
};

const ds: Datasource = {
  id: 'ds-1',
  name: 'my-prom',
  type: 'prometheus',
  url: '',
  enabled: true,
  directQueryName: 'my-prom',
};

let backend: DirectQueryPrometheusBackend;

beforeEach(() => {
  backend = new DirectQueryPrometheusBackend(mockLogger);
});

describe('DirectQueryPrometheusBackend', () => {
  // ---- discoverDatasources ----
  it('discoverDatasources returns Prometheus entries from SQL plugin', async () => {
    mockClient.transport.request.mockResolvedValueOnce({
      body: [
        { name: 'prom1', connector: 'PROMETHEUS', status: 'ACTIVE' },
        { name: 'os1', connector: 'OPENSEARCH', status: 'ACTIVE' },
      ],
    });
    const result = await backend.discoverDatasources(mockClient as never);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'prom1',
      type: 'prometheus',
      directQueryName: 'prom1',
    });
  });

  it('discoverDatasources returns empty on error', async () => {
    mockClient.transport.request.mockRejectedValueOnce(new Error('fail'));
    const result = await backend.discoverDatasources(mockClient as never);
    expect(result).toEqual([]);
  });

  // ---- getRuleGroups ----
  it('getRuleGroups maps raw groups to typed PromRuleGroup[]', async () => {
    mockClient.transport.request.mockResolvedValueOnce({
      body: {
        data: {
          groups: [
            {
              name: 'g1',
              file: 'rules.yml',
              interval: '60s',
              rules: [
                { name: 'HighCPU', type: 'alerting', query: 'up==0', state: 'firing', alerts: [] },
              ],
            },
          ],
        },
      },
    });
    const groups = await backend.getRuleGroups(mockClient as never, ds);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('g1');
    expect(groups[0].rules[0].name).toBe('HighCPU');
  });

  // ---- getAlerts ----
  it('getAlerts returns alerts from /api/v1/alerts', async () => {
    mockClient.transport.request.mockResolvedValueOnce({
      body: {
        data: {
          alerts: [{ labels: { alertname: 'X' }, state: 'firing', annotations: {} }],
        },
      },
    });
    const alerts = await backend.getAlerts(mockClient as never, ds);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].state).toBe('firing');
  });

  // ---- getMetricNames ----
  it('getMetricNames returns array from label values endpoint', async () => {
    mockClient.transport.request.mockResolvedValueOnce({ body: { data: ['up', 'node_cpu'] } });
    const names = await backend.getMetricNames(mockClient as never, ds);
    expect(names).toEqual(['up', 'node_cpu']);
  });

  it('getMetricNames returns empty on error', async () => {
    mockClient.transport.request.mockRejectedValueOnce(new Error('fail'));
    const names = await backend.getMetricNames(mockClient as never, ds);
    expect(names).toEqual([]);
  });

  // ---- getLabelNames ----
  it('getLabelNames rejects invalid metric name', async () => {
    const names = await backend.getLabelNames(mockClient as never, ds, 'bad{metric}');
    expect(names).toEqual([]);
    expect(mockClient.transport.request).not.toHaveBeenCalled();
  });

  // ---- getMetricMetadata ----
  it('getMetricMetadata maps raw metadata to typed array', async () => {
    mockClient.transport.request.mockResolvedValueOnce({
      body: { data: { up: [{ type: 'gauge', help: 'Up metric' }] } },
    });
    const meta = await backend.getMetricMetadata(mockClient as never, ds);
    expect(meta).toEqual([{ metric: 'up', type: 'gauge', help: 'Up metric' }]);
  });

  // ---- queryRange ----
  it('queryRange posts to DirectQuery execution endpoint', async () => {
    mockClient.transport.request.mockResolvedValueOnce({
      body: {
        results: { 'my-prom': { resultType: 'matrix', result: [{ values: [[1000, '42']] }] } },
      },
    });
    const points = await backend.queryRange(mockClient as never, ds, 'up', 100, 200, 15);
    expect(mockClient.transport.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/_plugins/_directquery/_query/my-prom',
      })
    );
    expect(points).toEqual([{ timestamp: 1000000, value: 42 }]);
  });

  // ---- resolveDqName guard ----
  it('throws when datasource has no directQueryName', async () => {
    const noDq = { ...ds, directQueryName: undefined };
    await expect(backend.getRuleGroups(mockClient as never, noDq as never)).rejects.toThrow(
      /directQueryName/
    );
  });

  // =========================================================================
  // getHistoricalAlerts / queryRangeMatrix
  // =========================================================================

  describe('queryRangeMatrix', () => {
    it('parses a fixture with multiple series correctly', async () => {
      mockClient.transport.request.mockResolvedValueOnce({
        body: {
          results: {
            'my-prom': {
              resultType: 'matrix',
              result: [
                {
                  metric: { alertname: 'HighCPU', instance: 'a' },
                  values: [
                    [100, '1'],
                    [200, '1'],
                  ],
                },
                {
                  metric: { alertname: 'HighCPU', instance: 'b' },
                  values: [
                    [100, '0'],
                    [200, '1'],
                  ],
                },
                {
                  metric: { alertname: 'LowDisk' },
                  values: [[200, '1']],
                },
              ],
            },
          },
        },
      });
      const series = await backend.queryRangeMatrix(
        mockClient as never,
        ds,
        'ALERTS',
        100,
        300,
        60
      );
      expect(series).toHaveLength(3);
      expect(series[0].metric).toEqual({ alertname: 'HighCPU', instance: 'a' });
      expect(series[0].values).toEqual([
        { timestamp: 100_000, value: 1 },
        { timestamp: 200_000, value: 1 },
      ]);
      // Second series — mixed 0 and 1 preserved
      expect(series[1].values.map((v) => v.value)).toEqual([0, 1]);
    });
  });

  describe('getHistoricalAlerts', () => {
    // The "empty matrix + range fully past" test asserts `toHaveBeenCalledTimes(1)`
    // on `mockClient.transport.request`. Without a per-describe clear, prior
    // tests in this file (or the sibling `queryRangeMatrix` describe) leave
    // call counts that break the assertion in full-suite runs while passing
    // in isolation.
    beforeEach(() => {
      mockClient.transport.request.mockClear();
    });

    // Build a matrix response envelope matching the DirectQuery shape.
    const matrix = (
      series: Array<{ metric: Record<string, string>; points: Array<[number, string]> }>
    ) => ({
      body: {
        results: {
          'my-prom': {
            resultType: 'matrix',
            result: series.map((s) => ({ metric: s.metric, values: s.points })),
          },
        },
      },
    });

    it('reconstructs a single contiguous firing block into one episode', async () => {
      // Series with 5 points, firing only in the middle 3.
      // step 60s, window 100..400
      mockClient.transport.request.mockResolvedValueOnce(
        matrix([
          {
            metric: { alertname: 'X' },
            points: [
              [100, '0'],
              [160, '1'],
              [220, '1'],
              [280, '1'],
              [340, '0'],
            ],
          },
        ])
      );
      const result = await backend.getHistoricalAlerts(mockClient as never, ds, 100, 400, 60);
      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].name).toBe('X');
      expect(result.alerts[0].state).toBe('resolved');
      expect(result.alerts[0].startTime).toBe(new Date(160_000).toISOString());
      expect(result.alerts[0].lastUpdated).toBe(new Date(280_000).toISOString());
      expect(result.alerts[0].annotations.truncatedStart).toBeUndefined();
      expect(result.fallback).toBeUndefined();
    });

    it('reconstructs two runs separated by a gap as separate episodes', async () => {
      mockClient.transport.request.mockResolvedValueOnce(
        matrix([
          {
            metric: { alertname: 'Y' },
            points: [
              [100, '0'],
              [160, '1'], // run 1 start
              [220, '1'], // run 1 end
              [280, '0'], // gap
              [340, '1'], // run 2 start
              [400, '1'], // run 2 end
              [460, '0'],
            ],
          },
        ])
      );
      const result = await backend.getHistoricalAlerts(mockClient as never, ds, 100, 460, 60);
      expect(result.alerts).toHaveLength(2);
    });

    it('series still firing at the window end ⇒ stillActiveAtRangeEnd ⇒ state "active"', async () => {
      mockClient.transport.request.mockResolvedValueOnce(
        matrix([
          {
            metric: { alertname: 'Z' },
            points: [
              [100, '0'],
              [160, '1'],
              [220, '1'], // last sample, still firing
            ],
          },
        ])
      );
      const result = await backend.getHistoricalAlerts(mockClient as never, ds, 100, 220, 60);
      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].state).toBe('active');
      // endMs clamps to windowEnd (220s → 220_000ms)
      expect(result.alerts[0].lastUpdated).toBe(new Date(220_000).toISOString());
    });

    it('series firing from the window start ⇒ truncatedStart annotation', async () => {
      mockClient.transport.request.mockResolvedValueOnce(
        matrix([
          {
            metric: { alertname: 'W' },
            points: [
              [100, '1'], // already firing at left edge
              [160, '1'],
              [220, '0'],
            ],
          },
        ])
      );
      const result = await backend.getHistoricalAlerts(mockClient as never, ds, 100, 300, 60);
      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].annotations.truncatedStart).toBe('true');
      expect(result.alerts[0].startTime).toBe(new Date(100_000).toISOString());
    });

    it('flapping: separate pending + firing series ⇒ two episodes, not merged', async () => {
      mockClient.transport.request.mockResolvedValueOnce(
        matrix([
          {
            metric: { alertname: 'Flap', alertstate: 'pending' },
            points: [
              [100, '1'],
              [160, '1'],
              [220, '0'],
            ],
          },
          {
            metric: { alertname: 'Flap', alertstate: 'firing' },
            points: [
              [220, '1'],
              [280, '1'],
              [340, '0'],
            ],
          },
        ])
      );
      const result = await backend.getHistoricalAlerts(mockClient as never, ds, 100, 400, 60);
      expect(result.alerts).toHaveLength(2);
      const states = result.alerts.map((a) => a.labels.alertstate);
      expect(states).toContain('pending');
      expect(states).toContain('firing');
    });

    it('empty matrix + range fully past ⇒ { alerts: [], no fallback }', async () => {
      mockClient.transport.request.mockResolvedValueOnce(matrix([]));
      // Pin now to Jan 2024 so endEpochSec=1000 is clearly in the past.
      const result = await backend.getHistoricalAlerts(
        mockClient as never,
        ds,
        /* startEpochSec */ 100,
        /* endEpochSec   */ 1000,
        60
      );
      expect(result.alerts).toEqual([]);
      expect(result.fallback).toBeUndefined();
      expect(result.error).toBeUndefined();
      // Only the matrix query was made — no fallback call to /api/v1/alerts.
      expect(mockClient.transport.request).toHaveBeenCalledTimes(1);
    });

    it('empty matrix + range includes now ⇒ falls back to legacy /api/v1/alerts', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      // First call: empty matrix
      mockClient.transport.request.mockResolvedValueOnce(matrix([]));
      // Second call: legacy /api/v1/alerts returns a single current-active alert
      mockClient.transport.request.mockResolvedValueOnce({
        body: {
          data: {
            alerts: [
              {
                labels: { alertname: 'Live', instance: 'i-1' },
                state: 'firing',
                annotations: {},
                activeAt: '2024-01-15T12:00:00Z',
              },
            ],
          },
        },
      });
      const result = await backend.getHistoricalAlerts(
        mockClient as never,
        ds,
        nowSec - 3600,
        nowSec,
        60
      );
      expect(result.fallback).toBe('prometheus-alerts-current-only');
      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].name).toBe('Live');
    });

    it('queryRangeMatrix throws ⇒ { alerts: [], error }', async () => {
      mockClient.transport.request.mockRejectedValueOnce(new Error('workspace offline'));
      const result = await backend.getHistoricalAlerts(mockClient as never, ds, 100, 200, 60);
      expect(result.alerts).toEqual([]);
      expect(result.error).toContain('workspace offline');
    });
  });
});
