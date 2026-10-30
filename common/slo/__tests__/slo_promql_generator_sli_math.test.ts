/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SLI math shared by the recording rules, the probe, the inline status
 * fallback and the detail-page charts (`buildSliEventQueries`). Pins the
 * shapes that keep an SLO reporting a real value whenever its source metric
 * is reporting: delta (span-derived) metrics summed over the window,
 * `{{.window}}` substitution in custom queries, the upgrade of legacy
 * instant span-derived queries, the `or vector(0)` good-side guard, and
 * format-tolerant `le` matching.
 */

import {
  RECORDING_WINDOWS,
  SLO_RULES_VERSION,
  SLO_RULES_VERSION_LABEL,
  buildErrorRatioExpr,
  buildProbeQueries,
  buildSliEventQueries,
  buildSourceTrafficQuery,
  effectiveMetricTemporality,
  generateRecordingGroupForFingerprint,
  generateSloRuleGroup,
  leValuePattern,
  perRangeBoundsUnder,
} from '../slo_promql_generator';
import { computeSliFingerprint } from '../slo_sli_fingerprint';
import type { Objective, PrometheusSli, SingleSli, SloDocument } from '../slo_types';

const SPAN = [
  { name: 'service', value: 'checkout' },
  { name: 'remoteService', value: '' },
  { name: 'namespace', value: 'span_derived' },
];
const SEL = 'service="checkout",remoteService="",namespace="span_derived"';

function sli(definition: Partial<PrometheusSli>, dimensions = SPAN): SingleSli {
  return {
    type: 'single',
    definition: {
      backend: 'prometheus',
      calcMethod: 'events',
      type: 'availability',
      ...definition,
    },
    dimensions,
  } as SingleSli;
}

const avail: Objective = { name: 'avail', target: 0.99 };
const lat: Objective = { name: 'lat', target: 0.95, latencyThreshold: 0.5 };

/** Evaluate `le` regex alternatives the way RE2 would (anchored, full match). */
function leMatches(expr: string, le: string): boolean {
  const m = expr.match(/le=~"([^"]*)"/);
  if (!m) return false;
  const re = new RegExp(`^(?:${m[1].replace(/\\\\/g, '\\')})$`);
  return re.test(le);
}

describe('leValuePattern', () => {
  it.each([
    [0.5, ['0.5', '0.50', '0.500', '.5'], ['0.05', '0.55', '5', '00.5']],
    [1, ['1', '1.0', '1.00'], ['10', '0.1', '1.5']],
    [0, ['0', '0.0'], ['0.005']],
    [2.5, ['2.5', '2.50'], ['25', '2.05']],
  ])('matches %p however the producer formats it', (seconds, yes, no) => {
    const expr = `x{le=~"${leValuePattern(seconds as number)}"}`;
    for (const v of yes as string[]) expect(leMatches(expr, v)).toBe(true);
    for (const v of no as string[]) expect(leMatches(expr, v)).toBe(false);
  });
});

describe('effectiveMetricTemporality', () => {
  it('treats span-derived SLIs as delta and others as cumulative', () => {
    expect(effectiveMetricTemporality(sli({ metric: 'request' }))).toBe('delta');
    expect(
      effectiveMetricTemporality(sli({ metric: 'x_total' }, [{ name: 'job', value: 'a' }]))
    ).toBe('cumulative');
  });

  it('lets an explicit metricTemporality win', () => {
    expect(effectiveMetricTemporality(sli({ metricTemporality: 'cumulative' }))).toBe('cumulative');
    expect(
      effectiveMetricTemporality(sli({ metricTemporality: 'delta' }, [{ name: 'job', value: 'a' }]))
    ).toBe('delta');
  });
});

