/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { UnifiedRuleSummary } from '../../../../../common/types/alerting';
import {
  DEFAULT_PENDING_RULES_CONFIG,
  isPending,
  key,
  mergePending,
  PendingEntry,
  reconcilePending,
} from '../pending_rules';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const rule = (over: Partial<UnifiedRuleSummary> = {}): UnifiedRuleSummary => ({
  id: 'ds1-g-HighCpu',
  datasourceId: 'ds1',
  datasourceType: 'prometheus',
  name: 'HighCpu',
  enabled: true,
  severity: 'critical',
  query: 'up == 0',
  condition: '> 0',
  group: 'g',
  labels: {},
  annotations: {},
  monitorType: 'metric',
  status: 'active',
  healthStatus: 'healthy',
  createdBy: 'system',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastModified: '2026-01-01T00:00:00.000Z',
  notificationDestinations: [],
  evaluationInterval: '60s',
  pendingPeriod: '5m',
  ...over,
});

const optimistic = (over: Partial<UnifiedRuleSummary> = {}): UnifiedRuleSummary =>
  rule({ id: 'new-100-0', status: 'pending', ...over });

const entry = (over: Partial<PendingEntry> = {}): PendingEntry => ({
  key: key('ds1', 'g', 'HighCpu'),
  dsId: 'ds1',
  optimisticRule: optimistic(),
  attempts: 0,
  createdAt: 1_000,
  origin: 'metrics',
  ...over,
});

const reconcile = (
  querier: UnifiedRuleSummary[],
  pending: PendingEntry[],
  opts: {
    deleted?: Set<string>;
    now?: number;
    selected?: string[];
    config?: typeof DEFAULT_PENDING_RULES_CONFIG;
  } = {}
) =>
  reconcilePending(
    querier,
    pending,
    opts.deleted ?? new Set<string>(),
    opts.now ?? 2_000,
    opts.selected ?? ['ds1'],
    opts.config ?? DEFAULT_PENDING_RULES_CONFIG
  );

// ---------------------------------------------------------------------------
// key()
// ---------------------------------------------------------------------------

describe('key', () => {
  it('is case- and whitespace-insensitive on group and name', () => {
    expect(key('ds1', '  G  ', '  HighCpu  ')).toBe(key('ds1', 'g', 'highcpu'));
    expect(key('ds1', 'Group', 'Rule')).toBe('ds1|group|rule');
  });

  it('degrades to an empty group segment for group-less monitors', () => {
    expect(key('ds1', undefined, 'Mon')).toBe('ds1||mon');
    expect(key('ds1', '', 'Mon')).toBe('ds1||mon');
    expect(key('ds1', undefined, 'Mon')).toBe(key('ds1', '', 'Mon'));
  });

  it('keeps the datasource segment distinct', () => {
    expect(key('ds1', 'g', 'n')).not.toBe(key('ds2', 'g', 'n'));
  });
});

// ---------------------------------------------------------------------------
// isPending()
// ---------------------------------------------------------------------------

