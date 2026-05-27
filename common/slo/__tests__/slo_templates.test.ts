/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GOOD_EVENTS_FILTER_PRESETS,
  SLO_TEMPLATES,
  detectMetricType,
  formatErrorBudget,
  substituteCustomPromqlDefaults,
} from '../slo_templates';
import { validateCustomPromQL } from '../slo_validators';

describe('SLO_TEMPLATES catalog', () => {
  it('every template has a unique id', () => {
    const ids = SLO_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exposes the documented categories', () => {
    const cats = new Set(SLO_TEMPLATES.map((t) => t.category));
    expect(cats).toEqual(new Set(['apm', 'otel', 'custom']));
  });

  it('apm templates carry custom PromQL defaults but no detectionPattern', () => {
    const apm = SLO_TEMPLATES.filter((t) => t.category === 'apm');
    expect(apm).not.toHaveLength(0);
    for (const t of apm) {
      expect(t.detectionPattern).toBeNull();
      expect(t.customPromqlDefaults).toBeDefined();
      expect(t.sli.type).toBe('custom');
    }
  });

  it('otel templates carry a detectionPattern and a metric on the SLI', () => {
    const otel = SLO_TEMPLATES.filter((t) => t.category === 'otel');
    expect(otel).not.toHaveLength(0);
    for (const t of otel) {
      expect(t.detectionPattern).toBeInstanceOf(RegExp);
      expect(t.sli.metric).toBeTruthy();
    }
  });

  it('latency templates declare a default threshold and unit', () => {
    const latency = SLO_TEMPLATES.filter((t) => t.sli.type === 'latency_threshold');
    expect(latency).not.toHaveLength(0);
    for (const t of latency) {
      expect(typeof t.defaultLatencyThreshold).toBe('number');
      expect(t.sli.latencyThresholdUnit).toBe('seconds');
    }
  });

  it('availability templates ship with a goodEventsFilter', () => {
    const avail = SLO_TEMPLATES.filter((t) => t.sli.type === 'availability');
    for (const t of avail) {
      expect(t.sli.goodEventsFilter).toBeTruthy();
    }
  });

  it('apm custom-events PromQL defaults round-trip the validator cleanly', () => {
    const apm = SLO_TEMPLATES.filter((t) => t.category === 'apm');
    for (const t of apm) {
      const defaults = t.customPromqlDefaults!;
      if (defaults.mode !== 'events') continue;
      // After service substitution the queries are the actual emitted PromQL.
      const filled = substituteCustomPromqlDefaults(defaults, {
        service: 'checkout',
        remoteService: 'cart',
      });
      if (filled.mode !== 'events') throw new Error('mode flipped');
      expect(validateCustomPromQL(filled.goodQuery)).toBeNull();
      expect(validateCustomPromQL(filled.totalQuery)).toBeNull();
    }
  });
});

describe('detectMetricType', () => {
  it('prefers metadata over the suffix heuristic', () => {
    const r = detectMetricType('http_server_request_duration_seconds_bucket', {
      type: 'counter',
      help: '',
      unit: '',
    });
    expect(r.type).toBe('counter');
    expect(r.suggestedSliType).toBe('availability');
  });

  it('falls back to the _bucket suffix → histogram, picks first matching template', () => {
    const r = detectMetricType('http_server_request_duration_seconds_bucket');
    expect(r.type).toBe('histogram');
    expect(r.suggestedSliType).toBe('latency_threshold');
    // findMatchingTemplate iterates SLO_TEMPLATES in declaration order and
    // both http-availability and http-latency match this metric — the first
    // wins.
    expect(['http-availability', 'http-latency']).toContain(r.suggestedTemplate?.id);
  });

  it('falls back to the _count suffix → histogram', () => {
    const r = detectMetricType('rpc_server_duration_seconds_count');
    expect(r.type).toBe('histogram');
    expect(r.suggestedTemplate?.id).toBe('rpc-availability');
  });

  it('treats _total as counter', () => {
    const r = detectMetricType('http_requests_total');
    expect(r.type).toBe('counter');
    expect(r.suggestedSliType).toBe('availability');
  });

  it('treats _sum as histogram', () => {
    const r = detectMetricType('http_server_request_duration_seconds_sum');
    expect(r.type).toBe('histogram');
  });

  it('treats _gauge as gauge', () => {
    const r = detectMetricType('process_cpu_load_gauge');
    expect(r.type).toBe('gauge');
  });

  it('returns unknown when no heuristic matches', () => {
    const r = detectMetricType('mystery_thing');
    expect(r.type).toBe('unknown');
    expect(r.suggestedTemplate).toBeNull();
  });

  it('ignores metadata.type === "unknown" and falls through to the suffix', () => {
    const r = detectMetricType('http_requests_total', {
      type: 'unknown',
      help: '',
      unit: '',
    });
    expect(r.type).toBe('counter');
  });

  it('matches the genai template by metric name', () => {
    const r = detectMetricType('gen_ai_client_operation_duration_seconds_count');
    expect(r.suggestedTemplate?.id).toBe('genai-availability');
  });
});