describe('buildSliEventQueries — cumulative metrics', () => {
  const dims = [{ name: 'job', value: 'api' }];

  it('availability: rate over the window with an `or vector(0)` good side', () => {
    const q = buildSliEventQueries(
      sli({ metric: 'http_requests_total', goodEventsFilter: 'code!~"5.."' }, dims),
      avail,
      '1h'
    );
    expect(q).toEqual({
      good: 'sum(rate(http_requests_total{job="api", code!~"5.."}[1h])) or vector(0)',
      total: 'sum(rate(http_requests_total{job="api"}[1h]))',
    });
  });

  it('availability in count mode uses increase', () => {
    const q = buildSliEventQueries(sli({ metric: 'x_total' }, dims), avail, '1h', 'count');
    expect(q).toEqual({
      good: 'sum(increase(x_total{job="api"}[1h])) or vector(0)',
      total: 'sum(increase(x_total{job="api"}[1h]))',
    });
  });

  it('latency: tolerant le at the threshold over the +Inf bucket', () => {
    const q = buildSliEventQueries(
      sli({ type: 'latency_threshold', metric: 'http_server_duration_seconds' }, dims),
      lat,
      '5m'
    ) as { good: string; total: string };
    expect(q.good).toBe(
      '(sum(rate(http_server_duration_seconds_bucket{job="api", le=~"0?\\\\.50*"}[5m])) or ' +
        'sum(rate(http_server_duration_seconds_bucket{job="api", le=~"500(\\\\.0*)?"}[5m])))'
    );
    expect(q.total).toBe(
      'sum(rate(http_server_duration_seconds_bucket{job="api", le="+Inf"}[5m]))'
    );
  });

  it('falls back to millisecond bounds for a `_seconds` histogram that reports milliseconds', () => {
    const q = buildSliEventQueries(
      sli({ type: 'latency_threshold', metric: 'http_server_request_duration_seconds' }, dims),
      lat,
      '5m'
    ) as { good: string };
    // Left side matches a real seconds histogram (`le="0.5"`); the right side
    // only applies when that is empty — e.g. bounds 0, 5, 10, …, 500, … 10000.
    const [left, right] = q.good.slice(1, -1).split(' or ');
    expect(leMatches(left, '0.5')).toBe(true);
    expect(leMatches(right, '500.0')).toBe(true);
    expect(leMatches(right, '5000.0')).toBe(false);
  });

  it('omits the dangling comma when the SLI has no dimensions', () => {
    const q = buildSliEventQueries(sli({ metric: 'x_total' }, []), avail, '5m') as {
      total: string;
    };
    expect(q.total).toBe('sum(rate(x_total{}[5m]))');
  });
});

describe('buildSliEventQueries — per-range bucket layout', () => {
  const dims = [{ name: 'service_name', value: 'checkout' }];
  const OTEL_MS_BOUNDS = [0, 5, 10, 25, 50, 75, 100, 250, 500, 750, 1000, 2500, 5000, 7500, 10000];
  const perRangeSli = (extra: Partial<PrometheusSli>) =>
    sli(
      {
        type: 'latency_threshold',
        metric: 'http_server_request_duration_seconds_bucket',
        bucketLayout: 'per_range',
        bucketBounds: OTEL_MS_BOUNDS,
        ...extra,
      },
      dims
    );

  it('sums every bucket at or under the threshold over _count, with rate()', () => {
    const q = buildSliEventQueries(perRangeSli({ bucketUnit: 'milliseconds' }), lat, '5m') as {
      good: string;
      total: string;
    };
    // 500 ms threshold on millisecond bounds: 0 … 500 are good, 750 is not.
    for (const le of ['0', '5.0', '100', '250.0', '500']) expect(leMatches(q.good, le)).toBe(true);
    for (const le of ['750', '1000', '+Inf']) expect(leMatches(q.good, le)).toBe(false);
    expect(q.good.startsWith('sum(rate(http_server_request_duration_seconds_bucket{')).toBe(true);
    expect(q.good.endsWith(' or vector(0)')).toBe(true);
    expect(q.total).toBe(
      'sum(rate(http_server_request_duration_seconds_count{service_name="checkout"}[5m]))'
    );
  });

  it('reads counts with increase() in count mode', () => {
    const q = buildSliEventQueries(
      perRangeSli({ bucketUnit: 'milliseconds' }),
      lat,
      '1h',
      'count'
    ) as { total: string };
    expect(q.total).toBe(
      'sum(increase(http_server_request_duration_seconds_count{service_name="checkout"}[1h]))'
    );
  });

  it('takes the bounds as seconds when the probe says so — never as milliseconds', () => {
    // The flagd shape: seconds observations, bounds 0, 5, 10 … — only 0 is
    // under 0.5 s, and 500 (seconds) must never be read as 500 ms.
    expect(perRangeBoundsUnder(OTEL_MS_BOUNDS, 'seconds', 0.5)).toEqual([0]);
    const q = buildSliEventQueries(perRangeSli({ bucketUnit: 'seconds' }), lat, '5m') as {
      good: string;
    };
    expect(leMatches(q.good, '0')).toBe(true);
    expect(leMatches(q.good, '500')).toBe(false);
    expect(leMatches(q.good, '5')).toBe(false);
  });

  it('a delta (span-derived) SLI keeps the delta math', () => {
    const q = buildSliEventQueries(
      sli({
        type: 'latency_threshold',
        metric: 'latency_seconds_bucket',
        bucketLayout: 'per_range',
        bucketBounds: [0.1, 0.5],
        bucketUnit: 'seconds',
      }),
      lat,
      '5m'
    ) as { good: string };
    expect(q.good).toContain('sum_over_time(');
  });
});

