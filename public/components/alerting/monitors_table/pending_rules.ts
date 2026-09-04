/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Optimistic "pending rule" cache — pure core.
 *
 * A newly-created Prometheus/metrics alert rule is persisted synchronously to
 * Cortex's ruler CONFIG store (a 2xx from the create POST means "persisted"),
 * but the unified rules list reads the QUERIER (`/api/v1/rules`), which only
 * surfaces the rule once the ruler poll (~60s) + one evaluation interval have
 * elapsed. Between those two moments the rule genuinely exists but is invisible
 * to the list.
 *
 * This module lets the page carry an optimistic row for that window and
 * reconcile it against each querier refetch WITHOUT a dedicated timer — the
 * reconcile rides the existing 15s background poll + tab-activate + window-focus
 * refetches. A poll that hasn't yet seen the rule means "not propagated yet",
 * NOT "creation failed" — so eviction on timeout warns (soft), never errors.
 *
 * Everything here is PURE (no React, no module state, no clock) so it can be
 * exhaustively unit-tested; the singleton store + React glue live in
 * `../hooks/use_pending_rules.ts`.
 */
import type { UnifiedRuleSummary } from '../../../../common/types/alerting';

// ============================================================================
// Identity
// ============================================================================

/**
 * The single match key used everywhere a pending row must line up with its
 * eventual querier row: `${dsId}|${group}|${name}`, group + name trimmed and
 * lower-cased. This mirrors the (datasource, group, name) tuple the create-time
 * duplicate check uses (case-insensitive + trimmed) and the server's canonical
 * id `${dsId}-${group}-${name}` (`promRuleToUnified`) — but keyed off the
 * rule's `group`/`name` FIELDS rather than by parsing the id, so it degrades
 * cleanly for OpenSearch/PPL monitors (no group → empty middle segment).
 *
 * CRITICAL: at create time build the key from the create PAYLOAD's groupName
 * (`ruleGroupLabel || name`, or `form.groupName || form.monitorName`), never
 * from `formStateToRule` output — the latter carries no group, so its key
 * would never match the confirmed row.
 */
export function key(dsId: string, group: string | undefined, name: string): string {
  const g = (group ?? '').trim().toLowerCase();
  const n = (name ?? '').trim().toLowerCase();
  return `${dsId}|${g}|${n}`;
}

/**
 * True for an optimistic pending row this cache injected — status `pending`
 * AND a synthetic `new-` id. Both conditions are required: a real Cortex rule
 * whose querier state is `pending` (evaluating, not yet firing) also carries
 * status `pending`, but has a canonical id, so it must NOT be treated as one
 * of our optimistic rows (its actions work; ours would 404).
 */
export function isPending(rule: UnifiedRuleSummary): boolean {
  return rule.status === 'pending' && typeof rule.id === 'string' && rule.id.startsWith('new-');
}

// ============================================================================
// Types
// ============================================================================

export interface PendingEntry {
  /** `key(dsId, group, name)` — the match key against querier rows. */
  key: string;
  dsId: string;
  /** The row rendered while the rule is unconfirmed (status `pending`, `new-` id). */
  optimisticRule: UnifiedRuleSummary;
  /** Number of reconcile passes this entry has survived (one per querier refetch). */
  attempts: number;
  /** Epoch ms the entry was added — drives the TTL eviction. */
  createdAt: number;
  origin: 'create' | 'clone' | 'metrics' | 'batch';
}

export interface PendingRulesConfig {
  /** Max reconcile passes before giving up and warning. */
  maxAttempts: number;
  /** Wall-clock budget (ms) before giving up and warning. */
  ttlMs: number;
}

export const DEFAULT_PENDING_RULES_CONFIG: PendingRulesConfig = {
  maxAttempts: 6,
  ttlMs: 120_000,
};

export type EvictReason = 'confirmed' | 'deleted' | 'expired' | 'exhausted';

export interface EvictedEntry {
  entry: PendingEntry;
  reason: EvictReason;
}

