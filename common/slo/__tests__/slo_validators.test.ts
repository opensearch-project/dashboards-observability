/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { validateSloSpec, validateSloId } from '../slo_validators';
import { DEFAULT_MWMBR_TIERS } from '../slo_promql_generator';
import type { SloSpec } from '../slo_types';

function minimalSpec(overrides: Partial<SloSpec> = {}): Partial<SloSpec> {
  return {
    datasourceId: 'prom-ds-001',
    name: 'API Availability',
    enabled: true,
    mode: 'active',
    service: 'api-gateway',
    owner: { teams: ['platform'] },
    sli: {
      type: 'single',
      definition: {
        backend: 'prometheus',
        type: 'availability',
        calcMethod: 'events',
        metric: 'http_requests_total',
      },
      dimensions: [{ name: 'service', value: 'api-gateway' }],
    },
    objectives: [{ name: 'availability-99-9', target: 0.999 }],
    budgetWarningThresholds: [{ threshold: 0.5, severity: 'warning' }],
    window: { type: 'rolling', duration: '28d' },
    alerting: { strategy: 'mwmbr', burnRates: DEFAULT_MWMBR_TIERS.map((t) => ({ ...t })) },
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
  };
}

describe('validateSloSpec', () => {
  it('accepts a minimal valid spec', () => {
    const result = validateSloSpec(minimalSpec());
    expect(result.errors).toEqual({});
  });

  it('rejects missing name', () => {
    const result = validateSloSpec(minimalSpec({ name: '' }));
    expect(result.errors['spec.name']).toBeDefined();
  });

  it('rejects an objective target out of range', () => {
    const result = validateSloSpec(minimalSpec({ objectives: [{ name: 'x', target: 1.1 }] }));
    expect(result.errors['spec.objectives[0].target']).toBeDefined();
  });

  it('rejects rolling windows shorter than 1 day', () => {
    const result = validateSloSpec(minimalSpec({ window: { type: 'rolling', duration: '1h' } }));
    expect(result.errors['spec.window.duration']).toBeDefined();
  });

  it('warns when window > 3d (approximation)', () => {
    const result = validateSloSpec(minimalSpec());
    expect(result.warnings['spec.window.duration']).toContain('approximation');
  });

  it('rejects composite SLI (P2 deferral)', () => {
    const result = validateSloSpec(
      minimalSpec({
        sli: { type: 'composite', operator: 'all', members: [] },
      })
    );
    expect(result.errors['spec.sli.type']).toContain('P2');
  });

  it('rejects latency_threshold without latencyThreshold on each objective', () => {
    const result = validateSloSpec(
      minimalSpec({
        sli: {
          type: 'single',
          definition: {
            backend: 'prometheus',
            type: 'latency_threshold',
            calcMethod: 'events',
            metric: 'http_request_duration_seconds_bucket',
          },
          dimensions: [{ name: 'service', value: 'api' }],
        },
        objectives: [{ name: 'latency', target: 0.99 }],
      })
    );
    expect(result.errors['spec.objectives[0].latencyThreshold']).toBeDefined();
  });

  it('warns when latency threshold in seconds looks like milliseconds', () => {
    const result = validateSloSpec(
      minimalSpec({
        sli: {
          type: 'single',
          definition: {
            backend: 'prometheus',
            type: 'latency_threshold',
            calcMethod: 'events',
            metric: 'x_bucket',
            latencyThresholdUnit: 'seconds',
          },
          dimensions: [{ name: 'service', value: 'api' }],
        },
        objectives: [{ name: 'latency', target: 0.99, latencyThreshold: 500 }],
      })
    );
    expect(result.warnings['spec.objectives[0].latencyThreshold']).toContain('did you mean');
  });

  it('rejects reserved slo_* label keys', () => {
    const result = validateSloSpec(minimalSpec({ labels: { slo_id: 'hijacked' } }));
    expect(result.errors['spec.labels["slo_id"]']).toBeDefined();
  });

  it('rejects label values containing unsafe PromQL characters', () => {
    const result = validateSloSpec(minimalSpec({ labels: { foo: 'value"with"quotes' } }));
    expect(result.errors['spec.labels["foo"]']).toBeDefined();
  });

  // UUID cardinality guardrail.
  it('accepts non-UUID label values', () => {
    const result = validateSloSpec(minimalSpec({ labels: { env: 'prod' } }));
    expect(result.errors['spec.labels["env"]']).toBeUndefined();
  });

  it('rejects UUID-shaped label values (cardinality guardrail)', () => {
    const result = validateSloSpec(
      minimalSpec({ labels: { trace_id: '550e8400-e29b-41d4-a716-446655440000' } })
    );
    expect(result.errors['spec.labels["trace_id"]']).toContain('UUID');
  });

  it('rejects UUID-shaped label values in an array', () => {
    const result = validateSloSpec(
      minimalSpec({
        labels: { trace_ids: ['ok-value', '550E8400-E29B-41D4-A716-446655440000'] },
      })
    );
    expect(result.errors['spec.labels["trace_ids"]']).toContain('UUID');
  });

  // 4 KiB annotation cap.
  it('accepts annotations just under the 4096-byte cap', () => {
    // `{"k":"<value>"}` → value length budget ≈ 4096 − len('{"k":""}') − 1
    // Use 4080-char string so JSON.stringify length lands just under 4096.
    const big = 'a'.repeat(4080);
    const result = validateSloSpec(minimalSpec({ annotations: { k: big } }));
    expect(JSON.stringify({ k: big }).length).toBeLessThanOrEqual(4096);
    expect(result.errors['spec.annotations']).toBeUndefined();
  });

  it('rejects annotations exceeding the 4096-byte cap', () => {
    const big = 'a'.repeat(5000);
    const result = validateSloSpec(minimalSpec({ annotations: { k: big } }));
    expect(result.errors['spec.annotations']).toBeDefined();
    expect(result.errors['spec.annotations']).toContain('4096');
  });
});

