/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  buildCoverageProbeQuery,
  buildErrorRatioExprForWindow,
  buildErrorRatioQuery,
  buildGoodEventsCountQuery,
  buildLatencyPercentileQuery,
  buildRequestRateQuery,
  buildSelectors,
  buildTotalEventsCountQuery,
  buildWindowErrorRatioQuery,
} from '../slo_query_builders';
import { validateCustomPromQL } from '../../../../../../common/slo/slo_validators';
import type { Objective, SloDocument } from '../../../../../../common/slo/slo_types';

const OBJ: Objective = { name: 'obj-1', target: 0.99 };

function availabilityDoc(overrides: Partial<SloDocument['spec']> = {}): SloDocument {
  return {
    id: 'slo-1',
    spec: {
      datasourceId: 'ds-1',
      name: 'avail',
      enabled: true,
      mode: 'active',
      service: 'api',
      owner: { teams: ['t'] },
      sli: {
        type: 'single',
        definition: {
          backend: 'prometheus',
          type: 'availability',
          calcMethod: 'events',
          metric: 'http_requests_total',
          goodEventsFilter: 'status_code!~"5.."',
        },
        dimensions: [
          { name: 'service', value: 'api' },
          { name: 'route', value: '/v1/users' },
        ],
      },
      objectives: [OBJ],
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
      ...overrides,
    },
    status: {
      version: 1,
      createdAt: '2026-04-01T00:00:00Z',
      createdBy: 't',
      updatedAt: '2026-04-01T00:00:00Z',
      updatedBy: 't',
      provisioning: { backend: 'prometheus', rulerNamespace: 'slo-generated' },
    },
  };
}

function latencyDoc(overrides: Partial<SloDocument['spec']> = {}): SloDocument {
  const base = availabilityDoc(overrides);
  base.spec.sli = {
    type: 'single',
    definition: {
      backend: 'prometheus',
      type: 'latency_threshold',
      calcMethod: 'events',
      metric: 'http_server_request_duration_seconds_bucket',
      latencyThresholdUnit: 'seconds',
    },
    dimensions: [{ name: 'service_name', value: 'api' }],
  };
  base.spec.objectives = [{ name: 'obj-1', target: 0.95, latencyThreshold: 0.5 }];
  return base;
}

function customDoc(
  customExpr:
    | { mode: 'events'; goodQuery: string; totalQuery: string }
    | { mode: 'raw'; errorRatioQuery: string }
    | undefined
): SloDocument {
  const base = availabilityDoc();
  base.spec.sli = {
    type: 'single',
    definition: {
      backend: 'prometheus',
      type: 'custom',
      calcMethod: 'events',
      customExpr,
    },
    dimensions: [],
  };
  return base;
}

describe('buildSelectors', () => {
  it('joins dimensions with comma-space and quotes', () => {
    const out = buildSelectors(availabilityDoc(), false);
    expect(out).toBe('service="api", route="/v1/users"');
  });

  it('appends goodEventsFilter when includeGoodFilter is true', () => {
    const out = buildSelectors(availabilityDoc(), true);
    expect(out).toContain('status_code!~"5.."');
  });

  it('escapes backslashes and double quotes inside dimension values', () => {
    const doc = availabilityDoc();
    if (doc.spec.sli.type === 'single') {
      doc.spec.sli.dimensions = [{ name: 'p', value: 'a"b\\c' }];
    }
    const out = buildSelectors(doc, false);
    expect(out).toBe('p="a\\"b\\\\c"');
  });

  it('returns empty string for composite SLI (covers the early-out)', () => {
    const doc = availabilityDoc();
    // @ts-expect-error covering the non-single branch
    doc.spec.sli = { type: 'composite' };
    expect(buildSelectors(doc, true)).toBe('');
  });
});

