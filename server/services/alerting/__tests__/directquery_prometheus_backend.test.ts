/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DirectQueryPrometheusBackend } from '../directquery_prometheus_backend';
import { resetPromQLSearcherForTests, setPromQLSearcher } from '../promql_search';
import type { PromQLSearcher } from '../promql_search';
import type { Datasource, Logger } from '../../../../common/types/alerting';

const mockLogger: Logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

// Resource calls (rules / alerts / metadata / Alertmanager) still ride the
// scoped OS client. PromQL execution rides the search strategy via
// `runPromQLInstant` / `runPromQLRange` — captured below as a `jest.fn()`
// installed via `setPromQLSearcher`.
const mockClient = {
  transport: { request: jest.fn() },
};

const searcher = (jest.fn() as unknown) as jest.MockedFunction<PromQLSearcher>;

const ds: Datasource = {
  id: 'ds-1',
  name: 'my-prom',
  type: 'prometheus',
  url: '',
  enabled: true,
  directQueryName: 'my-prom',
};

// Stand-in for `RequestHandlerContext`. The PromQL adapter passes it
// straight to `data.search.search`, which our `searcher` mock captures.
const ctx = {} as never;

let backend: DirectQueryPrometheusBackend;

beforeEach(() => {
  backend = new DirectQueryPrometheusBackend(mockLogger);
  searcher.mockReset();
  setPromQLSearcher(searcher as PromQLSearcher);
});

afterAll(() => {
  resetPromQLSearcherForTests();
});

// ---------------------------------------------------------------------------
// Helpers — translate Prometheus-style matrix/vector fixtures into the
// `IDataFrameResponse` shape `runPromQLRange` / `runPromQLInstant` decode.
// Matches what `createDataFrame` in
// `src/plugins/query_enhancements/server/search/promql_search_strategy.ts`
// emits for a single PROMQL query: one row per (timestamp × series), with
// `Series` carrying the formatted metric label set including `__name__`.
// ---------------------------------------------------------------------------

interface SeriesFixture {
  metric: Record<string, string>;
  // Range-mode points; instant-mode fixtures use `value` instead.
  points?: Array<[number, string]>;
  value?: [number, string];
}

