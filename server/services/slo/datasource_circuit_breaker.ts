/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Per-datasource health tracker. Used by the status aggregator to fast-fail
 * fetches against a Prometheus that has been failing recently, rather than
 * paying the timeout cost on every listing request.
 *
 * The aggregator already isolates a single bad datasource from the rest of
 * the listing — this layer protects against the second-and-beyond request
 * to a known-broken datasource by short-circuiting to a `no_data`
 * degradation without issuing the network call. Critically, the breaker
 * is per-server-instance and in-memory; it makes no claim about cluster-
 * wide datasource health and never blocks a fresh request after cooldown.
 *
 * State machine: closed → (failures within window) → open →
 * (cooldown elapsed) → half-open → (one trial) → closed | open.
 */

interface FailureRecord {
  /** Timestamps (ms) of recent failures within the rolling window. */
  failures: number[];
  /** When > 0, circuit is open until this ms timestamp. */
  openUntil: number;
}

export interface DatasourceCircuitBreakerOptions {
  /** Failures within `windowMs` to trip the breaker. Default 3. */
  failureThreshold?: number;
  /** Rolling window for counting failures. Default 60s. */
  windowMs?: number;
  /** Cooldown after opening before entering half-open. Default 60s. */
  cooldownMs?: number;
  /** Override for tests. */
  now?: () => number;
  /** Optional sink for transition logs (open/close events). */
  onTransition?: (datasourceId: string, transition: 'open' | 'close') => void;
}

const DEFAULT_THRESHOLD = 3;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_COOLDOWN_MS = 60_000;

export class DatasourceCircuitBreaker {
  private readonly state = new Map<string, FailureRecord>();
  private readonly threshold: number;
  private readonly windowMs: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private readonly onTransition?: (id: string, t: 'open' | 'close') => void;

  constructor(opts: DatasourceCircuitBreakerOptions = {}) {
    this.threshold = opts.failureThreshold ?? DEFAULT_THRESHOLD;
    this.windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
    this.cooldownMs = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.now = opts.now ?? (() => Date.now());
    this.onTransition = opts.onTransition;
  }

  /**
   * True when the breaker is open and the cooldown has not elapsed. Callers
   * MUST treat this as a hint to skip the network call and degrade
   * gracefully (no_data). Returns false in half-open state — that's the
   * "one trial allowed" pass.
   */
  isOpen(datasourceId: string): boolean {
    const rec = this.state.get(datasourceId);
    if (!rec || rec.openUntil === 0) return false;
    return this.now() < rec.openUntil;
  }

  /** Record a successful call. Closes the breaker if it was open. */
  recordSuccess(datasourceId: string): void {
    const rec = this.state.get(datasourceId);
    if (!rec) return;
    const wasOpen = rec.openUntil > 0;
    rec.failures = [];
    rec.openUntil = 0;
    if (wasOpen) this.onTransition?.(datasourceId, 'close');
  }

  /**
   * Record a failed call. May open the breaker if the failure count within
   * `windowMs` reaches `threshold`. Half-open trial failure re-opens with a
   * fresh full cooldown.
   */
  recordFailure(datasourceId: string): void {
    const t = this.now();
    let rec = this.state.get(datasourceId);
    if (!rec) {
      rec = { failures: [], openUntil: 0 };
      this.state.set(datasourceId, rec);
    }
    // Drop expired entries from the rolling window.
    const cutoff = t - this.windowMs;
    rec.failures = rec.failures.filter((ts) => ts >= cutoff);
    rec.failures.push(t);

    const wasOpen = rec.openUntil > 0 && t < rec.openUntil;
    if (rec.failures.length >= this.threshold || (rec.openUntil > 0 && t >= rec.openUntil)) {
      rec.openUntil = t + this.cooldownMs;
      if (!wasOpen) this.onTransition?.(datasourceId, 'open');
    }
  }
}
