/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  LIVE_NO_EMIT,
  buildLiveQueries,
  extractScalar,
  formatSamples,
  liveKindFor,
} from '../suggest_live_queries';
import type { Suggestion, SuggestionKind } from '../suggest_engine';

function fakeSuggestion(
  kindId: SuggestionKind,
  overrides: Partial<{
    service: string;
    dimensions: Array<{ name: string; value: string }>;
  }> = {}
): Suggestion {
  const service = overrides.service ?? 'cart';
  return {
    key: `${kindId}:${service}`,
    kindId,
    kind: kindId,
    reason: '',
    sourceMetric: 'metric',
    detected: {},
    estimatedRuleCount: 13,
    input: {
      spec: {
        datasourceId: 'ds-1',
        name: 'test',
        enabled: true,
        mode: 'active',
        service,
        owner: { teams: ['t'] },
        sli: {
          type: 'single',
          definition: {
            backend: 'prometheus',
            type: 'availability',
            calcMethod: 'events',
            metric: 'm',
          },
          dimensions: overrides.dimensions ?? [],
        },
        objectives: [{ name: 'o', target: 0.99 }],
        budgetWarningThresholds: [],
        window: { type: 'rolling', duration: '28d' },
        alerting: { strategy: 'mwmbr', burnRates: [] },
        alarms: {
          sliHealth: { enabled: false },
          attainmentBreach: { enabled: false },
          budgetWarning: { enabled: true },
          noData: { enabled: false, forDuration: '10m' },
          resolved: { enabled: false },
        },
        exclusionWindows: [],
        labels: {},
        annotations: {},
      },
    },
  };
}

describe('liveKindFor', () => {
  it('returns the suggestion kindId verbatim', () => {
    expect(liveKindFor(fakeSuggestion('apm-availability'))).toBe('apm-availability');
  });
});

describe('buildLiveQueries', () => {
  it('apm-availability returns ratio + samples + p99 over the span-derived selector', () => {
    const [ratio, samples, p99] = buildLiveQueries(
      'apm-availability',
      fakeSuggestion('apm-availability', { service: 'cart' }),
      '24h'
    );
    expect(ratio).toContain('service="cart"');
    expect(ratio).toContain('namespace="span_derived"');
    expect(samples).toContain(
      'sum_over_time(request{service="cart",remoteService="",namespace="span_derived"}[24h])'
    );
    expect(p99).toContain('histogram_quantile(0.99');
  });

  it('apm-latency emits LIVE_NO_EMIT for ratio (gauge buckets are not cumulative)', () => {
    const [ratio, ,] = buildLiveQueries(
      'apm-latency',
      fakeSuggestion('apm-latency', { service: 'cart' }),
      '1h'
    );
    expect(ratio).toBe(LIVE_NO_EMIT);
  });

  it('http-availability uses the dimension stamped by the engine', () => {
    const s = fakeSuggestion('http-availability', {
      service: 'cart',
      dimensions: [{ name: 'service_name', value: 'cart' }],
    });
    const [ratio] = buildLiveQueries('http-availability', s, '1h');
    expect(ratio).toContain('service_name="cart"');
    expect(ratio).toContain('http_response_status_code!~"5..');
  });

  it('http-availability falls back to service_name from spec.service when no dimensions are set', () => {
    const s = fakeSuggestion('http-availability', { service: 'cart', dimensions: [] });
    const [ratio] = buildLiveQueries('http-availability', s, '1h');
    expect(ratio).toContain('service_name="cart"');
  });

  it('http-latency emits LIVE_NO_EMIT for ratio', () => {
    const s = fakeSuggestion('http-latency', {
      service: 'cart',
      dimensions: [{ name: 'job', value: 'opentelemetry-demo/cart' }],
    });
    const [ratio, samples, p99] = buildLiveQueries('http-latency', s, '7d');
    expect(ratio).toBe(LIVE_NO_EMIT);
    expect(p99).toContain('http_server_request_duration_seconds_bucket');
    expect(samples).toContain('http_server_request_duration_seconds_count');
    expect(p99).toContain('job="opentelemetry-demo/cart"');
  });

  it('rpc-availability uses rpc_service selector', () => {
    const [ratio] = buildLiveQueries(
      'rpc-availability',
      fakeSuggestion('rpc-availability', { service: 'flagd' }),
      '1h'
    );
    expect(ratio).toContain('rpc_service="flagd"');
    expect(ratio).toContain('rpc_grpc_status_code="0"');
  });

  it('rpc-latency emits no-emit ratio + p99 over rpc bucket', () => {
    const [ratio, , p99] = buildLiveQueries(
      'rpc-latency',
      fakeSuggestion('rpc-latency', { service: 'flagd' }),
      '24h'
    );
    expect(ratio).toBe(LIVE_NO_EMIT);
    expect(p99).toContain('rpc_server_duration_seconds_bucket');
  });

  it('db-latency emits no-emit ratio and a db p99', () => {
    const [ratio, , p99] = buildLiveQueries(
      'db-latency',
      fakeSuggestion('db-latency', {
        service: 'svc',
        dimensions: [{ name: 'service_name', value: 'svc' }],
      }),
      '1h'
    );
    expect(ratio).toBe(LIVE_NO_EMIT);
    expect(p99).toContain('db_client_operation_duration_seconds_bucket');
  });

  it('messaging-latency emits no-emit ratio and a messaging p99', () => {
    const [ratio, , p99] = buildLiveQueries(
      'messaging-latency',
      fakeSuggestion('messaging-latency', {
        service: 'svc',
        dimensions: [{ name: 'service_name', value: 'svc' }],
      }),
      '1h'
    );
    expect(ratio).toBe(LIVE_NO_EMIT);
    expect(p99).toContain('messaging_process_duration_seconds_bucket');
  });

  it('genai-availability emits ratio + p99', () => {
    const [ratio, , p99] = buildLiveQueries(
      'genai-availability',
      fakeSuggestion('genai-availability', {
        service: 'svc',
        dimensions: [{ name: 'service_name', value: 'svc' }],
      }),
      '1h'
    );
    expect(ratio).toContain('error_type=""');
    expect(p99).toContain('gen_ai_client_operation_duration_seconds_bucket');
  });
});