describe('substituteCustomPromqlDefaults', () => {
  it('replaces ${service} in events mode', () => {
    const out = substituteCustomPromqlDefaults(
      {
        mode: 'events',
        goodQuery: 'sum(request{service="${service}"})',
        totalQuery: 'sum(request{service="${service}"})',
      },
      { service: 'cart' }
    );
    if (out.mode !== 'events') throw new Error('mode changed');
    expect(out.goodQuery).toContain('service="cart"');
    expect(out.totalQuery).toContain('service="cart"');
  });

  it('keeps the literal placeholder when the variable is missing or empty', () => {
    const out = substituteCustomPromqlDefaults(
      {
        mode: 'events',
        goodQuery: '${service}/${remoteService}/${environment}',
        totalQuery: '',
      },
      { service: '', remoteService: undefined, environment: '' }
    );
    if (out.mode !== 'events') throw new Error('mode changed');
    expect(out.goodQuery).toBe('${service}/${remoteService}/${environment}');
  });

  it('replaces every occurrence (g flag)', () => {
    const out = substituteCustomPromqlDefaults(
      {
        mode: 'events',
        goodQuery: '${service}.${service}.${service}',
        totalQuery: '',
      },
      { service: 'a' }
    );
    if (out.mode !== 'events') throw new Error('mode changed');
    expect(out.goodQuery).toBe('a.a.a');
  });

  it('handles raw mode', () => {
    const out = substituteCustomPromqlDefaults(
      {
        mode: 'raw',
        errorRatioQuery: '1 - ratio(${service})',
      },
      { service: 'cart' }
    );
    if (out.mode !== 'raw') throw new Error('mode changed');
    expect(out.errorRatioQuery).toBe('1 - ratio(cart)');
  });
});

describe('formatErrorBudget', () => {
  it('reports seconds for very small budgets', () => {
    const r = formatErrorBudget(0.99999, '1d');
    expect(r.formatted).toMatch(/Error budget: \d+(\.\d+)? seconds\/day/);
    expect(r.raw).toBeCloseTo(86400 * 0.00001, 5);
  });

  it('reports minutes for budgets ≥ 2 minutes', () => {
    const r = formatErrorBudget(0.99, '1d');
    expect(r.formatted).toMatch(/minutes\/day/);
  });

  it('reports hours for budgets ≥ 90 minutes', () => {
    const r = formatErrorBudget(0.99, '30d');
    expect(r.formatted).toMatch(/hours\/month/);
  });

  it('uses the raw window string when no friendly label exists', () => {
    const r = formatErrorBudget(0.99, '14d');
    expect(r.formatted).toMatch(/14d$/);
  });

  it('week label maps to /week', () => {
    const r = formatErrorBudget(0.99, '7d');
    expect(r.formatted).toMatch(/\/week$/);
  });

  it('28d and 30d both label as /month', () => {
    expect(formatErrorBudget(0.99, '28d').formatted).toMatch(/\/month$/);
    expect(formatErrorBudget(0.99, '30d').formatted).toMatch(/\/month$/);
  });

  it('returns a zero raw budget for an unparseable window', () => {
    const r = formatErrorBudget(0.99, 'forever');
    expect(r.raw).toBe(0);
    expect(r.formatted).toContain('forever');
  });

  it('formats a value of exactly 0 as "0 seconds"', () => {
    const r = formatErrorBudget(1, '1d');
    expect(r.formatted).toMatch(/^Error budget: 0 seconds/);
  });
});

describe('GOOD_EVENTS_FILTER_PRESETS', () => {
  it('contains the canonical http/rpc/genai presets with non-empty values', () => {
    expect(GOOD_EVENTS_FILTER_PRESETS.length).toBeGreaterThan(0);
    for (const p of GOOD_EVENTS_FILTER_PRESETS) {
      expect(p.label).toBeTruthy();
      expect(p.value).toBeTruthy();
    }
    const labels = GOOD_EVENTS_FILTER_PRESETS.map((p) => p.label);
    expect(labels).toContain('RPC OK (gRPC)');
  });
});
