/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Background re-provisioning of SLO recording groups that record an older
 * version of the SLI math.
 *
 * Recording rules are named after the SLI fingerprint (or SLO id), not the
 * expression, so a fix to the generated math never reaches SLOs that already
 * exist: create only writes a shared recording group when its refcount was
 * zero, and repair used to stop at "every group is present". The rule-health
 * checker now flags groups without the current `slo_rules_version`; the
 * status read path hands those SLOs to this scheduler, which runs the normal
 * repair (a pure regenerate + in-place upsert) off the response path.
 *
 * Runs inside a user request's scope on purpose: the ruler write needs the
 * same per-request credentials as any other SLO write, and some deployments
 * have no system identity that can write rules. Bounded so a listing of many
 * outdated SLOs can't fan out into a burst of ruler writes:
 *   - at most `maxInFlight` repairs at once across the process; the rest wait
 *     in a FIFO queue (at most `maxQueued`, each for at most `maxQueueAgeMs`),
 *     so one listing visit heals every outdated SLO it saw instead of two per
 *     poll;
 *   - one attempt per SLO per `cooldownMs`;
 *   - failures back off exponentially up to `maxBackoffMs`, and are logged
 *     at warn only on the first failure per SLO.
 */

import type { Logger } from '../../../common/types/alerting';

export interface OutdatedRuleRepairerOptions {
  /** Minimum gap between attempts for one SLO. Default 15 min. */
  cooldownMs?: number;
  /** Cap on the failure backoff. Default 24 h. */
  maxBackoffMs?: number;
  /** Concurrent repairs across all SLOs. Default 2. */
  maxInFlight?: number;
  /** Repairs waiting for a slot; further requests are dropped. Default 200. */
  maxQueued?: number;
  /**
   * A queued repair older than this is dropped instead of run: it holds the
   * request scope it was scheduled from, and the next status read re-queues
   * it with a fresh one. Default 60 s.
   */
  maxQueueAgeMs?: number;
  now?: () => number;
}

interface Attempt {
  nextAllowedAt: number;
  failures: number;
}

interface Job {
  key: string;
  repair: () => Promise<void>;
  done: () => void;
  queuedAt: number;
}

export class OutdatedRuleRepairer {
  private readonly attempts = new Map<string, Attempt>();
  private readonly inFlightKeys = new Set<string>();
  private readonly queue: Job[] = [];
  private readonly queuedKeys = new Set<string>();
  private readonly cooldownMs: number;
  private readonly maxBackoffMs: number;
  private readonly maxInFlight: number;
  private readonly maxQueued: number;
  private readonly maxQueueAgeMs: number;
  private readonly now: () => number;

  constructor(
    private readonly logger: Logger,
    opts: OutdatedRuleRepairerOptions = {}
  ) {
    this.cooldownMs = opts.cooldownMs ?? 15 * 60_000;
    this.maxBackoffMs = opts.maxBackoffMs ?? 24 * 3_600_000;
    this.maxInFlight = opts.maxInFlight ?? 2;
    this.maxQueued = opts.maxQueued ?? 200;
    this.maxQueueAgeMs = opts.maxQueueAgeMs ?? 60_000;
    this.now = opts.now ?? Date.now;
  }

  /**
   * Run `repair` for `key` (one SLO) now, or queue it when the process is at
   * its in-flight cap. Skipped when the SLO is already running or queued, is
   * cooling down, or the queue is full. Never throws and never blocks the
   * caller. Returns a promise that settles when this SLO's repair finishes
   * (tests await it), or `undefined` when the request was skipped.
   */
  schedule(key: string, repair: () => Promise<void>): Promise<void> | undefined {
    this.pruneAttempts();
    if (this.inFlightKeys.has(key) || this.queuedKeys.has(key)) return undefined;
    const prev = this.attempts.get(key);
    if (prev && prev.nextAllowedAt > this.now()) return undefined;
    if (this.inFlightKeys.size >= this.maxInFlight && this.queue.length >= this.maxQueued) {
      return undefined;
    }

    return new Promise<void>((resolve) => {
      this.queue.push({ key, repair, done: resolve, queuedAt: this.now() });
      this.queuedKeys.add(key);
      this.drain();
    });
  }

  private drain(): void {
    while (this.inFlightKeys.size < this.maxInFlight && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.queuedKeys.delete(job.key);
      if (this.now() - job.queuedAt > this.maxQueueAgeMs) {
        job.done();
        continue;
      }
      void this.run(job);
    }
  }

  /**
   * Forget SLOs whose cooldown has passed with no outstanding failures —
   * keeps the map from accumulating entries for SLOs that were since repaired
   * or deleted. Failed entries stay so their backoff is honoured.
   */
  private pruneAttempts(): void {
    const nowMs = this.now();
    for (const [key, attempt] of this.attempts) {
      if (attempt.failures === 0 && attempt.nextAllowedAt <= nowMs && !this.inFlightKeys.has(key)) {
        this.attempts.delete(key);
      }
    }
  }

  private async run(job: Job): Promise<void> {
    const { key } = job;
    const prev = this.attempts.get(key);
    this.inFlightKeys.add(key);
    // Reserve the cooldown up front so a burst of listing polls can't
    // re-enter while this attempt is still running.
    this.attempts.set(key, {
      nextAllowedAt: this.now() + this.cooldownMs,
      failures: prev?.failures ?? 0,
    });
    try {
      await job.repair();
      this.attempts.set(key, { nextAllowedAt: this.now() + this.cooldownMs, failures: 0 });
      this.logger.info(`SLO rules re-provisioned to the current SLI math (${key})`);
    } catch (err) {
      const failures = (prev?.failures ?? 0) + 1;
      const backoff = Math.min(this.cooldownMs * 2 ** (failures - 1), this.maxBackoffMs);
      this.attempts.set(key, { nextAllowedAt: this.now() + backoff, failures });
      const msg = `Re-provisioning outdated SLO rules failed (${key}, attempt ${failures}): ${
        err instanceof Error ? err.message : String(err)
      }`;
      if (failures === 1) this.logger.warn(msg);
      else this.logger.debug(msg);
    } finally {
      this.inFlightKeys.delete(key);
      job.done();
      this.drain();
    }
  }
}