describe('buildErrorRatioExprForWindow / buildErrorRatioQuery', () => {
  it('availability path emits 1 - rate(good)/rate(total) over the window', () => {
    const out = buildErrorRatioExprForWindow(availabilityDoc(), OBJ, '5m')!;
    expect(out).toContain('1 - (');
    expect(out).toContain('rate(http_requests_total{');
    expect(out).toContain('status_code!~"5..');
    expect(out).toContain('[5m]');
    expect(validateCustomPromQL(out)).toBeNull();
  });

  it('coerces non-_total counters to a _count form', () => {
    const doc = availabilityDoc({
      sli: {
        type: 'single',
        definition: {
          backend: 'prometheus',
          type: 'availability',
          calcMethod: 'events',
          metric: 'http_server_request_duration_seconds_count',
          goodEventsFilter: 'status_code!~"5.."',
        },
        dimensions: [{ name: 'service_name', value: 'api' }],
      },
    });
    const out = buildErrorRatioExprForWindow(doc, OBJ, '5m')!;
    expect(out).toContain('rate(http_server_request_duration_seconds_count{');
  });

  it('latency_threshold path emits le="<value>" + le="+Inf" buckets', () => {
    const doc = latencyDoc();
    const out = buildErrorRatioExprForWindow(doc, doc.spec.objectives[0], '5m')!;
    expect(out).toContain('http_server_request_duration_seconds_bucket{');
    expect(out).toContain('le="0.5"');
    expect(out).toContain('le="+Inf"');
  });

  it('latency_threshold honors millisecond units (converts to seconds in `le`)', () => {
    const doc = latencyDoc();
    if (doc.spec.sli.type === 'single' && doc.spec.sli.definition.backend === 'prometheus') {
      (doc.spec.sli.definition as { latencyThresholdUnit?: string }).latencyThresholdUnit =
        'milliseconds';
    }
    doc.spec.objectives = [{ name: 'obj', target: 0.95, latencyThreshold: 250 }];
    const out = buildErrorRatioExprForWindow(doc, doc.spec.objectives[0], '5m')!;
    expect(out).toContain('le="0.25"');
  });

  it('custom mode raw returns the user-supplied errorRatioQuery verbatim', () => {
    const doc = customDoc({ mode: 'raw', errorRatioQuery: '1 - vector(0.99)' });
    expect(buildErrorRatioExprForWindow(doc, OBJ, '5m')).toBe('1 - vector(0.99)');
  });

  it('custom mode events wraps each side in parens to dodge / vs - precedence', () => {
    const doc = customDoc({
      mode: 'events',
      goodQuery: 'sum(request) - sum(fault)',
      totalQuery: 'sum(request)',
    });
    const out = buildErrorRatioExprForWindow(doc, OBJ, '5m')!;
    // Outer wrap so the operator-intended (good)/(total) parses correctly.
    expect(out).toBe('1 - ((sum(request) - sum(fault)) / (sum(request)))');
    expect(validateCustomPromQL(out)).toBeNull();
  });

  it('returns null for custom SLI without an expression', () => {
    expect(buildErrorRatioExprForWindow(customDoc(undefined), OBJ, '5m')).toBeNull();
  });

  it('returns null for missing metric on availability', () => {
    const doc = availabilityDoc({
      sli: {
        type: 'single',
        definition: {
          backend: 'prometheus',
          type: 'availability',
          calcMethod: 'events',
          goodEventsFilter: 'x="y"',
        },
        dimensions: [],
      },
    });
    expect(buildErrorRatioExprForWindow(doc, OBJ, '5m')).toBeNull();
  });

  it('returns null for non-prometheus backends', () => {
    const doc = availabilityDoc();
    if (doc.spec.sli.type === 'single') {
      // @ts-expect-error stub the unsupported branch
      doc.spec.sli.definition = { backend: 'opensearch' };
    }
    expect(buildErrorRatioExprForWindow(doc, OBJ, '5m')).toBeNull();
  });

  it('returns null for composite SLI', () => {
    const doc = availabilityDoc();
    // @ts-expect-error
    doc.spec.sli = { type: 'composite' };
    expect(buildErrorRatioExprForWindow(doc, OBJ, '5m')).toBeNull();
  });

  it('buildErrorRatioQuery is buildErrorRatioExprForWindow with 5m', () => {
    const doc = availabilityDoc();
    expect(buildErrorRatioQuery(doc, OBJ)).toBe(buildErrorRatioExprForWindow(doc, OBJ, '5m'));
  });
});

describe('buildGoodEventsCountQuery / buildTotalEventsCountQuery', () => {
  it('availability emits sum(increase(<counter>{good}[w])) for good and {dim}[w] for total', () => {
    const doc = availabilityDoc();
    expect(buildGoodEventsCountQuery(doc, OBJ, '5m')).toBe(
      'sum(increase(http_requests_total{service="api", route="/v1/users", status_code!~"5.."}[5m]))'
    );
    expect(buildTotalEventsCountQuery(doc, OBJ, '5m')).toBe(
      'sum(increase(http_requests_total{service="api", route="/v1/users"}[5m]))'
    );
  });

  it('latency emits le-bounded good count and le="+Inf" total', () => {
    const doc = latencyDoc();
    const obj = doc.spec.objectives[0];
    expect(buildGoodEventsCountQuery(doc, obj, '5m')).toContain('le="0.5"');
    expect(buildTotalEventsCountQuery(doc, obj, '5m')).toContain('le="+Inf"');
  });

  it('returns null for custom (cannot emit a count)', () => {
    const doc = customDoc({
      mode: 'events',
      goodQuery: 'sum(request)',
      totalQuery: 'sum(request)',
    });
    expect(buildGoodEventsCountQuery(doc, OBJ, '5m')).toBeNull();
    expect(buildTotalEventsCountQuery(doc, OBJ, '5m')).toBeNull();
  });

  it('returns null for missing metric / non-prom / composite', () => {
    expect(
      buildGoodEventsCountQuery(
        availabilityDoc({
          sli: {
            type: 'single',
            definition: { backend: 'prometheus', type: 'availability', calcMethod: 'events' },
            dimensions: [],
          },
        }),
        OBJ,
        '5m'
      )
    ).toBeNull();

    const composite = availabilityDoc();
    // @ts-expect-error
    composite.spec.sli = { type: 'composite' };
    expect(buildGoodEventsCountQuery(composite, OBJ, '5m')).toBeNull();
    expect(buildTotalEventsCountQuery(composite, OBJ, '5m')).toBeNull();
  });
});

