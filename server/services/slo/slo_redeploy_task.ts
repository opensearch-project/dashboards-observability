/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 3 W3.10 — post-migration SLO redeploy task.
 *
 * After the `slo_v2` migration stamps `needsRedeploy: true` on existing
 * `slo-definition` SOs, this task sweeps the SO store once at plugin
 * `start()` (and optionally on admin trigger) to bring the ruler side up to
 * the dedup-era shape:
 *
 *   1. Compute fingerprints for the doc's spec + objectives.
 *   2. Upsert each unique fingerprint's shared recording group via the
 *      refcount registry (dedup applies — byte-equal groups are no-ops).
 *   3. Upsert the per-SLO alert group.
 *   4. Delete the old monolithic `slo:<slug>_<suffix>` group (kept around by
 *      the migration for backwards compat while the flag is toggleable).
 *   5. Persist the updated SO with `needsRedeploy: false`.
 *
 * Partial-failure tolerant: any doc that blows up is logged and the sweep
 * continues with the next one. Idempotent — running the task again after a
 * partial failure resumes where it left off because the `needsRedeploy` flag
 * guards re-entry.
 *
 * Concurrency: the task is a one-shot loop, not a timer. Callers should only
 * invoke it once per plugin boot (or on an admin endpoint); concurrent
 * invocations are safe because each step uses the optimistic-concurrency
 * registry and the ruler's replace-in-place semantics.
 */

import type { AlertingOSClient, Datasource, Logger } from '../../../common/types/alerting/types';
import type { ISloStore, SloDocument, SloSpec } from '../../../common/slo/slo_types';
import {
  dedupAlertGroupName,
  dedupRecordingGroupName,
  generateAlertGroupFor,
  generateRecordingGroupForFingerprint,
  ruleSuffix,
  slugifySloObjective,
} from '../../../common/slo/slo_promql_generator';
import {
  annotateAlertGroup,
  buildAlertProvenance,
  buildSentinelAlert,
  PROVENANCE_SCHEMA_VERSION,
} from '../../../common/slo/slo_rule_provenance';
import {
  computeSliFingerprint,
  FINGERPRINT_VERSION,
} from '../../../common/slo/slo_sli_fingerprint';
import { sloRulerNamespaceFor } from '../../../common/slo/slo_service';
import type { InMemoryDatasourceService } from '../alerting/datasource_service';
import type { RulerClient } from './ruler_client';
import type { SloRuleRefStore } from './slo_rule_ref_store';

export interface SloRedeployTaskDeps {
  store: ISloStore;
  ruler: RulerClient;
  refStore: SloRuleRefStore;
  datasourceService: InMemoryDatasourceService;
  buildClient: (ds: Datasource) => AlertingOSClient;
  logger: Logger;
  /** Stamped on provenance annotations. Defaults to '0.0.0'. */
  pluginVersion?: string;
  /**
   * Map a persisted datasourceId to a workspace id. Matches the reconciler's
   * default identity function (Phase 3 scope: ws === ds).
   */
  workspaceIdForDatasource?: (datasourceId: string) => string;
  /** Injected for deterministic tests. */
  now?: () => Date;
}

export interface SloRedeployResult {
  candidates: number;
  redeployed: number;
  skipped: number;
  errors: Array<{ sloId: string; message: string }>;
}

export interface SloRedeployTask {
  redeployOnce(): Promise<SloRedeployResult>;
}

/**
 * Factory. Keeps the dep bundle in a closure so callers only see the
 * `SloRedeployTask` interface.
 */