function formatMetric(metric: Record<string, string>): string {
  const parts = Object.entries(metric)
    .filter(([, v]) => v !== undefined && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`);
  return `{${parts.join(', ')}}`;
}

function buildDataFrame(series: SeriesFixture[], isRange: boolean) {
  const Time: number[] = [];
  const Series: string[] = [];
  const Labels: Array<Record<string, string>> = [];
  const Value: number[] = [];
  for (const s of series) {
    const seriesName = formatMetric(s.metric);
    const labelsWithoutName = { ...s.metric };
    delete labelsWithoutName.__name__;
    const points = isRange ? s.points ?? [] : s.value ? [s.value] : [];
    for (const [tsSec, raw] of points) {
      Time.push(tsSec * 1000);
      Series.push(seriesName);
      Labels.push(labelsWithoutName);
      // Match the strategy: `Number(value)` so 'NaN' / '+Inf' arrive as
      // JS NaN / Infinity that our adapter translates back to 'NaN' / '+Inf'.
      Value.push(Number(raw));
    }
  }
  return {
    type: 'data_frame',
    body: {
      type: 'data_frame',
      name: 'my-prom',
      schema: [
        { name: 'Time', type: 'time', values: [] },
        { name: 'Series', type: 'string', values: [] },
        { name: 'Labels', type: 'object', values: [] },
        { name: 'Value', type: 'number', values: [] },
      ],
      fields: [
        { name: 'Time', type: 'time', values: Time },
        { name: 'Series', type: 'string', values: Series },
        { name: 'Labels', type: 'object', values: Labels },
        { name: 'Value', type: 'number', values: Value },
      ],
      size: Time.length,
      meta: {},
    },
    took: 1,
  };
}

const matrixDF = (
  series: Array<{ metric: Record<string, string>; points: Array<[number, string]> }>
) => buildDataFrame(series, /* isRange */ true);

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
  it('queryRange routes through the PROMQL search strategy', async () => {
    searcher.mockResolvedValueOnce(
      matrixDF([{ metric: { __name__: 'up' }, points: [[1000, '42']] }])
    );
    const points = await backend.queryRange(ctx, ds, 'up', 100, 200, 15);
    expect(searcher).toHaveBeenCalledTimes(1);
    const [, request, options] = searcher.mock.calls[0];
    expect(options).toEqual({ strategy: 'promql' });
    const body = (request as { body: Record<string, unknown> }).body;
    expect(body.query).toMatchObject({
      query: 'up',
      language: 'PROMQL',
      dataset: { id: 'my-prom', type: 'PROMETHEUS' },
    });
    expect(points).toEqual([{ timestamp: 1000000, value: 42 }]);
  });

  it('queryRange threads ds.mdsId as request.dataSourceId', async () => {
    searcher.mockResolvedValueOnce(matrixDF([]));
    const mdsDs: Datasource = { ...ds, mdsId: 'mds-saved-object-id' };
    await backend.queryRange(ctx, mdsDs, 'up', 100, 200, 15);
    const [, request] = searcher.mock.calls[0];
    expect((request as { dataSourceId?: string }).dataSourceId).toBe('mds-saved-object-id');
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
      searcher.mockResolvedValueOnce(
        matrixDF([
          {
            metric: { __name__: 'ALERTS', alertname: 'HighCPU', instance: 'a' },
            points: [
              [100, '1'],
              [200, '1'],
            ],
          },
          {
            metric: { __name__: 'ALERTS', alertname: 'HighCPU', instance: 'b' },
            points: [
              [100, '0'],
              [200, '1'],
            ],
          },
          {
            metric: { __name__: 'ALERTS', alertname: 'LowDisk' },
            points: [[200, '1']],
          },
        ])
      );
      const series = await backend.queryRangeMatrix(ctx, ds, 'ALERTS', 100, 300, 60);
      expect(series).toHaveLength(3);
      // Order is determined by the bucket key; assert by alertname/instance.
      const byKey = Object.fromEntries(
        series.map((s) => [`${s.metric.alertname}|${s.metric.instance ?? ''}`, s])
      );
      expect(byKey['HighCPU|a'].values).toEqual([
        { timestamp: 100_000, value: 1 },
        { timestamp: 200_000, value: 1 },
      ]);
      expect(byKey['HighCPU|b'].values.map((v) => v.value)).toEqual([0, 1]);
    });
  });

  describe('getHistoricalAlerts', () => {
    beforeEach(() => {
      mockClient.transport.request.mockClear();
      searcher.mockReset();
    });

    it('reconstructs a single contiguous firing block into one episode', async () => {
      searcher.mockResolvedValueOnce(
        matrixDF([
          {
            metric: { __name__: 'ALERTS', alertname: 'X', alertstate: 'firing' },
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
        ctx,
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
      searcher.mockResolvedValueOnce(
        matrixDF([
          {
            metric: { __name__: 'ALERTS', alertname: 'Y', alertstate: 'firing' },
            points: [
              [100, '0'],
              [160, '1'],
              [220, '1'],
              [280, '0'],
              [340, '1'],
              [400, '1'],
              [460, '0'],
            ],
          },
        ])
      );
      const result = await backend.getHistoricalAlerts(
        ctx,
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
      searcher.mockResolvedValueOnce(
        matrixDF([
          {
            metric: { __name__: 'ALERTS', alertname: 'Z', alertstate: 'firing' },
            points: [
              [100, '0'],
              [160, '1'],
              [220, '1'],
            ],
          },
        ])
      );
      // Live alerts call goes via the resource client, not the strategy.
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
        ctx,
        mockClient as never,
        ds,
        100,
        220,
        60,
        /* endIsNow */ true
      );
      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].state).toBe('active');
      expect(result.alerts[0].lastUpdated).toBe(new Date(220_000).toISOString());
    });

    it('series firing from the window start ⇒ truncatedStart annotation', async () => {
      searcher.mockResolvedValueOnce(
        matrixDF([
          {
            metric: { __name__: 'ALERTS', alertname: 'W', alertstate: 'firing' },
            points: [
              [100, '1'],
              [160, '1'],
              [220, '0'],
            ],
          },
        ])
      );
      const result = await backend.getHistoricalAlerts(
        ctx,
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
      searcher.mockResolvedValueOnce(
        matrixDF([
          {
            metric: { __name__: 'ALERTS', alertname: 'Recent', alertstate: 'firing' },
            points: [
              [700, '1'],
              [760, '1'],
              [820, '0'],
            ],
          },
        ])
      );
      const result = await backend.getHistoricalAlerts(
        ctx,
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
      searcher.mockResolvedValueOnce(
        matrixDF([
          {
            metric: { __name__: 'ALERTS', alertname: 'ResolvedMid', alertstate: 'firing' },
            points: [
              [200, '1'],
              [260, '1'],
              [300, '1'],
            ],
          },
        ])
      );
      const result = await backend.getHistoricalAlerts(
        ctx,
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
      searcher.mockResolvedValueOnce(
        matrixDF([
          {
            metric: {
              __name__: 'ALERTS',
              alertname: 'ServiceError',
              service_name: 'cart',
              alertstate: 'firing',
            },
            points: [
              [160, '1'],
              [220, '0'],
            ],
          },
          {
            metric: {
              __name__: 'ALERTS',
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
        ctx,
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
      searcher.mockResolvedValueOnce(matrixDF([]));
      await backend.getHistoricalAlerts(
        ctx,
        mockClient as never,
        ds,
        100,
        400,
        60,
        /* endIsNow */ false
      );
      const [, request] = searcher.mock.calls[0];
      const reqBody = (request as { body: { query: { query: string } } }).body;
      expect(reqBody.query.query).toBe('ALERTS{alertstate="firing"}');
    });

    it('live alerts in pending state are surfaced (matches the Rules tab status)', async () => {
      searcher.mockResolvedValueOnce(matrixDF([]));
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
        ctx,
        mockClient as never,
        ds,
        100,
        500,
        60,
        /* endIsNow */ true
      );
      expect(result.alerts).toHaveLength(2);
      const byName = Object.fromEntries(result.alerts.map((a) => [a.name, a.state]));
      expect(byName.Firing).toBe('active');
      expect(byName.Pending).toBe('pending');
    });

    it('empty matrix + endIsNow=false ⇒ { alerts: [], no fallback }', async () => {
      searcher.mockResolvedValueOnce(matrixDF([]));
      const result = await backend.getHistoricalAlerts(
        ctx,
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
      // Strategy was called once; resource client was never called.
      expect(searcher).toHaveBeenCalledTimes(1);
      expect(mockClient.transport.request).not.toHaveBeenCalled();
    });

    it('empty matrix + endIsNow=true ⇒ surfaces live alerts with fallback flag', async () => {
      searcher.mockResolvedValueOnce(matrixDF([]));
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
        ctx,
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
      searcher.mockResolvedValueOnce(
        matrixDF([
          {
            metric: {
              __name__: 'ALERTS',
              alertname: 'Active',
              service: 'cart',
              alertstate: 'firing',
            },
            points: [
              [220, '1'],
              [280, '1'],
              [340, '1'],
              [400, '1'],
            ],
          },
          {
            metric: {
              __name__: 'ALERTS',
              alertname: 'Resolved',
              service: 'ad',
              alertstate: 'firing',
            },
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
                labels: { alertname: 'Active', service: 'cart' },
                state: 'firing',
                annotations: {},
                activeAt: '2024-01-15T12:00:00Z',
              },
              {
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
        ctx,
        mockClient as never,
        ds,
        100,
        400,
        60,
        /* endIsNow */ true
      );
      expect(result.alerts).toHaveLength(3);
      const names = result.alerts.map((a) => a.name).sort();
      expect(names).toEqual(['Active', 'Emerging', 'Resolved']);
      expect(result.fallback).toBeUndefined();
    });

    it('resolved historical episode does NOT dedupe a re-firing live alert', async () => {
      searcher.mockResolvedValueOnce(
        matrixDF([
          {
            metric: {
              __name__: 'ALERTS',
              alertname: 'Flap',
              service: 'x',
              alertstate: 'firing',
            },
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
        ctx,
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
      searcher.mockResolvedValueOnce(
        matrixDF([
          {
            metric: { __name__: 'ALERTS', alertname: 'Past', alertstate: 'firing' },
            points: [
              [160, '1'],
              [220, '0'],
            ],
          },
        ])
      );
      const result = await backend.getHistoricalAlerts(
        ctx,
        mockClient as never,
        ds,
        100,
        500,
        60,
        /* endIsNow */ false
      );
      expect(result.alerts).toHaveLength(1);
      expect(searcher).toHaveBeenCalledTimes(1);
      expect(mockClient.transport.request).not.toHaveBeenCalled();
      expect(result.fallback).toBeUndefined();
    });

    it('empty matrix + endIsNow=true + live /api/v1/alerts fails ⇒ { alerts: [], error }', async () => {
      searcher.mockResolvedValueOnce(matrixDF([]));
      // First live fetch (/api/v1/alerts) and the rule-extraction fallback both fail.
      mockClient.transport.request.mockRejectedValueOnce(new Error('upstream unauthorized'));
      mockClient.transport.request.mockRejectedValueOnce(new Error('upstream unauthorized'));
      const result = await backend.getHistoricalAlerts(
        ctx,
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
      searcher.mockRejectedValueOnce(new Error('workspace offline'));
      const result = await backend.getHistoricalAlerts(
        ctx,
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