export interface ReconcileResult {
  /** Querier rows with surviving pending rows appended (deduped by key). */
  merged: UnifiedRuleSummary[];
  /** Entries to keep for the next pass (attempts incremented). */
  nextPending: PendingEntry[];
  /** Entries removed this pass, with the reason. */
  evicted: EvictedEntry[];
}

// ============================================================================
// Merge (pure, no mutation) — used for render on every rules/pending change
// ============================================================================

/**
 * Build the view: querier rows first, then each still-pending optimistic row
 * whose datasource is currently selected and whose key hasn't yet appeared in
 * the querier response (and whose optimistic row wasn't user-deleted). Deduping
 * by key BEFORE appending guarantees there's never a two-row flash during the
 * confirm window.
 */
export function mergePending(
  querierRules: UnifiedRuleSummary[],
  pending: PendingEntry[],
  deletedRuleIds: Set<string>,
  selectedDsIds: string[]
): UnifiedRuleSummary[] {
  const querierKeys = new Set(querierRules.map((r) => key(r.datasourceId, r.group, r.name)));
  const selected = new Set(selectedDsIds);
  const appended = pending
    .filter(
      (e) =>
        selected.has(e.dsId) && !querierKeys.has(e.key) && !deletedRuleIds.has(e.optimisticRule.id)
    )
    .map((e) => e.optimisticRule);
  return [...querierRules, ...appended];
}

// ============================================================================
// Reconcile (pure) — runs once per querier refetch
// ============================================================================

/**
 * Reconcile the pending set against a fresh querier response. Per entry, in
 * priority order:
 *   (a) key present in the querier → evict (confirmed), silent.
 *   (b) optimistic id in `deletedRuleIds` → evict (deleted), never resurrected.
 *   (c) age past `ttlMs` → evict (expired), warn.
 *   (d) attempts at `maxAttempts` → evict (exhausted), warn.
 *   (e) otherwise keep and increment attempts.
 *
 * `selectedDsIds` only scopes which surviving rows are appended to `merged`
 * (an entry on a currently-unselected datasource stays pending but is hidden);
 * it never causes eviction — that's the datasource-change handler's job.
 *
 * Note: the approved design lists this as `(querierRules, pending,
 * deletedRuleIds, now, config)`; `selectedDsIds` is threaded in ahead of
 * `config` because `merged` needs it (the design body references
 * `dsId ∈ selectedDsIds`).
 */
export function reconcilePending(
  querierRules: UnifiedRuleSummary[],
  pending: PendingEntry[],
  deletedRuleIds: Set<string>,
  now: number,
  selectedDsIds: string[],
  config: PendingRulesConfig = DEFAULT_PENDING_RULES_CONFIG
): ReconcileResult {
  const querierKeys = new Set(querierRules.map((r) => key(r.datasourceId, r.group, r.name)));
  const nextPending: PendingEntry[] = [];
  const evicted: EvictedEntry[] = [];

  for (const entry of pending) {
    if (querierKeys.has(entry.key)) {
      evicted.push({ entry, reason: 'confirmed' });
      continue;
    }
    if (deletedRuleIds.has(entry.optimisticRule.id)) {
      evicted.push({ entry, reason: 'deleted' });
      continue;
    }
    // Age is checked before attempts so a slow-but-recent entry that has simply
    // ridden many polls isn't reported as "expired" (and vice-versa the age
    // gate fires even when attempts are still under the cap).
    if (now - entry.createdAt > config.ttlMs) {
      evicted.push({ entry, reason: 'expired' });
      continue;
    }
    if (entry.attempts >= config.maxAttempts) {
      evicted.push({ entry, reason: 'exhausted' });
      continue;
    }
    nextPending.push({ ...entry, attempts: entry.attempts + 1 });
  }

  const merged = mergePending(querierRules, nextPending, deletedRuleIds, selectedDsIds);
  return { merged, nextPending, evicted };
}