export function createSloRedeployTask(deps: SloRedeployTaskDeps): SloRedeployTask {
  const now = deps.now ?? (() => new Date());
  const workspaceIdFor = deps.workspaceIdForDatasource ?? ((datasourceId: string) => datasourceId);
  const pluginVersion = deps.pluginVersion ?? '0.0.0';

  async function redeployOnce(): Promise<SloRedeployResult> {
    const docs = await deps.store.list();
    const candidates = docs.filter(
      (d) =>
        d.status.provisioning.backend === 'prometheus' &&
        d.status.provisioning.needsRedeploy === true
    );

    const errors: Array<{ sloId: string; message: string }> = [];
    let redeployed = 0;
    let skipped = 0;

    for (const doc of candidates) {
      try {
        const migrated = await redeployOne(doc);
        if (migrated) {
          redeployed += 1;
        } else {
          skipped += 1;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ sloId: doc.id, message });
        deps.logger.warn(`SloRedeployTask: ${doc.id} failed: ${message}`);
      }
    }

    deps.logger.info(
      `SloRedeployTask: candidates=${candidates.length} redeployed=${redeployed} skipped=${skipped} errors=${errors.length}`
    );
    return { candidates: candidates.length, redeployed, skipped, errors };
  }

  async function redeployOne(doc: SloDocument): Promise<boolean> {
    if (doc.status.provisioning.backend !== 'prometheus') return false;
    const spec = doc.spec;
    const workspaceId = workspaceIdFor(spec.datasourceId);
    const namespace = sloRulerNamespaceFor(workspaceId);

    const datasource = await deps.datasourceService.get(spec.datasourceId);
    if (!datasource) {
      throw new Error(
        `Datasource "${spec.datasourceId}" is not registered — cannot redeploy SLO ${doc.id}`
      );
    }
    if (!datasource.directQueryName) {
      throw new Error(`Datasource "${datasource.name}" is not a DirectQuery Prometheus connection`);
    }
    const client = deps.buildClient(datasource);

    // Compute fingerprints from the spec — the migration stubs these in but
    // we recompute to guard against a broken migration run.
    const recordingFingerprints: Record<string, string> = {};
    for (const objective of spec.objectives) {
      const fp = computeSliFingerprint(spec.datasourceId, spec.sli, objective);
      if (fp !== null) recordingFingerprints[objective.name] = fp;
    }
    const uniqueFps = [...new Set(Object.values(recordingFingerprints))];

    // Increment refs + upsert recording groups when wasZero.
    for (const fp of uniqueFps) {
      const representative = pickRepresentative(spec, recordingFingerprints, fp);
      if (!representative) continue;
      const groupName = dedupRecordingGroupName(fp);
      const { wasZero } = await deps.refStore.incrementRef({
        workspaceId,
        datasourceId: spec.datasourceId,
        fingerprint: fp,
        fingerprintVersion: FINGERPRINT_VERSION,
        groupName,
        namespace,
      });
      if (wasZero) {
        const recGroup = generateRecordingGroupForFingerprint({
          fingerprint: fp,
          sli: representative.sli,
          objectiveLatencyThreshold: representative.latencyThreshold,
        });
        if (recGroup) {
          await deps.ruler.upsertRuleGroup(client, datasource, namespace, recGroup);
        }
      }
    }

    // Upsert the alert group with provenance + sentinel-as-needed.
    const alertGroupName = dedupAlertGroupName(spec.name, workspaceId, doc.id);
    const alertGroup = generateAlertGroupFor(doc, recordingFingerprints, { workspaceId });
    const alertProvenance = buildAlertProvenance({
      pluginVersion,
      sloId: doc.id,
      workspaceId,
      datasourceId: spec.datasourceId,
      createdAt: doc.status.createdAt,
      updatedAt: now().toISOString(),
      spec,
    });
    const annotatedAlert =
      alertGroup.rules.length === 0
        ? annotateAlertGroup(
            { ...alertGroup, rules: [buildSentinelAlert(doc.id, alertProvenance)] },
            alertProvenance
          )
        : annotateAlertGroup(alertGroup, alertProvenance);
    await deps.ruler.upsertRuleGroup(client, datasource, namespace, annotatedAlert);

    // Delete the old monolithic group — distinct from the alert group name.
    const oldRuleGroupName = legacyMonolithicGroupName(spec, workspaceId, doc.id);
    if (oldRuleGroupName && oldRuleGroupName !== alertGroupName) {
      try {
        await deps.ruler.deleteRuleGroup(client, datasource, namespace, oldRuleGroupName);
      } catch (err) {
        // 404s are swallowed in-client (W1.1); anything else surfaces.
        deps.logger.warn(
          `SloRedeployTask: failed to delete old group ${oldRuleGroupName} for ${doc.id}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }

    // Persist the refreshed SO.
    const updated: SloDocument = {
      ...doc,
      status: {
        ...doc.status,
        updatedAt: now().toISOString(),
        provisioning: {
          backend: 'prometheus',
          rulerNamespace: namespace,
          recordingFingerprints,
          alertGroupName,
          needsRedeploy: false,
        },
      },
    };
    await deps.store.save(updated);

    deps.logger.info(
      `SloRedeployTask: ${doc.id} redeployed — ${uniqueFps.length} fingerprint(s), schemaVersion=${PROVENANCE_SCHEMA_VERSION}`
    );
    return true;
  }

  return { redeployOnce };
}

function pickRepresentative(
  spec: SloSpec,
  recordingFingerprints: Record<string, string>,
  fingerprint: string
): { sli: import('../../../common/slo/slo_types').SingleSli; latencyThreshold?: number } | null {
  if (spec.sli.type !== 'single') return null;
  for (const objective of spec.objectives) {
    if (recordingFingerprints[objective.name] === fingerprint) {
      return { sli: spec.sli, latencyThreshold: objective.latencyThreshold };
    }
  }
  return null;
}

/**
 * Name of the legacy monolithic group the pre-migration SO targeted. The
 * migration carries no explicit field for this; we recompute it from spec +
 * sloId so the redeploy can delete the old `slo:<slug>_<suffix>` group
 * after upserting the new dedup-shape groups.
 */
function legacyMonolithicGroupName(spec: SloSpec, workspaceId: string, sloId: string): string {
  const slug = slugifySloObjective(spec.name, 'group');
  const suffix = ruleSuffix(workspaceId, sloId, 'group');
  return `slo:${slug}_${suffix}`;
}