describe('buildSliEventQueries — explicit bucket unit (cumulative)', () => {
  const dims = [{ name: 'job', value: 'api' }];
  it('reads the one bucket at the threshold in that unit, without the millisecond fallback', () => {
    const seconds = buildSliEventQueries(
      sli({ type: 'latency_threshold', metric: 'x_seconds_bucket', bucketUnit: 'seconds' }, dims),
      lat,
      '5m'
    ) as { good: string };
    expect(seconds.good).not.toContain(' or ');
    expect(leMatches(seconds.good, '0.5')).toBe(true);
    const ms = buildSliEventQueries(
      sli(
        { type: 'latency_threshold', metric: 'x_seconds_bucket', bucketUnit: 'milliseconds' },
        dims
      ),
      lat,
      '5m'
    ) as { good: string };
    expect(leMatches(ms.good, '500')).toBe(true);
    expect(leMatches(ms.good, '0.5')).toBe(false);
  });
});

describe('buildSourceTrafficQuery', () => {
  it('counts observations on a latency SLI source, per temporality', () => {
    expect(
      buildSourceTrafficQuery(
        sli({ type: 'latency_threshold', metric: 'h_seconds_bucket' }, [
          { name: 'job', value: 'api' },
        ]),
        '1h'
      )
    ).toBe('sum(increase(h_seconds_count{job="api"}[1h]))');
    expect(
      buildSourceTrafficQuery(
        sli({ type: 'latency_threshold', metric: 'latency_seconds_bucket' }),
        '1h'
      )
    ).toBe(`sum(sum_over_time(latency_seconds_count{${SEL.replace(/,/g, ', ')}}[1h]))`);
  });

  it('is null for SLIs whose NaN can only mean no traffic', () => {
    expect(buildSourceTrafficQuery(sli({ metric: 'x_total' }), '1h')).toBeNull();
  });
});

