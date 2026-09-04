/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * React glue + module-level singleton for the optimistic pending-rule cache.
 *
 * The store is an in-memory module singleton (the `coreRefs` precedent), NOT
 * sessionStorage: a module singleton survives the client-side Explore→Alerts
 * navigation within the same SPA tab — the real cross-surface case, since both
 * create flyouts live in this plugin — while a hard reload cleanly falls back
 * to the poll (safe) instead of resurrecting a possibly-dead row (zombie risk).
 *
 * The reconcile that increments attempts / evicts / warns runs exactly once per
 * querier refetch — the effect below keys on `rules` alone, so an `addPending`
 * (which mutates the store, not `rules`) can never spuriously bump attempts or
 * loop. The rendered view is a separate pure derivation over `[rules, pending,
 * …]`, so a freshly-added optimistic row appears immediately.
 */
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { UnifiedRuleSummary } from '../../../../common/types/alerting';
import {
  DEFAULT_PENDING_RULES_CONFIG,
  EvictReason,
  mergePending,
  PendingEntry,
  PendingRulesConfig,
  reconcilePending,
} from '../monitors_table/pending_rules';

// ============================================================================
// Singleton store
// ============================================================================

type Listener = () => void;

let entries: PendingEntry[] = [];
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

export const pendingRulesStore = {
  getSnapshot: (): PendingEntry[] => entries,
  subscribe: (l: Listener): (() => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  /**
   * Add (or replace, by key) a pending entry. Replacing on key collision means
   * re-creating the same (ds, group, name) — e.g. after a failed-then-retried
   * save — resets the clock rather than stacking duplicate rows.
   */
  add: (entry: PendingEntry): void => {
    entries = [...entries.filter((e) => e.key !== entry.key), entry];
    emit();
  },
  /** Commit the post-reconcile survivor set. */
  replace: (next: PendingEntry[]): void => {
    entries = next;
    emit();
  },
  /** Drop entries whose datasource is not in `keepDsIds` (datasource-change scope). */
  dropOutsideDsIds: (keepDsIds: string[]): void => {
    const keep = new Set(keepDsIds);
    const filtered = entries.filter((e) => keep.has(e.dsId));
    if (filtered.length !== entries.length) {
      entries = filtered;
      emit();
    }
  },
  /** Test-only reset. */
  _reset: (): void => {
    entries = [];
    emit();
  },
};

// ============================================================================
// Hook
// ============================================================================

export interface UsePendingRulesParams {
  /** Canonical querier rows from `useRulesData`. */
  rules: UnifiedRuleSummary[];
  /** Ids the user has optimistically deleted (page-level overlay). */
  deletedRuleIds: Set<string>;
  /** Currently selected datasource ids — scopes which pending rows are shown. */
  selectedDsIds: string[];
  /**
   * Fired once per entry that timed out (aged past `ttlMs`). The page shows a
   * soft WARNING toast — a timeout means "not propagated yet", not "creation
   * failed".
   */
  onEvictWarning: (entry: PendingEntry, reason: Extract<EvictReason, 'expired'>) => void;
  config?: PendingRulesConfig;
}

export interface UsePendingRulesResult {
  /** Querier rows with unconfirmed optimistic rows layered on top. */
  mergedRules: UnifiedRuleSummary[];
  /** Register an optimistic row (call right after a successful create POST). */
  addPending: (entry: PendingEntry) => void;
  /** Drop pending entries outside the given datasource ids (on selection change). */
  dropPendingOutsideDsIds: (keepDsIds: string[]) => void;
}

export function usePendingRules({
  rules,
  deletedRuleIds,
  selectedDsIds,
  onEvictWarning,
  config = DEFAULT_PENDING_RULES_CONFIG,
}: UsePendingRulesParams): UsePendingRulesResult {
  const pending = useSyncExternalStore(pendingRulesStore.subscribe, pendingRulesStore.getSnapshot);

  // Keep the newest closures/values available to the rules-keyed effect without
  // widening its dependency list (which would re-run the reconcile — and bump
  // attempts — on every selection change).
  const onEvictWarningRef = useRef(onEvictWarning);
  onEvictWarningRef.current = onEvictWarning;
  const deletedRef = useRef(deletedRuleIds);
  deletedRef.current = deletedRuleIds;
  const selectedRef = useRef(selectedDsIds);
  selectedRef.current = selectedDsIds;

  useEffect(() => {
    const snapshot = pendingRulesStore.getSnapshot();
    if (snapshot.length === 0) return; // nothing to reconcile — stay idle
    const { nextPending, evicted } = reconcilePending(
      rules,
      snapshot,
      deletedRef.current,
      Date.now(),
      selectedRef.current,
      config
    );
    pendingRulesStore.replace(nextPending);
    for (const ev of evicted) {
      if (ev.reason === 'expired') {
        onEvictWarningRef.current(ev.entry, ev.reason);
      }
    }
    // Reconcile rides the querier refetch: `rules` identity changes once per
    // poll / refetch. Intentionally NOT keyed on pending/selection/deleted.
  }, [rules, config]);

  const mergedRules = useMemo(
    () => mergePending(rules, pending, deletedRuleIds, selectedDsIds),
    [rules, pending, deletedRuleIds, selectedDsIds]
  );

  const addPending = useCallback((entry: PendingEntry) => pendingRulesStore.add(entry), []);
  const dropPendingOutsideDsIds = useCallback(
    (keepDsIds: string[]) => pendingRulesStore.dropOutsideDsIds(keepDsIds),
    []
  );

  return { mergedRules, addPending, dropPendingOutsideDsIds };
}
