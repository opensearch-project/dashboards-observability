/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `slo-definition` v2 migration (Phase 3 W3.5).
 *
 * Rewrites `status.provisioning` so existing SLOs gain the dedup-era fields
 * (`recordingFingerprints`, `alertGroupName`, `needsRedeploy`). See
 * SLO_RULE_DEDUP_PLAN.md "Breaking changes accepted" — the migration is
 * additive (it only adds fields; whatever was in `provisioning` is spread
 * through unchanged) and safe to run unconditionally. It does NOT consult
 * the feature flag.
 *
 * Workspace scoping: Phase 3 uses `spec.datasourceId` as the workspace
 * discriminator (`workspaceId === datasourceId`). Same assumption as the
 * reconciler. When a real workspace id lands, re-keyable in a dedicated
 * migration.
 */

import { computeSliFingerprint } from '../../../common/slo/slo_sli_fingerprint';
import { ruleSuffix, slugifySloObjective } from '../../../common/slo/slo_promql_generator';
import type { SloDocument } from '../../../common/slo/slo_types';

/**
 * OSD SavedObject migration version string. Used as the key under which this
 * function is registered in the `migrations` map on the `slo-definition`
 * type. Consumers import this constant by name so the registration site
 * doesn't have to duplicate the version string.
 */
export const SLO_V2_MIGRATION_VERSION = '2.0.0';

/**
 * OSD migration context shape — we only use it for the logger slot. Typed
 * locally so the migration doesn't import from OSD internals that Jest has
 * trouble resolving under a bare plugin test config.
 */
interface SloV2MigrationContext {
  log?: {
    warn?: (msg: string) => void;
    info?: (msg: string) => void;
  };
}

interface SavedObjectInput<T> {
  id?: string;
  attributes: T;
  [key: string]: unknown;
}

/**
 * Migrator. Accepts the raw saved-object shape OSD hands migrations
 * (`{ id?, attributes, ... }`) and returns the migrated copy. Rejects silently
 * (returns the input unchanged with a warning log) on malformed docs so a
 * single bad SO doesn't block startup for the whole index.
 */
export function sloV2Migration<T extends SavedObjectInput<Partial<SloDocument>>>(
  doc: T,
  context?: SloV2MigrationContext
): T {
  const attrs = doc.attributes;
  if (!attrs || typeof attrs !== 'object' || !attrs.spec || !attrs.status) {
    context?.log?.warn?.(
      `slo_v2 migration: skipping document ${doc.id ?? '<unknown>'} — missing spec or status`
    );
    return doc;
  }
  const provisioning = attrs.status.provisioning;
  if (!provisioning || provisioning.backend !== 'prometheus') {
    // Nothing to migrate — non-Prometheus backends don't own a per-objective
    // recording group split.
    return doc;
  }

  const hasRecordingFingerprints =
    provisioning.recordingFingerprints !== undefined &&
    Object.keys(provisioning.recordingFingerprints).length > 0;
  const hasAlertGroupName = typeof provisioning.alertGroupName === 'string';
  const hasNeedsRedeploy = provisioning.needsRedeploy === true;

  if (hasRecordingFingerprints && hasAlertGroupName && hasNeedsRedeploy) {
    // Fully migrated already — idempotent re-run.
    return doc;
  }

  const spec = attrs.spec;
  if (!spec.datasourceId || !Array.isArray(spec.objectives) || !spec.name) {
    context?.log?.warn?.(
      `slo_v2 migration: skipping document ${
        doc.id ?? '<unknown>'
      } — spec is missing required fields`
    );
    return doc;
  }

  const workspaceId = spec.datasourceId; // Phase 3 scope: ws == ds (see file header).
  const sloId = typeof doc.id === 'string' ? doc.id : undefined;
  if (!sloId) {
    context?.log?.warn?.(
      `slo_v2 migration: skipping document with no id — cannot compute rule-name suffix`
    );
    return doc;
  }

  const recordingFingerprints: Record<string, string> = {};
  if (spec.sli) {
    for (const objective of spec.objectives) {
      if (!objective || typeof objective.name !== 'string') continue;
      const fp = computeSliFingerprint(spec.datasourceId, spec.sli, objective);
      if (fp !== null) {
        recordingFingerprints[objective.name] = fp;
      }
    }
  }

  const slug = slugifySloObjective(spec.name, 'group');
  const suffix = ruleSuffix(workspaceId, sloId, 'group');
  const alertGroupName = `slo:alerts:${slug}_${suffix}`;

  const nextProvisioning = {
    ...provisioning,
    recordingFingerprints,
    alertGroupName,
    needsRedeploy: true,
  };

  context?.log?.info?.(
    `slo_v2 migration: rewrote provisioning for SLO ${sloId} — ${
      Object.keys(recordingFingerprints).length
    } fingerprint(s), alertGroup=${alertGroupName}`
  );

  return {
    ...doc,
    attributes: {
      ...attrs,
      status: {
        ...attrs.status,
        provisioning: nextProvisioning,
      },
    },
  };
}
