/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * use_pending_rules hook tests — the singleton store + React wiring around the
 * pure `reconcilePending`. Covers: an added optimistic row shows immediately
 * (no `rules` change needed), a querier refetch that reveals the rule evicts it
 * silently, and a timeout fires the warning callback exactly once.
 */
import { act, renderHook } from '@testing-library/react';
import type { UnifiedRuleSummary } from '../../../../../common/types/alerting';
import { pendingRulesStore, usePendingRules } from '../use_pending_rules';
import { key, PendingEntry } from '../../monitors_table/pending_rules';

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

const entry = (over: Partial<PendingEntry> = {}): PendingEntry => ({
  key: key('ds1', 'g', 'HighCpu'),
  dsId: 'ds1',
  optimisticRule: rule({ id: 'new-1-0', status: 'pending' }),
  attempts: 0,
  createdAt: Date.now(),
  origin: 'metrics',
  ...over,
});

const setup = (initial: {
  rules?: UnifiedRuleSummary[];
  deletedRuleIds?: Set<string>;
  selectedDsIds?: string[];
  onEvictWarning?: jest.Mock;
}) =>
  renderHook(
    (props: {
      rules: UnifiedRuleSummary[];
      deletedRuleIds: Set<string>;
      selectedDsIds: string[];
    }) =>
      usePendingRules({
        ...props,
        onEvictWarning: initial.onEvictWarning ?? jest.fn(),
      }),
    {
      initialProps: {
        rules: initial.rules ?? [],
        deletedRuleIds: initial.deletedRuleIds ?? new Set<string>(),
        selectedDsIds: initial.selectedDsIds ?? ['ds1'],
      },
    }
  );

beforeEach(() => {
  act(() => pendingRulesStore._reset());
});

describe('usePendingRules', () => {
  it('shows an added optimistic row immediately, without a rules change', () => {
    const { result } = setup({ rules: [] });
    expect(result.current.mergedRules).toHaveLength(0);
    act(() => result.current.addPending(entry()));
    expect(result.current.mergedRules).toHaveLength(1);
    expect(result.current.mergedRules[0].id).toBe('new-1-0');
  });

  it('evicts the pending row silently once the querier confirms it', () => {
    const onEvictWarning = jest.fn();
    const { result, rerender } = setup({ rules: [], onEvictWarning });
    act(() => result.current.addPending(entry()));
    expect(result.current.mergedRules).toHaveLength(1);

    // A refetch that now includes the canonical row confirms + evicts.
    act(() => rerender({ rules: [rule()], deletedRuleIds: new Set(), selectedDsIds: ['ds1'] }));
    expect(result.current.mergedRules).toHaveLength(1);
    expect(result.current.mergedRules[0].id).toBe('ds1-g-HighCpu');
    expect(pendingRulesStore.getSnapshot()).toHaveLength(0);
    expect(onEvictWarning).not.toHaveBeenCalled();
  });

  it('warns once when an entry is evicted for aging past its ttl', () => {
    const onEvictWarning = jest.fn();
    const { result, rerender } = setup({ rules: [], onEvictWarning });
    // Created well over the ttl ago (default 120s), so the next reconcile evicts
    // it as expired.
    act(() => result.current.addPending(entry({ createdAt: Date.now() - 200_000 })));

    // Two refetches (empty querier) — should only warn on the first eviction.
    act(() =>
      rerender({
        rules: [rule({ name: 'Other', id: 'x' })],
        deletedRuleIds: new Set(),
        selectedDsIds: ['ds1'],
      })
    );
    act(() =>
      rerender({
        rules: [rule({ name: 'Other2', id: 'y' })],
        deletedRuleIds: new Set(),
        selectedDsIds: ['ds1'],
      })
    );

    expect(pendingRulesStore.getSnapshot()).toHaveLength(0);
    expect(onEvictWarning).toHaveBeenCalledTimes(1);
    expect(onEvictWarning).toHaveBeenCalledWith(
      expect.objectContaining({ key: entry().key }),
      'expired'
    );
  });

  it('drops pending entries outside the retained datasource ids', () => {
    const { result } = setup({ rules: [] });
    act(() => {
      result.current.addPending(entry());
      result.current.addPending(
        entry({
          key: key('ds2', 'g', 'X'),
          dsId: 'ds2',
          optimisticRule: rule({ id: 'new-2-0', datasourceId: 'ds2', status: 'pending' }),
        })
      );
    });
    expect(pendingRulesStore.getSnapshot()).toHaveLength(2);
    act(() => result.current.dropPendingOutsideDsIds(['ds1']));
    expect(pendingRulesStore.getSnapshot()).toHaveLength(1);
    expect(pendingRulesStore.getSnapshot()[0].dsId).toBe('ds1');
  });
});