describe('buildSliEventQueries — delta (span-derived) metrics', () => {
  it('latency sums every bucket at or under the threshold over the count', () => {
    const q = buildSliEventQueries(
      sli({ type: 'latency_threshold', metric: 'latency_seconds_bucket' }),
      lat,
      '30m'
    ) as { good: string; total: string };
    expect(q.total).toBe(
      `sum(sum_over_time(latency_seconds_count{${SEL.replace(/,/g, ', ')}}[30m]))`
    );
    expect(q.good).toContain('sum(sum_over_time(latency_seconds_bucket{');
    // The span-derived pipeline formats bounds like `1.0`; every bucket
    // <= 0.5 s is "good", nothing above it is.
    for (const le of ['0.0', '0.005', '0.01', '0.1', '0.25', '0.5']) {
      expect(leMatches(q.good, le)).toBe(true);
    }
    for (const le of ['0.75', '1.0', '2.5', '10.0', '+Inf']) {
      expect(leMatches(q.good, le)).toBe(false);
    }
  });

  it('never applies rate() to a delta gauge', () => {
    for (const window of RECORDING_WINDOWS) {
      const expr = buildErrorRatioExpr(
        sli({ type: 'latency_threshold', metric: 'latency_seconds_bucket' }),
        lat,
        window
      );
      expect(expr).not.toMatch(/\brate\(/);
      expect(expr).toContain(`[${window}]`);
    }
  });

  it('availability sums the gauge over the window', () => {
    const q = buildSliEventQueries(sli({ metric: 'request' }), avail, '1d') as { total: string };
    expect(q.total).toBe(
      'sum(sum_over_time(request{service="checkout", remoteService="", namespace="span_derived"}[1d]))'
    );
  });
});

describe('buildSliEventQueries — custom', () => {
  it('substitutes {{.window}} in events and raw mode', () => {
    const events = buildSliEventQueries(
      sli({
        type: 'custom',
        customExpr: {
          mode: 'events',
          goodQuery: 'sum(increase(ok_total[{{.window}}]))',
          totalQuery: 'sum(increase(all_total[{{.window}}]))',
        },
      }),
      avail,
      '6h'
    );
    expect(events).toEqual({
      good: 'sum(increase(ok_total[6h]))',
      total: 'sum(increase(all_total[6h]))',
    });
    const raw = buildSliEventQueries(
      sli({
        type: 'custom',
        customExpr: { mode: 'raw', errorRatioQuery: 'avg_over_time(err_ratio[{{.window}}])' },
      }),
      avail,
      '2h'
    );
    expect(raw).toEqual({ errorRatio: 'avg_over_time(err_ratio[2h])' });
  });

  it('leaves custom queries without the token or span-derived gauges untouched', () => {
    const q = buildSliEventQueries(
      sli({
        type: 'custom',
        customExpr: { mode: 'events', goodQuery: 'sum(up{job="a"})', totalQuery: 'count(up)' },
      }),
      avail,
      '5m'
    );
    expect(q).toEqual({ good: 'sum(up{job="a"})', total: 'count(up)' });
  });

  it('leaves hand-written span-derived queries alone unless they are an exact legacy shape', () => {
    const custom = {
      mode: 'events' as const,
      // Instant reads, span-derived, but not the draft/template shape.
      goodQuery: `sum by (operation) (request{${SEL}}) - sum(fault{${SEL}})`,
      totalQuery: `sum(request{${SEL}})`,
    };
    const q = buildSliEventQueries(sli({ type: 'custom', customExpr: custom }, []), avail, '1h');
    expect(q).toEqual({ good: custom.goodQuery, total: custom.totalQuery });
    // Mismatched selectors between good and total are not the legacy shape either.
    const mismatched = buildSliEventQueries(
      sli(
        {
          type: 'custom',
          customExpr: {
            mode: 'events',
            goodQuery: `sum(request{${SEL}}) - sum(fault{${SEL}})`,
            totalQuery: 'sum(request{service="other",namespace="span_derived"})',
          },
        },
        []
      ),
      avail,
      '1h'
    ) as { good: string };
    expect(mismatched.good).not.toContain('sum_over_time');
  });

  it('upgrades the legacy instant span-derived availability draft to windowed sums', () => {
    const q = buildSliEventQueries(
      sli(
        {
          type: 'custom',
          customExpr: {
            mode: 'events',
            goodQuery: `sum(request{${SEL}}) - sum(fault{${SEL}})`,
            totalQuery: `sum(request{${SEL}})`,
          },
        },
        []
      ),
      avail,
      '3d'
    );
    expect(q).toEqual({
      good: `sum(sum_over_time(request{${SEL}}[3d])) - (sum(sum_over_time(fault{${SEL}}[3d])) or vector(0))`,
      total: `sum(sum_over_time(request{${SEL}}[3d]))`,
    });
  });

  it('upgrades the legacy instant span-derived latency template', () => {
    const q = buildSliEventQueries(
      sli(
        {
          type: 'custom',
          customExpr: {
            mode: 'events',
            goodQuery: `sum(latency_seconds_bucket{${SEL},le="0.5"})`,
            totalQuery: `sum(latency_seconds_bucket{${SEL},le="+Inf"})`,
          },
        },
        []
      ),
      avail,
      '1h'
    ) as { good: string; total: string };
    expect(q.total).toBe(`sum(sum_over_time(latency_seconds_count{${SEL}}[1h]))`);
    expect(q.good).toContain(`sum(sum_over_time(latency_seconds_bucket{${SEL}, le=~"`);
    expect(leMatches(q.good, '0.25')).toBe(true);
    expect(leMatches(q.good, '0.5')).toBe(true);
    expect(leMatches(q.good, '0.75')).toBe(false);
  });
});

describe('recording rules', () => {
  function doc(definition: Partial<PrometheusSli>, objective: Objective): SloDocument {
    return {
      id: 'slo-1',
      spec: {
        datasourceId: 'ds',
        name: 'checkout',
        service: 'checkout',
        enabled: true,
        mode: 'active',
        owner: { teams: [] },
        sli: sli(definition),
        objectives: [objective],
        window: { type: 'rolling', duration: '28d' },
        alerting: { strategy: 'mwmbr', burnRates: [] },
        alarms: {
          sliHealth: { enabled: false },
          attainmentBreach: { enabled: false },
          budgetWarning: { enabled: false },
          noData: { enabled: false, forDuration: '10m' },
        },
        budgetWarningThresholds: [],
        labels: {},
      },
    } as unknown as SloDocument;
  }

  it('stamps the rules version on every recording rule (legacy and dedup shapes)', () => {
    const latencyDef = { type: 'latency_threshold' as const, metric: 'latency_seconds_bucket' };
    const legacy = generateSloRuleGroup(doc(latencyDef, lat));
    const recording = legacy.rules.filter((r) => r.type === 'recording');
    expect(recording).toHaveLength(RECORDING_WINDOWS.length);
    for (const r of recording) expect(r.labels[SLO_RULES_VERSION_LABEL]).toBe(SLO_RULES_VERSION);

    const group = generateRecordingGroupForFingerprint({
      fingerprint: 'fp',
      sli: sli(latencyDef),
      objectiveLatencyThreshold: 0.5,
    });
    for (const r of group!.rules) expect(r.labels[SLO_RULES_VERSION_LABEL]).toBe(SLO_RULES_VERSION);
  });

  it('probe queries are the same good/total the rules record', () => {
    const d = doc({ type: 'latency_threshold', metric: 'latency_seconds_bucket' }, lat);
    expect(buildProbeQueries(d.spec, lat, '5m')).toEqual(
      buildSliEventQueries(d.spec.sli as SingleSli, lat, '5m')
    );
  });
});

describe('fingerprint stability', () => {
  it('an implicit temporality keeps the pre-existing fingerprint', () => {
    const base = sli({ type: 'latency_threshold', metric: 'latency_seconds_bucket' });
    // Pinned: SLOs created before metricTemporality existed must keep their
    // fingerprint so their recording rules (named after it) are found.
    expect(computeSliFingerprint('ds', base, lat)).toBe('4f2ff8eaf96bc75d');
    const explicit = sli({
      type: 'latency_threshold',
      metric: 'latency_seconds_bucket',
      metricTemporality: 'delta',
    });
    expect(computeSliFingerprint('ds', explicit, lat)).not.toBe(
      computeSliFingerprint('ds', base, lat)
    );
  });
  it('a per-range layout (or explicit unit) changes the fingerprint; an unset one does not', () => {
    const cumulative = sli({ type: 'latency_threshold', metric: 'h_seconds_bucket' });
    const perRange = sli({
      type: 'latency_threshold',
      metric: 'h_seconds_bucket',
      bucketLayout: 'per_range',
      bucketBounds: [0.1, 0.5, 1],
      bucketUnit: 'seconds',
    });
    const fp = (x: SingleSli) => computeSliFingerprint('ds', x, lat);
    expect(fp(perRange)).not.toBe(fp(cumulative));
    // Bound order and duplicates don't matter; the bounds themselves do.
    expect(
      fp(sli({ ...perRange.definition, bucketBounds: [1, 0.5, 0.1, 0.5] } as PrometheusSli))
    ).toBe(fp(perRange));
    expect(fp(sli({ ...perRange.definition, bucketBounds: [0.1, 0.5] } as PrometheusSli))).not.toBe(
      fp(perRange)
    );
    expect(
      fp(sli({ type: 'latency_threshold', metric: 'h_seconds_bucket', bucketUnit: 'seconds' }))
    ).not.toBe(fp(cumulative));
  });
});