describe('extractScalar', () => {
  it('returns undefined for non-objects', () => {
    expect(extractScalar(null)).toBeUndefined();
    expect(extractScalar(42)).toBeUndefined();
  });

  it('reads the first row of a Value field (data-frame shape)', () => {
    const resp = { fields: [{ name: 'Value', values: ['0.42'] }] };
    expect(extractScalar(resp)).toBe(0.42);
  });

  it('falls back to data.result[0].value[1] (prometheus instant query)', () => {
    const resp = { data: { result: [{ value: [123, '0.99'] }] } };
    expect(extractScalar(resp)).toBe(0.99);
  });

  it('honors top-level result array as well', () => {
    const resp = { result: [{ value: [123, '7'] }] };
    expect(extractScalar(resp)).toBe(7);
  });

  it('reads meta.instantData.rows[0].Value when other shapes are absent', () => {
    const resp = { meta: { instantData: { rows: [{ Value: '0.5' }] } } };
    expect(extractScalar(resp)).toBe(0.5);
  });

  it('returns undefined for non-finite values', () => {
    expect(extractScalar({ fields: [{ name: 'Value', values: ['nope'] }] })).toBeUndefined();
  });

  it('returns undefined when no shape matches', () => {
    expect(extractScalar({})).toBeUndefined();
    expect(extractScalar({ fields: [{ name: 'NotValue', values: ['1'] }] })).toBeUndefined();
  });
});

describe('formatSamples', () => {
  it('formats millions with M suffix', () => {
    expect(formatSamples(1_500_000)).toBe('1.5M');
  });

  it('strips trailing .0 in the M form', () => {
    expect(formatSamples(2_000_000)).toBe('2M');
  });

  it('formats thousands with k suffix', () => {
    expect(formatSamples(2_500)).toBe('2.5k');
  });

  it('rounds smaller values', () => {
    expect(formatSamples(123.4)).toBe('123');
  });
});