describe('isPending', () => {
  it('is true only for a synthetic new- id with pending status', () => {
    expect(isPending(optimistic())).toBe(true);
  });

  it('is false for a real Cortex rule whose querier state is pending', () => {
    expect(isPending(rule({ id: 'ds1-g-HighCpu', status: 'pending' }))).toBe(false);
  });

  it('is false for a new- id that is no longer pending', () => {
    expect(isPending(optimistic({ status: 'active' }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// reconcilePending()
// ---------------------------------------------------------------------------

describe('reconcilePending', () => {
  it('(a) evicts a confirmed entry silently with no duplicate row', () => {
    const confirmed = rule(); // key ds1|g|highcpu, canonical id
    const { merged, nextPending, evicted } = reconcile([confirmed], [entry()]);
    expect(nextPending).toHaveLength(0);
    expect(evicted).toEqual([
      { entry: expect.objectContaining({ key: key('ds1', 'g', 'HighCpu') }), reason: 'confirmed' },
    ]);
    // Deduped: exactly one row, and it's the canonical one (not the new- id).
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('ds1-g-HighCpu');
  });

  it('confirms across a group name whose case/whitespace differs (group-mismatch regression)', () => {
    const confirmed = rule({ group: 'g', name: 'HighCpu' });
    const pendingEntry = entry({ key: key('ds1', '  G ', ' highcpu ') });
    const { nextPending, evicted } = reconcile([confirmed], [pendingEntry]);
    expect(nextPending).toHaveLength(0);
    expect(evicted[0].reason).toBe('confirmed');
  });

  it('(e) retains an unconfirmed entry and increments attempts + keeps pending status', () => {
    const { merged, nextPending, evicted } = reconcile([], [entry({ attempts: 2 })]);
    expect(evicted).toHaveLength(0);
    expect(nextPending).toHaveLength(1);
    expect(nextPending[0].attempts).toBe(3);
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe('pending');
    expect(isPending(merged[0])).toBe(true);
  });

  it('(d) evicts as exhausted when attempts reach maxAttempts', () => {
    const { nextPending, evicted } = reconcile([], [entry({ attempts: 6 })]);
    expect(nextPending).toHaveLength(0);
    expect(evicted).toEqual([
      { entry: expect.objectContaining({ attempts: 6 }), reason: 'exhausted' },
    ]);
  });

  it('(c) evicts as expired when age exceeds ttl even if attempts are under the cap', () => {
    const { nextPending, evicted } = reconcile([], [entry({ attempts: 0, createdAt: 1_000 })], {
      now: 1_000 + DEFAULT_PENDING_RULES_CONFIG.ttlMs + 1,
    });
    expect(nextPending).toHaveLength(0);
    expect(evicted[0].reason).toBe('expired');
  });

  it('(b) evicts a user-deleted optimistic row and does not resurrect it on the next pass', () => {
    const deleted = new Set<string>(['new-100-0']);
    const pass1 = reconcile([], [entry()], { deleted });
    expect(pass1.evicted[0].reason).toBe('deleted');
    expect(pass1.nextPending).toHaveLength(0);
    // Next pass over the (now empty) survivor set can't bring it back.
    const pass2 = reconcile([], pass1.nextPending, { deleted });
    expect(pass2.merged).toHaveLength(0);
    expect(pass2.nextPending).toHaveLength(0);
  });

  it('prioritizes confirm over delete/ttl/attempts', () => {
    const confirmed = rule();
    const { evicted } = reconcile([confirmed], [entry({ attempts: 99, createdAt: 0 })], {
      deleted: new Set(['new-100-0']),
      now: 10 ** 12,
    });
    expect(evicted[0].reason).toBe('confirmed');
  });

  it('excludes a pending row whose datasource is not selected, without evicting it', () => {
    const e = entry({
      dsId: 'ds2',
      key: key('ds2', 'g', 'HighCpu'),
      optimisticRule: optimistic({ datasourceId: 'ds2' }),
    });
    const { merged, nextPending } = reconcile([], [e], { selected: ['ds1'] });
    expect(merged).toHaveLength(0); // hidden
    expect(nextPending).toHaveLength(1); // but retained
  });
});

// ---------------------------------------------------------------------------
// mergePending()
// ---------------------------------------------------------------------------

describe('mergePending', () => {
  it('appends only unconfirmed, selected, non-deleted optimistic rows', () => {
    const confirmed = rule({ id: 'ds1-g2-Other', group: 'g2', name: 'Other' });
    const merged = mergePending([confirmed], [entry()], new Set(), ['ds1']);
    expect(merged.map((r) => r.id)).toEqual(['ds1-g2-Other', 'new-100-0']);
  });

  it('never appends a pending row once its key appears in the querier response', () => {
    const merged = mergePending([rule()], [entry()], new Set(), ['ds1']);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('ds1-g-HighCpu');
  });

  it('hides a pending row whose optimistic id was deleted', () => {
    const merged = mergePending([], [entry()], new Set(['new-100-0']), ['ds1']);
    expect(merged).toHaveLength(0);
  });
});
