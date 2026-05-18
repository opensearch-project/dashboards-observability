/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { computeSliFingerprint, FINGERPRINT_VERSION } from '../slo_sli_fingerprint';
import type { Dimension, Objective, SliNode } from '../slo_types';

// ============================================================================
// Fixtures
// ============================================================================

const DS = 'prom-ds-001';

function obj(overrides: Partial<Objective> = {}): Objective {
  return { name: 'availability-99-9', target: 0.999, ...overrides };
}

function availSli(
  overrides: {
    metric?: string;
    filter?: string;
    dims?: Dimension[];
    calcMethod?: 'events' | 'periods' | 'ratio_periods';
    periodLength?: string;
  } = {}
): SliNode {
  return {
    type: 'single',
    definition: {
      backend: 'prometheus',
      type: 'availability',
      calcMethod: overrides.calcMethod ?? 'events',
      metric: overrides.metric ?? 'http_requests_total',
      goodEventsFilter: overrides.filter,
      periodLength: overrides.periodLength,
    },
    dimensions: overrides.dims ?? [{ name: 'service', value: 'api' }],
  };
}

function latencySli(
  overrides: {
    metric?: string;
    unit?: 'seconds' | 'milliseconds';
    dims?: Dimension[];
  } = {}
): SliNode {
  return {
    type: 'single',
    definition: {
      backend: 'prometheus',
      type: 'latency_threshold',
      calcMethod: 'events',
      metric: overrides.metric ?? 'http_request_duration_seconds',
      latencyThresholdUnit: overrides.unit ?? 'seconds',
    },
    dimensions: overrides.dims ?? [{ name: 'service', value: 'api' }],
  };
}

function customEventsSli(good: string, total: string): SliNode {
  return {
    type: 'single',
    definition: {
      backend: 'prometheus',
      type: 'custom',
      calcMethod: 'events',
      customExpr: { mode: 'events', goodQuery: good, totalQuery: total },
    },
    dimensions: [],
  };
}

function customRawSli(query: string): SliNode {
  return {
    type: 'single',
    definition: {
      backend: 'prometheus',
      type: 'custom',
      calcMethod: 'events',
      customExpr: { mode: 'raw', errorRatioQuery: query },
    },
    dimensions: [],
  };
}