// Custom-expr PromQL defensive checks. The character set closes the classes
// most likely to confuse downstream parsers; the real PromQL parse happens
// at Cortex when the rule group is upserted.
describe('validateSloSpec — custom PromQL defensive checks', () => {
  function customSpec(expr: {
    mode: 'events';
    goodQuery: string;
    totalQuery: string;
  }): Partial<SloSpec> {
    return minimalSpec({
      sli: {
        type: 'single',
        definition: {
          backend: 'prometheus',
          type: 'custom',
          calcMethod: 'events',
          customExpr: expr,
        },
        dimensions: [],
      },
    });
  }

  it('accepts balanced custom PromQL', () => {
    const result = validateSloSpec(
      customSpec({
        mode: 'events',
        goodQuery: 'sum(rate(http_requests_total{code!~"5.."}[5m]))',
        totalQuery: 'sum(rate(http_requests_total[5m]))',
      })
    );
    expect(result.errors['spec.sli.definition.customExpr.goodQuery']).toBeUndefined();
    expect(result.errors['spec.sli.definition.customExpr.totalQuery']).toBeUndefined();
  });

  it('rejects unbalanced parentheses', () => {
    const result = validateSloSpec(
      customSpec({
        mode: 'events',
        goodQuery: 'sum(rate(http_requests_total[5m])',
        totalQuery: 'sum(rate(http_requests_total[5m]))',
      })
    );
    expect(result.errors['spec.sli.definition.customExpr.goodQuery']).toMatch(/parentheses/);
  });

  it('rejects unbalanced braces', () => {
    const result = validateSloSpec(
      customSpec({
        mode: 'events',
        goodQuery: 'sum(rate(http{code="5")',
        totalQuery: 'sum(rate(http[5m]))',
      })
    );
    expect(result.errors['spec.sli.definition.customExpr.goodQuery']).toMatch(/braces|parentheses/);
  });

  it('rejects unbalanced brackets', () => {
    const result = validateSloSpec(
      customSpec({
        mode: 'events',
        goodQuery: 'sum(rate(http_requests_total[5m))',
        totalQuery: 'sum(rate(http_requests_total[5m]))',
      })
    );
    expect(result.errors['spec.sli.definition.customExpr.goodQuery']).toMatch(
      /brackets|parentheses/
    );
  });

  it('rejects trailing backslash', () => {
    const result = validateSloSpec(
      customSpec({
        mode: 'events',
        goodQuery: 'sum(rate(http_requests_total[5m])) \\',
        totalQuery: 'sum(rate(http_requests_total[5m]))',
      })
    );
    expect(result.errors['spec.sli.definition.customExpr.goodQuery']).toMatch(/backslash/);
  });

  it('rejects control characters', () => {
    const result = validateSloSpec(
      customSpec({
        mode: 'events',
        goodQuery: 'sum(\u0000rate(http_requests_total[5m]))',
        totalQuery: 'sum(rate(http_requests_total[5m]))',
      })
    );
    expect(result.errors['spec.sli.definition.customExpr.goodQuery']).toMatch(/control/);
  });

  it('ignores delimiters inside string literals', () => {
    const result = validateSloSpec(
      customSpec({
        mode: 'events',
        goodQuery: 'count({status=~"(5\\d{2}"})',
        totalQuery: 'count({status!=""})',
      })
    );
    expect(result.errors['spec.sli.definition.customExpr.goodQuery']).toBeUndefined();
    expect(result.errors['spec.sli.definition.customExpr.totalQuery']).toBeUndefined();
  });

  it('rejects expressions over the size cap', () => {
    const result = validateSloSpec(
      customSpec({
        mode: 'events',
        goodQuery: 'a'.repeat(9000),
        totalQuery: 'b',
      })
    );
    expect(result.errors['spec.sli.definition.customExpr.goodQuery']).toMatch(/8192/);
  });
});

describe('validateSloId', () => {
  it('accepts a valid slug', () => {
    expect(validateSloId('my-api-availability')).toBeNull();
  });
  it('rejects uppercase or underscores', () => {
    expect(validateSloId('MY_SLO')).not.toBeNull();
  });
  it('rejects short slugs', () => {
    expect(validateSloId('ab')).not.toBeNull();
  });
});
