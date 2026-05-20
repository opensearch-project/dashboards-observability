/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 4 W4.4 / W4.5 shared contract.
 *
 * B2B's route handlers (Phase 4 W4.6) import from this module to type-check
 * request / response bodies and to map error codes to HTTP statuses. The
 * service-layer input/result shapes are defined in `slo_service.ts`; we
 * re-export them from here so the route layer only has to import one
 * module.
 *
 * This file is deliberately server/browser agnostic — no ruler client, no
 * OSD client types — so it can be consumed from `public/` as well once the
 * Batch 3 UI lands.
 */

import type { SloDocument } from './slo_types';

export type { AdoptionErrorCode, SloAdoptionError } from './slo_errors';
export type { VerifyProvenanceReason, VerifyProvenanceResult } from './slo_adoption_verify';
import type { AdoptionErrorCode } from './slo_errors';

// ============================================================================
// Recover — W4.4
// ============================================================================

export interface RecoverInput {
  /** SLO id from the orphan's alert-group provenance annotation. */
  sloId: string;
  /** Datasource the orphan lives on. Must match provenance.datasourceId. */
  datasourceId: string;
  /** Caller-supplied current workspace. Must match provenance.workspaceId. */
  workspaceId: string;
  /**
   * Set true to adopt even if a tombstone exists for this sloId. The UI
   * surfaces a confirmation flyout (tombstone.createdAt, tombstone.reason)
   * before asking the service to override.
   */
  acknowledgeTombstone?: boolean;
}

export interface RecoverRefcountChange {
  fingerprint: string;
  previousRefcount: number;
  newRefcount: number;
}

export interface RecoverResult {
  slo: SloDocument;
  /** True iff a live tombstone was surfaced and the caller acknowledged it. */
  tombstoneCleared: boolean;
  /** Per-fingerprint refcount transitions during recovery. */
  refcountChanges: RecoverRefcountChange[];
}

// ============================================================================
// Orphan listing — consumed by W4.6 GET /_orphans response shaping
// ============================================================================

/**
 * Summary row the adoption listing UI renders. Routes fill this in from the
 * reconciler's orphan detector plus `verifyProvenance` — the point of this
 * contract is to keep the HTTP response shape stable even if the detector's
 * internal types evolve.
 */
export interface OrphanAdoptionCandidate {
  sloId: string;
  datasourceId: string;
  workspaceId: string;
  alertGroupName: string;
  /** Provenance-reported createdAt; displays as "Provisioned on …". */
  createdAt: string;
  updatedAt: string;
  /** Spec name (from the embedded provenance.spec.name). */
  name: string;
  /**
   * Outcome of `verifyProvenance` for this candidate. When `ok === true`,
   * the UI can offer Recover without a warning banner; otherwise the
   * `reason` carries the diagnostic and Recover is disabled for the row.
   */
  verification: {
    ok: boolean;
    reason?: import('./slo_adoption_verify').VerifyProvenanceReason;
    missingRecordingGroups?: string[];
  };
  /**
   * True when a tombstone exists for this sloId — the UI surfaces the
   * "this SLO was previously deleted" confirmation before submitting a
   * recover call.
   */
  hasTombstone?: boolean;
}

// ============================================================================
// Error envelope the route layer returns alongside HTTP error statuses
// ============================================================================

export interface AdoptionErrorEnvelope {
  code: AdoptionErrorCode;
  message: string;
  sloId?: string;
  datasourceId?: string;
  /** Optional structured hints — mirrors `SloAdoptionError.context`. */
  context?: Record<string, string>;
}
