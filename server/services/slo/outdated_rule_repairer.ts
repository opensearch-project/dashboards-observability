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
 *   - at most `maxInFlight` repairs at once across the process;
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
  now?: () => number;
}

interface Attempt {
  nextAllowedAt: number;
  failures: number;
}

export class OutdatedRuleRepairer {
  private readonly attempts = new Map<string, Attempt>();
  private readonly inFlightKeys = new Set<string>();
  private readonly cooldownMs: number;
  private readonly maxBackoffMs: number;
  private readonly maxInFlight: number;
  private readonly now: () => number;

  constructor(
    private readonly logger: Logger,
    opts: OutdatedRuleRepairerOptions = {}
  ) {
    this.cooldownMs = opts.cooldownMs ?? 15 * 60_000;
    this.maxBackoffMs = opts.maxBackoffMs ?? 24 * 3_600_000;
    this.maxInFlight = opts.maxInFlight ?? 2;
    this.now = opts.now ?? Date.now;
  }

  /**
   * Run `repair` for `key` (one SLO) unless it's already running, cooling
   * down, or the process is at its in-flight cap. Never throws and never
   * blocks the caller. Returns the in-flight promise when a repair started
   * (tests await it), or `undefined` when the request was skipped.
   */
  schedule(key: string, repair: () => Promise<void>): Promise<void> | undefined {
    if (this.inFlightKeys.has(key)) return undefined;
    if (this.inFlightKeys.size >= this.maxInFlight) return undefined;
    const prev = this.attempts.get(key);
    const nowMs = this.now();
    if (prev && prev.nextAllowedAt > nowMs) return undefined;

    this.inFlightKeys.add(key);
    // Reserve the cooldown up front so a burst of listing polls can't
    // re-enter while this attempt is still running.
    this.attempts.set(key, {
      nextAllowedAt: nowMs + this.cooldownMs,
      failures: prev?.failures ?? 0,
    });

    return (async () => {
      try {
        await repair();
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
      }
    })();
  }
}
