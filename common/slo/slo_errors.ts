/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Typed errors thrown by SloService. Handlers map these to HTTP status codes:
 *   SloValidationError      → 400
 *   SloNotFoundError        → 404
 *   SloVersionConflictError → 409
 *   SloRulerError           → preserves upstream HTTP status (4xx/5xx)
 *
 * Grouped by purpose — they're always imported together.
 */

/* eslint-disable max-classes-per-file */

import type { SloDocument } from './slo_types';

export class SloValidationError extends Error {
  constructor(public readonly errors: Record<string, string>) {
    super(`SLO validation failed: ${JSON.stringify(errors)}`);
    this.name = 'SloValidationError';
  }
}

export class SloNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`SLO not found: ${id}`);
    this.name = 'SloNotFoundError';
  }
}

export class SloVersionConflictError extends Error {
  constructor(public readonly current: SloDocument, public readonly attemptedVersion: number) {
    super(
      `SLO version conflict: client sent version ${attemptedVersion} but server has ${current.status.version}`
    );
    this.name = 'SloVersionConflictError';
  }
}

/**
 * Stable error codes for ruler dual-write failures (W1.5, design memo
 * "Error surface contract"). The wizard branches on `code` to render a
 * self-service message; the raw upstream body is preserved so the user
 * can read Cortex's own diagnostic (e.g. "invalid PromQL: parse error").
 */
export type SloRulerErrorCode =
  | 'RULER_VALIDATION_FAILED'
  | 'RULER_AUTH_FAILED'
  | 'RULER_UNREACHABLE';

/**
 * Thrown when the ruler dual-write fails during SLO create / update / delete.
 * Wraps the underlying DirectQuery transport error, preserving the upstream
 * HTTP status and raw body verbatim so the wizard can show a self-service
 * diagnostic without needing a separate lookup.
 *
 * Fail-loud semantics (memo): no retry, no backoff, one call only. If this
 * escapes `SloService.create/update`, the SO was never written.
 */
export class SloRulerError extends Error {
  constructor(
    public readonly code: SloRulerErrorCode,
    public readonly httpStatus: number,
    public readonly rawBody: string,
    message?: string
  ) {
    super(message ?? `Ruler ${code} (HTTP ${httpStatus}): ${rawBody}`);
    this.name = 'SloRulerError';
  }
}

/**
 * Thrown when `SloService.delete` is asked to tear down an SLO with a
 * provisioned rule group but has no deploy context — typically because the
 * SLO's `datasourceId` is no longer registered (datasource was removed or
 * renamed). Delete is ruler-first, so we refuse to drop the SO here: that
 * would leave a dangling rule group in Cortex still evaluating against the
 * live cluster. The user has to restore the datasource (or the operator has
 * to force a ruler-side cleanup) before the SLO can be removed.
 */
export class SloRulerTeardownRequiredError extends Error {
  constructor(public readonly sloId: string, public readonly datasourceId: string) {
    super(
      `Cannot delete SLO "${sloId}": its datasource "${datasourceId}" is not registered, ` +
        `so the rule group cannot be removed from Cortex. Re-register the datasource and retry.`
    );
    this.name = 'SloRulerTeardownRequiredError';
  }
}

/**
 * Stable error codes for Phase 4 SLO orphan-recovery.
 * Route handlers map these to HTTP statuses and the UI branches on them to
 * render diagnostic copy.
 *
 *   ORPHAN_SPEC_DRIFT        — embedded provenance spec no longer matches the
 *                              ruler-side rules (sha256 drift, missing
 *                              recording groups, or fails current validation).
 *   ORPHAN_WORKSPACE_MISMATCH — orphan belongs to a different
 *                              datasource / workspace than the caller's.
 *   ORPHAN_CLAIM_CONFLICT    — another live SLO already owns the id or a
 *                              ref-store write collided mid-recover.
 *   ORPHAN_UNSUPPORTED_SCHEMA — provenance schemaVersion not recognized
 *                              (future plugin wrote it, or it's corrupted).
 *   ORPHAN_TOMBSTONED        — SLO was deliberately deleted; caller must
 *                              re-confirm before adoption proceeds.
 */
export type AdoptionErrorCode =
  | 'ORPHAN_SPEC_DRIFT'
  | 'ORPHAN_WORKSPACE_MISMATCH'
  | 'ORPHAN_CLAIM_CONFLICT'
  | 'ORPHAN_UNSUPPORTED_SCHEMA'
  | 'ORPHAN_TOMBSTONED';

/**
 * Thrown by `SloService.recover` when an adoption precondition fails. `code`
 * is the stable contract surface B2B's route handlers map to HTTP statuses;
 * `context` carries structured hints the UI can surface without re-parsing
 * the message.
 */
export class SloAdoptionError extends Error {
  constructor(
    public readonly code: AdoptionErrorCode,
    message: string,
    public readonly context?: Record<string, string>
  ) {
    super(message);
    this.name = 'SloAdoptionError';
  }
}
