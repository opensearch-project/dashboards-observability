/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DEFAULT_MODEL,
  isModelComplete,
  parsePromQL,
  PromQLModel,
  serializePromQL,
} from '../promql_builder';

function model(overrides: Partial<PromQLModel> = {}): PromQLModel {
  return { ...DEFAULT_MODEL, ...overrides };
}

describe('serializePromQL', () => {
  it('returns empty string with no metric', () => {
    expect(serializePromQL(model({ metric: '' }))).toBe('');
  });

  it('builds sum(rate(metric[window]))', () => {
    expect(serializePromQL(model({ metric: 'http_requests_total' }))).toBe(
      'sum(rate(http_requests_total[5m]))'
    );
  });

  it('renders label filters with operators and quoting', () => {
    const q = serializePromQL(
      model({
        metric: 'http_requests_total',
        filters: [
          { label: 'service', op: '=', value: 'my-api' },
          { label: 'status_code', op: '=~', value: '5..' },
        ],
      })
    );
    expect(q).toBe('sum(rate(http_requests_total{service="my-api", status_code=~"5.."}[5m]))');
  });

  it('renders a by() clause', () => {
    expect(serializePromQL(model({ metric: 'm', agg: 'sum', by: ['service', 'le'] }))).toBe(
      'sum by (service, le)(rate(m[5m]))'
    );
  });

  it('omits rate() for gauges', () => {
    expect(serializePromQL(model({ metric: 'up', rate: false, agg: 'none' }))).toBe('up');
  });

  it('renders a subtract term sharing the main agg/rate/window', () => {
    const q = serializePromQL(
      model({
        metric: 'request',
        rate: false,
        agg: 'sum',
        filters: [{ label: 'service', op: '=', value: 'frontend' }],
        subtract: { metric: 'fault', filters: [{ label: 'service', op: '=', value: 'frontend' }] },
      })
    );
    expect(q).toBe('sum(request{service="frontend"}) - sum(fault{service="frontend"})');
  });

  it('ignores an empty subtract term', () => {
    expect(
      serializePromQL(
        model({ metric: 'request', rate: false, agg: 'sum', subtract: { metric: '', filters: [] } })
      )
    ).toBe('sum(request)');
  });

  it('escapes quotes and backslashes in values', () => {
    expect(
      serializePromQL(
        model({
          metric: 'm',
          agg: 'none',
          rate: false,
          filters: [{ label: 'p', op: '=', value: 'a"b\\c' }],
        })
      )
    ).toBe('m{p="a\\"b\\\\c"}');
  });
});

describe('isModelComplete', () => {
  it('rejects an invalid metric name', () => {
    expect(isModelComplete(model({ metric: '1bad' }))).toBe(false);
  });
  it('rejects an empty filter value', () => {
    expect(
      isModelComplete(model({ metric: 'm', filters: [{ label: 'x', op: '=', value: '' }] }))
    ).toBe(false);
  });
  it('rejects a bad rate window', () => {
    expect(isModelComplete(model({ metric: 'm', rate: true, window: 'xx' }))).toBe(false);
  });
  it('accepts a complete model', () => {
    expect(isModelComplete(model({ metric: 'http_requests_total' }))).toBe(true);
  });
});

describe('parsePromQL', () => {
  it('returns null on empty input', () => {
    expect(parsePromQL('   ')).toBeNull();
  });

  it('parses sum(rate(metric[5m]))', () => {
    expect(parsePromQL('sum(rate(http_requests_total[5m]))')).toEqual(
      model({ metric: 'http_requests_total', agg: 'sum', rate: true, window: '5m' })
    );
  });

  it('parses label filters with mixed operators', () => {
    expect(
      parsePromQL('sum(rate(http_requests_total{service="my-api", status_code=~"5.."}[5m]))')
    ).toEqual(
      model({
        metric: 'http_requests_total',
        agg: 'sum',
        filters: [
          { label: 'service', op: '=', value: 'my-api' },
          { label: 'status_code', op: '=~', value: '5..' },
        ],
      })
    );
  });

  it('parses a by() clause', () => {
    const parsed = parsePromQL('sum by (service, le)(rate(m[1m]))');
    expect(parsed?.by).toEqual(['service', 'le']);
    expect(parsed?.window).toBe('1m');
  });

  it('parses a bare selector (no rate, no agg)', () => {
    expect(parsePromQL('up{job="api"}')).toEqual(
      model({
        metric: 'up',
        rate: false,
        agg: 'none',
        filters: [{ label: 'job', op: '=', value: 'api' }],
      })
    );
  });

  it('returns null for shapes the builder cannot represent', () => {
    // Division of two vectors is not a single-selector shape.
    expect(parsePromQL('sum(rate(a[5m])) / sum(rate(b[5m]))')).toBeNull();
    // histogram_quantile is outside the supported op set.
    expect(parsePromQL('histogram_quantile(0.95, sum(rate(m[5m])))')).toBeNull();
  });

  it('parses a difference-of-sums into main + subtract terms', () => {
    // The apm-service-availability template default: good = request - fault.
    const q =
      'sum(request{service="frontend", remoteService="", namespace="span_derived"}) - ' +
      'sum(fault{service="frontend", remoteService="", namespace="span_derived"})';
    const parsed = parsePromQL(q);
    expect(parsed).not.toBeNull();
    expect(parsed!.metric).toBe('request');
    expect(parsed!.agg).toBe('sum');
    expect(parsed!.rate).toBe(false);
    expect(parsed!.subtract).toEqual({
      metric: 'fault',
      filters: [
        { label: 'service', op: '=', value: 'frontend' },
        { label: 'remoteService', op: '=', value: '' },
        { label: 'namespace', op: '=', value: 'span_derived' },
      ],
    });
  });

  it('rejects two terms with mismatched aggregation shape', () => {
    // Different agg → not representable under one shared set of controls.
    expect(parsePromQL('sum(a) - avg(b)')).toBeNull();
    // Different rate window → likewise.
    expect(parsePromQL('sum(rate(a[5m])) - sum(rate(b[1m]))')).toBeNull();
  });

  it('rejects trailing arithmetic that is not a clean subtraction', () => {
    expect(parsePromQL('sum(rate(a[5m])) + 1')).toBeNull();
  });

  it('does not mistake a metric literally named sum/count for an aggregation', () => {
    // `count` as a bare metric name (no parens) parses as a selector.
    expect(parsePromQL('count{job="api"}')).toEqual(
      model({
        metric: 'count',
        rate: false,
        agg: 'none',
        filters: [{ label: 'job', op: '=', value: 'api' }],
      })
    );
  });

  it('keeps a `)` inside a label value from closing the group early', () => {
    expect(parsePromQL('sum(rate(http_requests_total{path=~"/a(b)c"}[5m]))')).toEqual(
      model({
        metric: 'http_requests_total',
        agg: 'sum',
        filters: [{ label: 'path', op: '=~', value: '/a(b)c' }],
      })
    );
  });

  it('round-trips representative SLI queries', () => {
    const samples = [
      'sum(rate(http_requests_total[5m]))',
      'sum(rate(http_requests_total{service="my-api", status_code!~"5.."}[5m]))',
      'avg by (le)(rate(latency_bucket{job="api"}[1m]))',
      'up{job="api"}',
      'sum(request{service="frontend"}) - sum(fault{service="frontend"})',
    ];
    for (const q of samples) {
      const parsed = parsePromQL(q);
      expect(parsed).not.toBeNull();
      expect(serializePromQL(parsed!)).toBe(q);
    }
  });
});