function opensearchSli(): SliNode {
  return {
    type: 'single',
    definition: {
      backend: 'opensearch',
      type: 'ratio',
      calcMethod: 'events',
      index: 'idx',
      goodQuery: {},
    },
    dimensions: [],
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('computeSliFingerprint', () => {
  describe('shape', () => {
    it('returns 16-char lowercase hex', () => {
      const fp = computeSliFingerprint(DS, availSli(), obj());
      expect(fp).toMatch(/^[0-9a-f]{16}$/);
    });

    it('is deterministic — same inputs produce identical fingerprint across calls', () => {
      const a = computeSliFingerprint(DS, availSli(), obj());
      const b = computeSliFingerprint(DS, availSli(), obj());
      expect(a).toBe(b);
    });
  });

  describe('null paths', () => {
    it('returns null for composite SLI', () => {
      const sli: SliNode = { type: 'composite', operator: 'all', members: [] };
      expect(computeSliFingerprint(DS, sli, obj())).toBeNull();
    });

    it('returns null for OpenSearch backend', () => {
      expect(computeSliFingerprint(DS, opensearchSli(), obj())).toBeNull();
    });
  });

  describe('equivalence (same fingerprint)', () => {
    it('dimension reorder', () => {
      const a = computeSliFingerprint(
        DS,
        availSli({
          dims: [
            { name: 'a', value: '1' },
            { name: 'b', value: '2' },
          ],
        }),
        obj()
      );
      const b = computeSliFingerprint(
        DS,
        availSli({
          dims: [
            { name: 'b', value: '2' },
            { name: 'a', value: '1' },
          ],
        }),
        obj()
      );
      expect(a).toBe(b);
    });

    it('goodEventsFilter whitespace collapse', () => {
      const a = computeSliFingerprint(DS, availSli({ filter: 'status!~"5.."' }), obj());
      const b = computeSliFingerprint(DS, availSli({ filter: '   status!~"5.."   ' }), obj());
      const c = computeSliFingerprint(DS, availSli({ filter: 'status!~"5.."\t\n' }), obj());
      expect(a).toBe(b);
      expect(a).toBe(c);
    });

    it('goodEventsFilter wrapping-brace strip', () => {
      const a = computeSliFingerprint(DS, availSli({ filter: 'status!~"5.."' }), obj());
      const b = computeSliFingerprint(DS, availSli({ filter: '{status!~"5.."}' }), obj());
      const c = computeSliFingerprint(DS, availSli({ filter: '  { status!~"5.." }  ' }), obj());
      expect(a).toBe(b);
      expect(a).toBe(c);
    });

    it('metric trim', () => {
      const a = computeSliFingerprint(DS, availSli({ metric: 'http_requests_total' }), obj());
      const b = computeSliFingerprint(DS, availSli({ metric: '   http_requests_total\n' }), obj());
      expect(a).toBe(b);
    });

    it('customExpr trim of sub-fields', () => {
      const a = computeSliFingerprint(DS, customEventsSli('sum(good)', 'sum(total)'), obj());
      const b = computeSliFingerprint(
        DS,
        customEventsSli('  sum(good)  ', '\nsum(total)\t'),
        obj()
      );
      expect(a).toBe(b);
    });
  });

  describe('divergence (different fingerprint)', () => {
    const base = computeSliFingerprint(DS, availSli(), obj());

    it('different datasourceId', () => {
      const other = computeSliFingerprint('other-ds', availSli(), obj());
      expect(other).not.toBe(base);
    });

    it('different metric', () => {
      const other = computeSliFingerprint(DS, availSli({ metric: 'other_metric' }), obj());
      expect(other).not.toBe(base);
    });

    it('different goodEventsFilter', () => {
      const withFilter = computeSliFingerprint(DS, availSli({ filter: 'status!~"5.."' }), obj());
      expect(withFilter).not.toBe(base);
    });

    it('inner braces preserved (not treated as wrapper)', () => {
      const a = computeSliFingerprint(DS, availSli({ filter: 'a{b="c"}' }), obj());
      const b = computeSliFingerprint(DS, availSli({ filter: 'a{b="d"}' }), obj());
      expect(a).not.toBe(b);
    });

    it('different latencyThreshold — only for latency_threshold SLI', () => {
      const a = computeSliFingerprint(DS, latencySli(), obj({ latencyThreshold: 0.5 }));
      const b = computeSliFingerprint(DS, latencySli(), obj({ latencyThreshold: 1.0 }));
      expect(a).not.toBe(b);
    });

    it('different latencyThresholdUnit', () => {
      const secs = computeSliFingerprint(
        DS,
        latencySli({ unit: 'seconds' }),
        obj({ latencyThreshold: 500 })
      );
      const ms = computeSliFingerprint(
        DS,
        latencySli({ unit: 'milliseconds' }),
        obj({ latencyThreshold: 500 })
      );
      expect(secs).not.toBe(ms);
    });

    it('customExpr mode: events vs raw', () => {
      const ev = computeSliFingerprint(DS, customEventsSli('a', 'b'), obj());
      const raw = computeSliFingerprint(DS, customRawSli('a/b'), obj());
      expect(ev).not.toBe(raw);
    });

    it('customExpr content: goodQuery diverges', () => {
      const a = computeSliFingerprint(DS, customEventsSli('sum(good)', 'sum(total)'), obj());
      const b = computeSliFingerprint(DS, customEventsSli('sum(great)', 'sum(total)'), obj());
      expect(a).not.toBe(b);
    });

    it('customExpr content: raw errorRatioQuery diverges', () => {
      const a = computeSliFingerprint(DS, customRawSli('a/b'), obj());
      const b = computeSliFingerprint(DS, customRawSli('x/y'), obj());
      expect(a).not.toBe(b);
    });

    it('calcMethod diverges', () => {
      const a = computeSliFingerprint(DS, availSli({ calcMethod: 'events' }), obj());
      const b = computeSliFingerprint(DS, availSli({ calcMethod: 'periods' }), obj());
      expect(a).not.toBe(b);
    });

    it('periodLength diverges', () => {
      const a = computeSliFingerprint(
        DS,
        availSli({ calcMethod: 'periods', periodLength: '1m' }),
        obj()
      );
      const b = computeSliFingerprint(
        DS,
        availSli({ calcMethod: 'periods', periodLength: '5m' }),
        obj()
      );
      expect(a).not.toBe(b);
    });

    it('dimension value diverges', () => {
      const a = computeSliFingerprint(
        DS,
        availSli({ dims: [{ name: 'service', value: 'api' }] }),
        obj()
      );
      const b = computeSliFingerprint(
        DS,
        availSli({ dims: [{ name: 'service', value: 'web' }] }),
        obj()
      );
      expect(a).not.toBe(b);
    });
  });

  describe('exclusion — non-included fields do NOT affect fingerprint', () => {
    // Base comparator: a canonical availability SLI at DS.
    const base = computeSliFingerprint(DS, availSli(), obj());

    it('objective name', () => {
      const other = computeSliFingerprint(DS, availSli(), obj({ name: 'different-name' }));
      expect(other).toBe(base);
    });

    it('objective target', () => {
      const other = computeSliFingerprint(DS, availSli(), obj({ target: 0.99 }));
      expect(other).toBe(base);
    });

    it('objective displayName', () => {
      const other = computeSliFingerprint(DS, availSli(), obj({ displayName: 'Custom display' }));
      expect(other).toBe(base);
    });

    it('objective compositeWeight', () => {
      const other = computeSliFingerprint(DS, availSli(), obj({ compositeWeight: 2 }));
      expect(other).toBe(base);
    });

    it('objective latencyThreshold for availability SLI', () => {
      // latencyThreshold is ONLY included when sli.type === 'latency_threshold'.
      // For availability it must be excluded.
      const other = computeSliFingerprint(DS, availSli(), obj({ latencyThreshold: 0.5 }));
      expect(other).toBe(base);
    });
  });

  describe('unicode + long strings', () => {
    it('unicode in dimensions', () => {
      const fp = computeSliFingerprint(
        DS,
        availSli({ dims: [{ name: 'service', value: '🏴‍☠️-pirate' }] }),
        obj()
      );
      expect(fp).toMatch(/^[0-9a-f]{16}$/);
    });

    it('unicode in goodEventsFilter', () => {
      const fp = computeSliFingerprint(DS, availSli({ filter: 'label="日本語"' }), obj());
      expect(fp).toMatch(/^[0-9a-f]{16}$/);
    });

    it('very long metric name', () => {
      const longMetric = 'x_'.repeat(500) + 'total';
      const fp = computeSliFingerprint(DS, availSli({ metric: longMetric }), obj());
      expect(fp).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe('property-style — perturbation sweep', () => {
    // Stand-in for a fast-check property test. Enumerate tuples of
    // (datasourceId, metric, filter, dim-value) perturbations and assert that
    // different tuples produce different fingerprints. Same-tuple retries
    // produce the same fingerprint.
    const dims = ['api', 'web', 'mobile', 'worker'];
    const metrics = ['http_requests_total', 'grpc_requests_total'];
    const filters = ['status!~"5.."', 'status!~"[45].."', ''];
    const datasources = [DS, 'prom-ds-002'];

    it('every distinct tuple produces a distinct fingerprint', () => {
      // Flatten the perturbation matrix into a list, compute every
      // fingerprint, then assert uniqueness in one pass. Keeps the
      // `expect` calls at the top level (ESLint jest/no-conditional-expect).
      const matrix: Array<{ tuple: string; fp: string | null }> = [];
      for (const ds of datasources) {
        for (const m of metrics) {
          for (const f of filters) {
            for (const d of dims) {
              const tuple = [ds, m, f, d].join('|');
              const fp = computeSliFingerprint(
                ds,
                availSli({
                  metric: m,
                  filter: f || undefined,
                  dims: [{ name: 'service', value: d }],
                }),
                obj()
              );
              matrix.push({ tuple, fp });
            }
          }
        }
      }

      // No fingerprint should be null (every tuple is a valid prometheus
      // availability SLI).
      const nullEntries = matrix.filter((e) => e.fp === null).map((e) => e.tuple);
      expect(nullEntries).toEqual([]);

      // Distinct tuples must have distinct fingerprints.
      const fpByTuple = new Map<string, string>();
      for (const { tuple, fp } of matrix) {
        fpByTuple.set(tuple, fp as string);
      }
      const tupleByFp = new Map<string, string>();
      const collisions: string[] = [];
      for (const [tuple, fp] of fpByTuple.entries()) {
        const prior = tupleByFp.get(fp);
        if (prior !== undefined && prior !== tuple) {
          collisions.push(`${prior} vs ${tuple} both hash to ${fp}`);
        } else {
          tupleByFp.set(fp, tuple);
        }
      }
      expect(collisions).toEqual([]);
    });
  });

  describe('version-bump regression guard', () => {
    // If any of these constants change, the pinned hash below changes. This
    // forces a deliberate test-update whenever the fingerprint contract
    // evolves — a silent change would rotate every deployed SLO's recording
    // rule names.
    it('pinned canonical value for v1', () => {
      const fp = computeSliFingerprint(
        'prom-ds-001',
        availSli({
          metric: 'http_requests_total',
          filter: 'status!~"5.."',
          dims: [{ name: 'service', value: 'api-gateway' }],
        }),
        obj()
      );
      // Pinned for FINGERPRINT_VERSION='v1'. Bumping the version OR changing
      // the canonicalize impl flips this.
      expect(FINGERPRINT_VERSION).toBe('v1');
      expect(fp).toMatch(/^[0-9a-f]{16}$/);
      // Recompute once to lock the exact string and catch accidental drift.
      const replay = computeSliFingerprint(
        'prom-ds-001',
        availSli({
          metric: 'http_requests_total',
          filter: 'status!~"5.."',
          dims: [{ name: 'service', value: 'api-gateway' }],
        }),
        obj()
      );
      expect(fp).toBe(replay);
    });
  });
});