describe('buildCoverageProbeQuery', () => {
  it('availability uses count(last_over_time(<counter>[1h]))', () => {
    const out = buildCoverageProbeQuery(availabilityDoc(), OBJ)!;
    expect(out).toBe(
      'count(last_over_time(http_requests_total{service="api", route="/v1/users"}[1h]))'
    );
  });

  it('latency uses count(last_over_time(<bucket>{... le="+Inf"}[1h]))', () => {
    const out = buildCoverageProbeQuery(latencyDoc(), OBJ)!;
    expect(out).toContain('http_server_request_duration_seconds_bucket{');
    expect(out).toContain('le="+Inf"');
  });

  it('custom raw uses (max_over_time((<errorRatio>)[1h:5m])) > 0', () => {
    const doc = customDoc({ mode: 'raw', errorRatioQuery: '1 - vector(0.99)' });
    const out = buildCoverageProbeQuery(doc, OBJ)!;
    expect(out).toBe('(max_over_time((1 - vector(0.99))[1h:5m])) > 0');
  });

  it('custom events uses the totalQuery', () => {
    const doc = customDoc({
      mode: 'events',
      goodQuery: 'sum(g)',
      totalQuery: 'sum(t)',
    });
    expect(buildCoverageProbeQuery(doc, OBJ)).toBe('(max_over_time((sum(t))[1h:5m])) > 0');
  });

  it('returns null for custom without an expression', () => {
    expect(buildCoverageProbeQuery(customDoc(undefined), OBJ)).toBeNull();
  });

  it('returns null for non-prom and composite', () => {
    const composite = availabilityDoc();
    // @ts-expect-error
    composite.spec.sli = { type: 'composite' };
    expect(buildCoverageProbeQuery(composite, OBJ)).toBeNull();
  });
});

describe('buildRequestRateQuery', () => {
  it('availability emits sum(rate(counter{dim}[5m]))', () => {
    expect(buildRequestRateQuery(availabilityDoc())).toContain('rate(http_requests_total{');
  });

  it('latency emits the bucket rate scoped to le="+Inf"', () => {
    const out = buildRequestRateQuery(latencyDoc())!;
    expect(out).toContain('http_server_request_duration_seconds_bucket{');
    expect(out).toContain('le="+Inf"');
  });

  it('returns null for custom and non-single SLI', () => {
    expect(buildRequestRateQuery(customDoc({ mode: 'raw', errorRatioQuery: 'foo' }))).toBeNull();
    const composite = availabilityDoc();
    // @ts-expect-error
    composite.spec.sli = { type: 'composite' };
    expect(buildRequestRateQuery(composite)).toBeNull();
  });
});

describe('buildLatencyPercentileQuery', () => {
  it('emits histogram_quantile with the given q', () => {
    const out = buildLatencyPercentileQuery(latencyDoc(), 0.95)!;
    expect(out).toContain('histogram_quantile(0.95');
    expect(out).toContain('by (le)');
  });

  it('returns null for non-latency SLIs', () => {
    expect(buildLatencyPercentileQuery(availabilityDoc(), 0.99)).toBeNull();
  });
});

describe('buildWindowErrorRatioQuery', () => {
  it('uses the SLO window duration on rolling windows', () => {
    const doc = availabilityDoc({
      window: { type: 'rolling', duration: '7d' },
    });
    const out = buildWindowErrorRatioQuery(doc, doc.spec.objectives[0])!;
    expect(out).toContain('[7d]');
  });

  it('returns null for non-rolling windows', () => {
    const doc = availabilityDoc();
    // @ts-expect-error stub the calendar branch
    doc.spec.window = { type: 'calendar' };
    expect(buildWindowErrorRatioQuery(doc, OBJ)).toBeNull();
  });
});
