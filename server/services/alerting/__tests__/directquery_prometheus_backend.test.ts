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
      const result = await backend.getHistoricalAlerts(
        mockClient as never,
        ds,
        100,
        400,
        60,
        /* endIsNow */ false
      );
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
      const result = await backend.getHistoricalAlerts(
        mockClient as never,
        ds,
        100,
        460,
        60,
        /* endIsNow */ false
      );
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
      // Live-alerts fetch (Option A: always runs when endIsNow=true). This
      // particular live alert matches the historical episode above — the
      // dedupe on rule-identity hash should suppress it so only one row
      // comes back.
      mockClient.transport.request.mockResolvedValueOnce({
        body: {
          data: {
            alerts: [
              {
                labels: { alertname: 'Z' },
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
        100,
        220,
        60,
        /* endIsNow */ true
      );
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
      const result = await backend.getHistoricalAlerts(
        mockClient as never,
        ds,
        100,
        300,
        60,
        /* endIsNow */ false
      );
      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].annotations.truncatedStart).toBe('true');
      expect(result.alerts[0].startTime).toBe(new Date(100_000).toISOString());
    });

    it('first sample mid-window (not at left edge) ⇒ startTime uses the sample, no truncatedStart', async () => {
      // Regression guard for the "every alert starts at windowStart" bug.
      // A rule added recently emits its first ALERTS sample well inside the
      // window — that first sample is STILL at index 0 of the returned
      // matrix (Prometheus only returns samples that exist), but the sample
      // timestamp is far from windowStart, so we must NOT clamp.
      //
      // Window 100..1000, step 60 → tolerance 90s. The first (and only
      // firing) sample is at 700s — 600s after windowStart, well outside
      // the 90s tolerance. Expect `startTime = 700_000` and no truncation.
      mockClient.transport.request.mockResolvedValueOnce(
        matrix([
          {
            metric: { alertname: 'Recent' },
            points: [
              [700, '1'],
              [760, '1'],
              [820, '0'],
            ],
          },
        ])
      );
      const result = await backend.getHistoricalAlerts(
        mockClient as never,
        ds,
        100,
        1000,
        60,
        /* endIsNow */ false
      );
      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].startTime).toBe(new Date(700_000).toISOString());
      expect(result.alerts[0].annotations.truncatedStart).toBeUndefined();
    });

    it('last firing sample far from window end ⇒ state resolved, lastUpdated uses the sample', async () => {
      // Regression guard for the "always clamp endMs to windowEnd" bug.
      // If the final firing sample is more than ~1.5 steps before
      // windowEnd, the alert resolved mid-window (the series just ends
      // because the rule stopped firing). Report the actual resolution
      // time and mark `resolved`.
      //
      // Window 100..1000, step 60 → tolerance 90s. Last firing sample at
      // 300s — 700s before windowEnd, well outside tolerance.
      mockClient.transport.request.mockResolvedValueOnce(
        matrix([
          {
            metric: { alertname: 'ResolvedMid' },
            points: [
              [200, '1'],
              [260, '1'],
              [300, '1'],
            ],
          },
        ])
      );
      const result = await backend.getHistoricalAlerts(
        mockClient as never,
        ds,
        100,
        1000,
        60,
        /* endIsNow */ false
      );
      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].state).toBe('resolved');
      expect(result.alerts[0].lastUpdated).toBe(new Date(300_000).toISOString());
    });

    it('labels produce distinct ids for same alertname across different services', async () => {
      // Regression guard for the duplicate-id bug: two series with the
      // same alertname + alertstate but different `service_name` labels
      // must produce distinct UnifiedAlertSummary ids. Pre-fix, both
      // would collide on `${dsId}-${name}-${instance}-${alertstate}-${startMs}`
      // because `instance` is empty on these series.
      mockClient.transport.request.mockResolvedValueOnce(
        matrix([
          {
            metric: { alertname: 'ServiceError', service_name: 'cart', alertstate: 'firing' },
            points: [
              [160, '1'],
              [220, '0'],
            ],
          },
          {
            metric: {
              alertname: 'ServiceError',
              service_name: 'checkout',
              alertstate: 'firing',
            },
            points: [
              [160, '1'],
              [220, '0'],
            ],
          },
        ])
      );
      const result = await backend.getHistoricalAlerts(
        mockClient as never,
        ds,
        100,
        400,
        60,
        /* endIsNow */ false
      );
      expect(result.alerts).toHaveLength(2);
      expect(result.alerts[0].id).not.toBe(result.alerts[1].id);
    });

    it('matrix query is scoped to alertstate="firing" (pending filtered upstream)', async () => {
      // We filter `alertstate="firing"` at the PromQL level so Cortex
      // never returns `alertstate="pending"` series in the first place.
      // This keeps row counts step-independent (pending samples are more
      // likely to be caught at fine step, missed at coarse step). The
      // test asserts the exact PromQL sent on the wire.
      mockClient.transport.request.mockResolvedValueOnce(matrix([]));
      await backend.getHistoricalAlerts(
        mockClient as never,
        ds,
        100,
        400,
        60,
        /* endIsNow */ false
      );
      const calls = mockClient.transport.request.mock.calls as Array<
        [{ body?: { query?: string } }]
      >;
      expect(calls[0][0].body?.query).toBe('ALERTS{alertstate="firing"}');
    });

    it('live alerts in pending state are suppressed in the merge', async () => {
      // Belt-and-suspenders: even if a Prometheus variant does return
      // pending alerts from `/api/v1/alerts`, we drop them during the
      // live-side merge so they don't reintroduce the flicker we just
      // removed upstream.
      mockClient.transport.request.mockResolvedValueOnce(matrix([]));
      mockClient.transport.request.mockResolvedValueOnce({
        body: {
          data: {
            alerts: [
              {
                labels: { alertname: 'Firing', service: 'a' },
                state: 'firing',
                annotations: {},
                activeAt: '2024-01-15T12:00:00Z',
              },
              {
                labels: { alertname: 'Pending', service: 'b' },
                state: 'pending',
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
        100,
        500,
        60,
        /* endIsNow */ true
      );
      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].name).toBe('Firing');
    });

    it('empty matrix + endIsNow=false ⇒ { alerts: [], no fallback }', async () => {
      mockClient.transport.request.mockResolvedValueOnce(matrix([]));
      const result = await backend.getHistoricalAlerts(
        mockClient as never,
        ds,
        /* startEpochSec */ 100,
        /* endEpochSec   */ 1000,
        60,
        /* endIsNow */ false
      );
      expect(result.alerts).toEqual([]);
      expect(result.fallback).toBeUndefined();
      expect(result.error).toBeUndefined();
      // Only the matrix query was made — no fallback call to /api/v1/alerts.
      expect(mockClient.transport.request).toHaveBeenCalledTimes(1);
    });

    it('empty matrix + endIsNow=true ⇒ surfaces live alerts with fallback flag', async () => {
      // Option A: matrix empty (retention gap) → we still run the live
      // /api/v1/alerts fetch in parallel and surface whatever it returns.
      // `fallback` flags the coverage gap so the UI can banner it.
      mockClient.transport.request.mockResolvedValueOnce(matrix([]));
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
        100,
        500,
        60,
        /* endIsNow */ true
      );
      expect(result.fallback).toBe('prometheus-alerts-current-only');
      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].name).toBe('Live');
    });

    it('live alerts merged with historical episodes; active episodes dedupe the live duplicate', async () => {
      // Window 100..400, step 60. One episode still firing at the right
      // edge (Active) and one that resolved mid-window (Resolved). Live
      // endpoint returns the same Active alert (which must dedupe) plus
      // a NEW Emerging alert not seen in the matrix (which must appear).
      mockClient.transport.request.mockResolvedValueOnce(
        matrix([
          {
            metric: { alertname: 'Active', service: 'cart', alertstate: 'firing' },
            points: [
              [220, '1'],
              [280, '1'],
              [340, '1'],
              [400, '1'],
            ],
          },
          {
            metric: { alertname: 'Resolved', service: 'ad', alertstate: 'firing' },
            points: [
              [160, '1'],
              [220, '1'],
              [280, '0'],
            ],
          },
        ])
      );
      mockClient.transport.request.mockResolvedValueOnce({
        body: {
          data: {
            alerts: [
              {
                // Same rule identity as the Active historical episode —
                // stripping alertstate, labels match. Expect dedupe.
                labels: { alertname: 'Active', service: 'cart' },
                state: 'firing',
                annotations: {},
                activeAt: '2024-01-15T12:00:00Z',
              },
              {
                // No matching historical episode — expect this to show up.
                labels: { alertname: 'Emerging', service: 'checkout' },
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
        100,
        400,
        60,
        /* endIsNow */ true
      );
      // 2 historical + 1 live (the dup'd "Active" was suppressed by dedupe).
      expect(result.alerts).toHaveLength(3);
      const names = result.alerts.map((a) => a.name).sort();
      expect(names).toEqual(['Active', 'Emerging', 'Resolved']);
      // Because the matrix had data, no fallback banner.
      expect(result.fallback).toBeUndefined();
    });

    it('resolved historical episode does NOT dedupe a re-firing live alert', async () => {
      // Rule fired and resolved mid-window, then fired again. Live
      // /api/v1/alerts surfaces the current firing; the historical
      // resolved episode must NOT suppress it (dedupe only fires on
      // episodes flagged `stillActiveAtRangeEnd`).
      mockClient.transport.request.mockResolvedValueOnce(
        matrix([
          {
            metric: { alertname: 'Flap', service: 'x', alertstate: 'firing' },
            points: [
              [160, '1'],
              [220, '1'],
              [280, '0'], // resolved mid-window
            ],
          },
        ])
      );
      mockClient.transport.request.mockResolvedValueOnce({
        body: {
          data: {
            alerts: [
              {
                labels: { alertname: 'Flap', service: 'x' },
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
        100,
        500,
        60,
        /* endIsNow */ true
      );
      expect(result.alerts).toHaveLength(2);
      const states = result.alerts.map((a) => a.state);
      expect(states).toContain('resolved');
      expect(states).toContain('active');
    });

    it('endIsNow=false ⇒ live /api/v1/alerts NOT called', async () => {
      // Past-only window: the live endpoint has nothing to offer, so
      // we should make exactly one request (the matrix) and no fallback.
      mockClient.transport.request.mockResolvedValueOnce(
        matrix([
          {
            metric: { alertname: 'Past' },
            points: [
              [160, '1'],
              [220, '0'],
            ],
          },
        ])
      );
      const result = await backend.getHistoricalAlerts(
        mockClient as never,
        ds,
        100,
        500,
        60,
        /* endIsNow */ false
      );
      expect(result.alerts).toHaveLength(1);
      expect(mockClient.transport.request).toHaveBeenCalledTimes(1);
      expect(result.fallback).toBeUndefined();
    });

    it('empty matrix + endIsNow=true + live /api/v1/alerts fails ⇒ { alerts: [], error }', async () => {
      // Matrix is empty AND live fetch rejects + rule-extraction fallback
      // also rejects. Nothing to surface; propagate the live-side error.
      mockClient.transport.request.mockResolvedValueOnce(matrix([]));
      mockClient.transport.request.mockRejectedValueOnce(new Error('upstream unauthorized'));
      mockClient.transport.request.mockRejectedValueOnce(new Error('upstream unauthorized'));
      const result = await backend.getHistoricalAlerts(
        mockClient as never,
        ds,
        100,
        500,
        60,
        /* endIsNow */ true
      );
      expect(result.alerts).toEqual([]);
      expect(result.error).toBeDefined();
    });

    it('queryRangeMatrix throws + no live fallback ⇒ { alerts: [], error }', async () => {
      mockClient.transport.request.mockRejectedValueOnce(new Error('workspace offline'));
      const result = await backend.getHistoricalAlerts(
        mockClient as never,
        ds,
        100,
        200,
        60,
        /* endIsNow */ false
      );
      expect(result.alerts).toEqual([]);
      expect(result.error).toContain('workspace offline');
    });
  });
});
