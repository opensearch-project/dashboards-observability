/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SLO write path: create, update, delete, repair, enable/disable, preview,
 * and the dedup-aware refcount lookup the detail page consumes.
 *
 * Split out of the original `slo_service.ts` during the H5 decomposition.
 * Owns the ruler dual-write flow and SO compensation rollback. Reads
 * (status, listing) live in `SloStatusService` and `SloQueryService`.
 *
 * Cache invalidation across the split: when a write succeeds, this service
 * calls `statusService.invalidate(id)` so a stale status snapshot doesn't
 * outlive the underlying spec change. Both services share a `SloServiceCore`
 * — the call hops through it instead of holding a direct reference.
 */

import type { Datasource } from '../types/alerting';
import type {
  GeneratedRuleGroup,
  SloCreateInput,
  SloDocument,
  SloSpec,
  SloUpdateInput,
} from './slo_types';
import {
  generateSloRuleGroup,
  SLO_RULER_NAMESPACE,
  generateRecordingGroupForFingerprint,
  dedupRecordingGroupName,
  dedupAlertGroupName,
} from './slo_promql_generator';
import { validateSloSpec, validateSloId } from './slo_validators';
import {
  SloNotFoundError,
  SloRulerError,
  SloRulerTeardownRequiredError,
  SloValidationError,
  SloVersionConflictError,
} from './slo_errors';
import { computeSliFingerprint, FINGERPRINT_VERSION } from './slo_sli_fingerprint';
import {
  SloDeployContext,
  SloRepairContext,
  SloRepairResult,
  sloRulerNamespaceFor,
} from './slo_service_types';
import type { SloServiceCore } from './slo_service_core';
import type { SloStatusService } from './slo_status_service';
import {
  buildAlertGroupWithProvenance,
  deriveExpectedGroups,
  generateUuidV4,
  isDedupSo,
  normalizeSloSpec,
  normalizeSpec,
  pickRepresentativeForFingerprint,
  uniqueValues,
} from './slo_service_internals';

export class SloLifecycleService {
  constructor(
    private readonly core: SloServiceCore,
    private readonly statusService: SloStatusService
  ) {}

  // ---------- read (single) ----------

  async get(id: string, request?: unknown): Promise<SloDocument | null> {
    const { sloStore } = this.core.resolveStores(request);
    const doc = await sloStore.get(id);
    if (!doc) return null;
    // Read-boundary defaulting: legacy SOs that pre-date later `alarms.*`
    // additions land here without those keys. `normalizeSloSpec` fills in
    // the canonical defaults so consumers (rule-generator paths, UI) can
    // dereference `spec.alarms.<key>` without a guard.
    return { ...doc, spec: normalizeSloSpec(doc.spec) };
  }

  /**
   * Refcount lookup — return the current refcount for each recording
   * fingerprint the SLO references. Returns `{}` when the SLO doesn't carry
   * dedup fields (single-group / pre-migration), when the ref store isn't
   * wired (tests, offline), or when a fingerprint has no corresponding ref
   * SO (drift; reconciler surfaces it separately).
   *
   * The UI uses this for the "Shared with N other SLOs" pill: N = refcount
   * of the fingerprint − 1 (subtract the current SLO's own claim).
   */
  async getFingerprintRefcounts(
    doc: SloDocument,
    workspaceId: string,
    resolveDatasource?: (datasourceId: string) => Promise<Datasource | undefined>,
    request?: unknown
  ): Promise<Record<string, number>> {
    const { ruleRefStore } = this.core.resolveStores(request);
    if (!ruleRefStore) return {};
    if (doc.status.provisioning.backend !== 'prometheus') return {};
    const fps = doc.status.provisioning.recordingFingerprints;
    if (!fps) return {};
    // Refcount writes (createDedup / updateDedup / deleteDedup) key on
    // `deploy.datasource.name` — the canonical, stable-across-restart
    // value. `spec.datasourceId` is *also* pinned to that name on every
    // create/update via the routes, but legacy SOs persisted before the
    // pin landed may carry a volatile `ds-N` instead. Try the canonical
    // name first when we can resolve it; fall back to the persisted value
    // so legacy SOs that were never re-pinned still resolve.
    const candidateKeys = new Set<string>([doc.spec.datasourceId]);
    if (resolveDatasource) {
      try {
        const ds = await resolveDatasource(doc.spec.datasourceId);
        if (ds?.name) candidateKeys.add(ds.name);
      } catch {
        // Resolution failures are non-fatal — fall back to the persisted key only.
      }
    }
    const unique = [...new Set(Object.values(fps))];
    const out: Record<string, number> = {};
    await Promise.all(
      unique.map(async (fp) => {
        for (const key of candidateKeys) {
          try {
            const entry = await ruleRefStore.get(workspaceId, key, fp);
            if (entry) {
              out[fp] = entry.attributes.refcount;
              return;
            }
          } catch (err) {
            this.core.logger.warn(
              `SloService.getFingerprintRefcounts: lookup failed for fp=${fp} key=${key}: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          }
        }
      })
    );
    return out;
  }

  // ---------- create ----------

  async create(
    input: SloCreateInput,
    createdBy = 'system',
    deploy?: SloDeployContext,
    request?: unknown
  ): Promise<SloDocument> {
    const { sloStore } = this.core.resolveStores(request);
    // Normalize (clamp target precision, etc.) BEFORE validation so the
    // range check and rule generation both see the canonical value.
    // Validators stay pure — never mutate — so normalization lives here.
    const spec = normalizeSpec(input.spec);
    const { errors } = validateSloSpec(spec);
    if (Object.keys(errors).length > 0) throw new SloValidationError(errors);

    // Pin `spec.datasourceId` to the canonical datasource name. The route
    // accepts either an in-memory `ds-N` id or the connection name (see
    // `datasourceService.get`), but the persisted spec must be stable:
    // refcount writes (`createDedup` below) and reads (`getFingerprintRefcounts`)
    // both have to land on the same key, and the in-memory id rotates on
    // plugin restart.
    if (deploy) spec.datasourceId = deploy.datasource.name;

    const id = input.id ?? generateUuidV4();
    if (input.id) {
      const slugErr = validateSloId(input.id);
      if (slugErr) throw new SloValidationError({ id: slugErr });
    }

    // Name uniqueness within the datasource (workspace scoping is handled by
    // the saved-objects layer; the name check is best-effort here).
    await this.assertNameUnique(spec.datasourceId, spec.name, null, request);

    // Dedup path branches here. Single-group path stays byte-identical to
    // what it used to do.
    if (this.core.dedupEnabled && deploy) {
      return this.createDedup(id, spec, createdBy, deploy, request);
    }

    const now = new Date().toISOString();
    const namespace = deploy ? sloRulerNamespaceFor(deploy.workspaceId) : SLO_RULER_NAMESPACE;
    // Build the document with minimal status so we can generate rules from it,
    // then fill in the provisioning record with the resulting names.
    const doc: SloDocument = {
      id,
      spec,
      status: {
        version: 1,
        createdAt: now,
        createdBy,
        updatedAt: now,
        updatedBy: createdBy,
        provisioning: {
          backend: 'prometheus',
          rulerNamespace: namespace,
        },
      },
    };

    const group = generateSloRuleGroup(doc, {
      workspaceId: deploy?.workspaceId,
    });
    if (doc.status.provisioning.backend === 'prometheus') {
      doc.status.provisioning.alertGroupName = group.groupName;
    }

    // Ruler-first, SO-second — preserves dual-write atomicity. An
    // SloRulerError here propagates unchanged — the SO is never written and
    // the wizard renders the raw upstream body so the user can self-service.
    if (deploy) {
      await deploy.ruler.upsertRuleGroup(deploy.client, deploy.datasource, namespace, group);
    }

    try {
      await sloStore.save(doc);
    } catch (saveErr) {
      // Compensation: ruler wrote, SO didn't. One best-effort delete; swallow
      // + warn on compensation failure. Reconciler sweeps danglers.
      if (deploy) {
        await this.safeRollback(deploy, namespace, group.groupName);
      }
      throw saveErr;
    }
    this.core.logger.info(
      `Created SLO: ${doc.id} (${doc.spec.name}) — ${group.rules.length} rules generated`
    );
    return doc;
  }

  // ---------- create (dedup path) ----------

  /**
   * Dedup-aware create. Differences from the single-group path:
   *
   *   1. Per-objective fingerprint via `computeSliFingerprint`. Objectives
   *      whose fingerprint is `null` (composite SLIs, OpenSearch backend)
   *      fall through the dedup path but do not contribute a recording group.
   *   2. For each distinct fingerprint: `incrementRef` the registry. If the
   *      returned `wasZero` is true, upsert the shared recording group on the
   *      ruler (recording rules are byte-equal across SLOs that share a
   *      fingerprint — repeated upserts are safe no-ops but skipping them is
   *      cheaper).
   *   3. Upsert the per-SLO alert group with a provenance annotation on
   *      its first rule. Shadow mode / all-createAlarm-false cases get a
   *      synthetic sentinel alert so the provenance annotation has a home.
   *   4. Rollback on SO save failure: decrement every ref we incremented; if
   *      any ref dropped back to zero, best-effort delete its recording
   *      group. Alert group is deleted too. Same "reconciler sweeps" tail as
   *      the single-group path if rollback itself fails.
   */
  private async createDedup(
    id: string,
    spec: SloSpec,
    createdBy: string,
    deploy: SloDeployContext,
    request?: unknown
  ): Promise<SloDocument> {
    const { sloStore, ruleRefStore } = this.core.resolveStores(request);
    const now = new Date().toISOString();
    const namespace = sloRulerNamespaceFor(deploy.workspaceId);
    const recordingFingerprints = this.computeObjectiveFingerprints(spec);
    const uniqueFps = uniqueValues(recordingFingerprints);
    // Refcount + alert-group naming key. Distinct from the namespace key
    // (`deploy.workspaceId` = datasource id in prod): workspaces share the
    // ruler namespace but allocate independent slo-rule-ref SOs. See
    // `SloDeployContext.OSDWorkspaceId` for the derivation.
    const refWorkspaceId = deploy.OSDWorkspaceId ?? 'default';

    // Pre-compute the per-SLO alert group name so rollback can find it even
    // if the caller never persists the SO.
    const alertGroupName = dedupAlertGroupName(spec.name, refWorkspaceId, id);

    // Step 1: refcount bookkeeping + recording-group upserts. Track what we
    // touched so rollback can undo it. Recording groups are *shared* across
    // SLOs by fingerprint, so synchronous deletion on rollback would race a
    // concurrent peer create that already bumped the ref back up and
    // re-upserted the byte-equal group — our delete would then orphan the
    // peer's recording rules. Decrement the refcount; the reconciler's
    // grace-period sweep handles the zero-ref cleanup safely. Alert groups
    // are per-SLO and safe to delete synchronously.
    const incrementedFps: string[] = [];
    const createdRecordingGroups: string[] = [];
    const rollback = async (): Promise<void> => {
      for (const fp of incrementedFps) {
        if (ruleRefStore) {
          try {
            await ruleRefStore.decrementRef({
              workspaceId: refWorkspaceId,
              datasourceId: deploy.datasource.name,
              fingerprint: fp,
            });
          } catch (err) {
            this.core.logger.warn(
              `SloService: rollback decrementRef failed for fingerprint=${fp}: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          }
        } else if (createdRecordingGroups.includes(fp)) {
          // No ref store means no shared-state concern — single-tenant test /
          // offline-dev path. Safe to delete synchronously.
          await this.safeRollback(deploy, namespace, dedupRecordingGroupName(fp));
        }
      }
      await this.safeRollback(deploy, namespace, alertGroupName);
    };

    for (const fp of uniqueFps) {
      const representative = pickRepresentativeForFingerprint(spec, recordingFingerprints, fp);
      if (!representative) continue;
      const groupName = dedupRecordingGroupName(fp);
      let wasZero = true;
      if (ruleRefStore) {
        try {
          // Refcount keys: workspace partition is the OSD workspace id (so
          // workspace A's refs and workspace B's refs are distinct SOs),
          // datasource is pinned to `deploy.datasource.name` (canonical
          // across plugin restarts; `create()` rewrites
          // `spec.datasourceId = deploy.datasource.name` so writer + reader
          // land on the same key).
          const r = await ruleRefStore.incrementRef({
            workspaceId: refWorkspaceId,
            datasourceId: deploy.datasource.name,
            fingerprint: fp,
            fingerprintVersion: FINGERPRINT_VERSION,
            groupName,
            namespace,
            directQueryName: deploy.datasource.directQueryName,
          });
          wasZero = r.wasZero;
          incrementedFps.push(fp);
        } catch (err) {
          await rollback();
          throw err;
        }
      }
      if (wasZero) {
        const recGroup = generateRecordingGroupForFingerprint({
          fingerprint: fp,
          sli: representative.sli,
          objectiveLatencyThreshold: representative.latencyThreshold,
        });
        if (recGroup) {
          try {
            await deploy.ruler.upsertRuleGroup(
              deploy.client,
              deploy.datasource,
              namespace,
              recGroup
            );
            createdRecordingGroups.push(fp);
          } catch (err) {
            await rollback();
            throw err;
          }
        }
      }
    }

    // Step 2: build + upsert the per-SLO alert group with provenance.
    const doc: SloDocument = {
      id,
      spec,
      status: {
        version: 1,
        createdAt: now,
        createdBy,
        updatedAt: now,
        updatedBy: createdBy,
        provisioning: {
          backend: 'prometheus',
          rulerNamespace: namespace,
          recordingFingerprints,
          alertGroupName,
        },
      },
    };

    const alertGroup = buildAlertGroupWithProvenance(
      doc,
      recordingFingerprints,
      refWorkspaceId,
      deploy.datasource.name,
      this.core.pluginVersion,
      now
    );
    try {
      await deploy.ruler.upsertRuleGroup(deploy.client, deploy.datasource, namespace, alertGroup);
    } catch (err) {
      await rollback();
      throw err;
    }

    try {
      await sloStore.save(doc);
    } catch (saveErr) {
      await rollback();
      throw saveErr;
    }
    this.core.logger.info(
      `Created SLO (dedup): ${doc.id} (${doc.spec.name}) — ${uniqueFps.length} fingerprint(s), ${alertGroup.rules.length} alert rules`
    );
    return doc;
  }

  private computeObjectiveFingerprints(spec: SloSpec): Record<string, string> {
    const out: Record<string, string> = {};
    for (const objective of spec.objectives) {
      const fp = computeSliFingerprint(spec.datasourceId, spec.sli, objective);
      if (fp !== null) out[objective.name] = fp;
    }
    return out;
  }

  // ---------- update ----------

  async update(
    id: string,
    input: SloUpdateInput,
    updatedBy = 'system',
    deploy?: SloDeployContext,
    request?: unknown
  ): Promise<SloDocument> {
    const { sloStore } = this.core.resolveStores(request);
    const existing = await sloStore.get(id);
    if (!existing) throw new SloNotFoundError(id);

    if (input.version !== existing.status.version) {
      throw new SloVersionConflictError(existing, input.version);
    }

    // Merge partial input onto the current spec, then normalize (clamp target
    // precision, etc.) BEFORE validation so rule generation sees canonical values.
    // `normalizeSloSpec` on `existing.spec` first guarantees legacy docs (missing
    // `alarms.*` keys) carry the canonical defaults forward through the merge.
    const merged: SloSpec = normalizeSpec({
      ...normalizeSloSpec(existing.spec),
      ...input.spec,
    });

    const { errors } = validateSloSpec(merged);
    if (Object.keys(errors).length > 0) throw new SloValidationError(errors);

    // See `create` — pin to canonical datasource name so refcount keys stay
    // consistent across the SLO's lifetime, even if the user passed `ds-N`
    // in the update body.
    if (deploy) merged.datasourceId = deploy.datasource.name;

    if (merged.name !== existing.spec.name) {
      await this.assertNameUnique(merged.datasourceId, merged.name, id, request);
    }

    if (this.core.dedupEnabled && deploy) {
      return this.updateDedup(existing, merged, updatedBy, deploy, request);
    }

    // Prefer the namespace stamped on the SO at create time. Falling back to
    // `sloRulerNamespaceFor(deploy.workspaceId)` would silently route the
    // upsert to a different namespace if `deploy.workspaceId` ever drifts
    // from the persisted value, leaving the original recording rules dangling.
    // The deploy-derived namespace only kicks in for legacy SOs that pre-date
    // the stamp; in steady state the two values are identical.
    const namespace =
      existing.status.provisioning.backend === 'prometheus' &&
      existing.status.provisioning.rulerNamespace
        ? existing.status.provisioning.rulerNamespace
        : deploy
        ? sloRulerNamespaceFor(deploy.workspaceId)
        : SLO_RULER_NAMESPACE;

    const updated: SloDocument = {
      id: existing.id,
      spec: merged,
      status: {
        ...existing.status,
        version: existing.status.version + 1,
        updatedAt: new Date().toISOString(),
        updatedBy,
        provisioning:
          existing.status.provisioning.backend === 'prometheus'
            ? { ...existing.status.provisioning, rulerNamespace: namespace }
            : existing.status.provisioning,
      },
    };

    const group = generateSloRuleGroup(updated, {
      workspaceId: deploy?.workspaceId,
    });
    if (updated.status.provisioning.backend === 'prometheus') {
      updated.status.provisioning.alertGroupName = group.groupName;
    }

    if (deploy) {
      await deploy.ruler.upsertRuleGroup(deploy.client, deploy.datasource, namespace, group);
    }

    try {
      await sloStore.save(updated);
    } catch (saveErr) {
      if (deploy) {
        await this.safeRollback(deploy, namespace, group.groupName);
      }
      throw saveErr;
    }
    this.statusService.invalidate(id);
    this.core.logger.info(`Updated SLO: ${id} → v${updated.status.version}`);
    return updated;
  }

  // ---------- update (dedup path) ----------

  /**
   * Dedup-aware update.
   *
   * Diff-based: compute fingerprints for the merged spec, increment refs on
   * any fingerprint that wasn't already claimed by this SLO, upsert recording
   * groups for refs that just became nonzero, upsert the per-SLO alert group,
   * save the SO, then decrement refs on fingerprints the SLO used to claim
   * but no longer does. On SO-save failure: undo refs we incremented and
   * delete any recording groups we created this call.
   *
   * The alert group is always upserted (spec semantics can change without a
   * fingerprint change — e.g. severity, budget-warning thresholds — so the
   * group must reflect the latest spec). The alert-group name is stable
   * across updates because it's derived from (workspaceId, sloId, 'group')
   * — meaning the upsert is a replace-in-place on the ruler.
   */
  private async updateDedup(
    existing: SloDocument,
    merged: SloSpec,
    updatedBy: string,
    deploy: SloDeployContext,
    request?: unknown
  ): Promise<SloDocument> {
    const { sloStore, ruleRefStore } = this.core.resolveStores(request);
    const refWorkspaceId = deploy.OSDWorkspaceId ?? 'default';
    const now = new Date().toISOString();
    // Prefer the namespace stamped on the SO at create time (matches
    // `deleteDedup` and `repair`). Falls back to the deploy-derived value
    // only for legacy SOs that pre-date the stamp.
    const namespace =
      existing.status.provisioning.backend === 'prometheus' &&
      existing.status.provisioning.rulerNamespace
        ? existing.status.provisioning.rulerNamespace
        : sloRulerNamespaceFor(deploy.workspaceId);
    const newFingerprints = this.computeObjectiveFingerprints(merged);
    const oldFingerprints =
      existing.status.provisioning.backend === 'prometheus'
        ? existing.status.provisioning.recordingFingerprints ?? {}
        : {};
    const newUnique = new Set(uniqueValues(newFingerprints));
    const oldUnique = new Set(uniqueValues(oldFingerprints));
    const toAdd = [...newUnique].filter((fp) => !oldUnique.has(fp));
    const toDrop = [...oldUnique].filter((fp) => !newUnique.has(fp));

    const alertGroupName = dedupAlertGroupName(merged.name, refWorkspaceId, existing.id);

    // Bookkeeping for rollback.
    const incrementedFps: string[] = [];
    const createdRecordingGroups: string[] = [];

    const rollback = async (): Promise<void> => {
      // See createDedup rollback for why recording groups aren't deleted
      // synchronously here — they're shared across SLOs by fingerprint and
      // the reconciler's grace-period sweep handles zero-ref cleanup.
      for (const fp of incrementedFps) {
        if (ruleRefStore) {
          try {
            await ruleRefStore.decrementRef({
              workspaceId: refWorkspaceId,
              datasourceId: deploy.datasource.name,
              fingerprint: fp,
            });
          } catch (err) {
            this.core.logger.warn(
              `SloService: update rollback decrementRef failed for fingerprint=${fp}: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          }
        } else if (createdRecordingGroups.includes(fp)) {
          await this.safeRollback(deploy, namespace, dedupRecordingGroupName(fp));
        }
      }
    };

    // Add path: increment refs + upsert recording groups for new fps.
    for (const fp of toAdd) {
      const representative = pickRepresentativeForFingerprint(merged, newFingerprints, fp);
      if (!representative) continue;
      const groupName = dedupRecordingGroupName(fp);
      let wasZero = true;
      if (ruleRefStore) {
        try {
          const r = await ruleRefStore.incrementRef({
            workspaceId: refWorkspaceId,
            datasourceId: deploy.datasource.name,
            fingerprint: fp,
            fingerprintVersion: FINGERPRINT_VERSION,
            groupName,
            namespace,
            directQueryName: deploy.datasource.directQueryName,
          });
          wasZero = r.wasZero;
          incrementedFps.push(fp);
        } catch (err) {
          await rollback();
          throw err;
        }
      }
      if (wasZero) {
        const recGroup = generateRecordingGroupForFingerprint({
          fingerprint: fp,
          sli: representative.sli,
          objectiveLatencyThreshold: representative.latencyThreshold,
        });
        if (recGroup) {
          try {
            await deploy.ruler.upsertRuleGroup(
              deploy.client,
              deploy.datasource,
              namespace,
              recGroup
            );
            createdRecordingGroups.push(fp);
          } catch (err) {
            await rollback();
            throw err;
          }
        }
      }
    }

    const updated: SloDocument = {
      id: existing.id,
      spec: merged,
      status: {
        ...existing.status,
        version: existing.status.version + 1,
        updatedAt: now,
        updatedBy,
        provisioning:
          existing.status.provisioning.backend === 'prometheus'
            ? {
                ...existing.status.provisioning,
                rulerNamespace: namespace,
                recordingFingerprints: newFingerprints,
                alertGroupName,
              }
            : existing.status.provisioning,
      },
    };

    // Upsert alert group with fresh provenance.
    const alertGroup = buildAlertGroupWithProvenance(
      updated,
      newFingerprints,
      refWorkspaceId,
      deploy.datasource.name,
      this.core.pluginVersion,
      existing.status.createdAt,
      now
    );
    try {
      await deploy.ruler.upsertRuleGroup(deploy.client, deploy.datasource, namespace, alertGroup);
    } catch (err) {
      await rollback();
      throw err;
    }

    try {
      await sloStore.save(updated);
    } catch (saveErr) {
      await rollback();
      throw saveErr;
    }

    // Drop path: decrement refs for fps this SLO no longer references.
    // Recording-group deletion is deferred — the reconciler's grace-period
    // sweep handles zero-ref cleanups. Synchronous delete here would race
    // concurrent creates that bump the ref back up.
    if (ruleRefStore) {
      for (const fp of toDrop) {
        try {
          await ruleRefStore.decrementRef({
            workspaceId: refWorkspaceId,
            datasourceId: deploy.datasource.name,
            fingerprint: fp,
          });
        } catch (err) {
          this.core.logger.warn(
            `SloService: decrementRef failed for fingerprint=${fp}: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    }

    this.statusService.invalidate(updated.id);
    this.core.logger.info(`Updated SLO (dedup): ${updated.id} → v${updated.status.version}`);
    return updated;
  }

  // ---------- delete ----------

  /**
   * Tear down an SLO.
   *
   * The ruler-side `deleteRuleGroup` is 404-tolerant — if the rule group was
   * already removed out-of-band (someone DELETE'd it in Cortex directly, or
   * the reconciler swept an orphan), the ruler call resolves successfully
   * and we proceed to remove the SO. This keeps a live out-of-band delete
   * from wedging the SO in an un-deletable state. Any other ruler failure
   * (auth, 5xx, network) still propagates and leaves the SO intact so the
   * user can retry.
   */
  async delete(
    id: string,
    deploy?: SloDeployContext,
    request?: unknown
  ): Promise<{ deleted: boolean }> {
    const { sloStore } = this.core.resolveStores(request);
    const existing = await sloStore.get(id);
    if (!existing) return { deleted: false };

    // Dedup path: tear down the per-SLO alert group, decrement refs, but
    // never synchronously delete a shared recording group — the reconciler's
    // grace-period sweep owns recording-group cleanup.
    if (this.core.dedupEnabled && isDedupSo(existing)) {
      if (!deploy) {
        throw new SloRulerTeardownRequiredError(id, existing.spec.datasourceId);
      }
      return this.deleteDedup(existing, deploy, request);
    }

    const provisioning = existing.status.provisioning;

    const needsRulerTeardown =
      provisioning.backend === 'prometheus' && !!provisioning.alertGroupName;

    // Ruler-first, SO-second. If the ruler delete fails (network, auth, Cortex
    // 5xx), the SO stays so the user can retry — better than silently leaking
    // a rule group that keeps evaluating dead alerts. The caller is required
    // to supply `deploy` whenever the SLO has a rule group; the route adapter
    // enforces this by surfacing an unresolvable-datasource error to the user.
    // 404s from the ruler are swallowed by the RulerClient itself, so an
    // out-of-band group deletion never blocks SO teardown.
    if (needsRulerTeardown) {
      if (!deploy) {
        throw new SloRulerTeardownRequiredError(id, existing.spec.datasourceId);
      }
      if (provisioning.backend === 'prometheus' && provisioning.alertGroupName) {
        const namespace = provisioning.rulerNamespace || SLO_RULER_NAMESPACE;
        await deploy.ruler.deleteRuleGroup(
          deploy.client,
          deploy.datasource,
          namespace,
          provisioning.alertGroupName
        );
      }
    }

    await sloStore.delete(id);
    this.statusService.invalidate(id);

    this.core.logger.info(`Deleted SLO: ${id}`);
    return { deleted: true };
  }

  // ---------- delete (dedup path) ----------

  /**
   * Dedup delete.
   *
   * Order of operations, chosen so a ruler or store failure leaves the
   * cluster in a recoverable state:
   *
   *   1. Delete the per-SLO alert group from the ruler first. If this fails
   *      (5xx / auth), abort — the SO is left in place so the user can
   *      retry. 404s are swallowed by the ruler client itself.
   *   2. Delete the SO.
   *   3. Decrement every fingerprint ref the SLO claimed. Failures here are
   *      logged but do NOT throw — the SO is already gone; surfacing a ref-
   *      store error to the caller would be a worse UX than waiting for the
   *      reconciler's dangling-ref sweep to reconcile eventually.
   *
   * Recording groups are never deleted synchronously, even at refcount=0.
   * The reconciler's grace-period sweep owns that path so a concurrent
   * create for the same fingerprint doesn't race us.
   */
  private async deleteDedup(
    existing: SloDocument,
    deploy: SloDeployContext,
    request?: unknown
  ): Promise<{ deleted: boolean }> {
    if (existing.status.provisioning.backend !== 'prometheus') {
      return { deleted: false };
    }
    const { sloStore, ruleRefStore } = this.core.resolveStores(request);
    const refWorkspaceId = deploy.OSDWorkspaceId ?? 'default';
    const provisioning = existing.status.provisioning;
    const namespace = provisioning.rulerNamespace || sloRulerNamespaceFor(deploy.workspaceId);
    const alertGroupName =
      provisioning.alertGroupName ||
      dedupAlertGroupName(existing.spec.name, refWorkspaceId, existing.id);

    await deploy.ruler.deleteRuleGroup(deploy.client, deploy.datasource, namespace, alertGroupName);

    await sloStore.delete(existing.id);
    this.statusService.invalidate(existing.id);

    const fingerprints = provisioning.recordingFingerprints ?? {};
    const uniqueFps = uniqueValues(fingerprints);
    if (ruleRefStore) {
      for (const fp of uniqueFps) {
        try {
          await ruleRefStore.decrementRef({
            workspaceId: refWorkspaceId,
            datasourceId: deploy.datasource.name,
            fingerprint: fp,
          });
        } catch (err) {
          this.core.logger.warn(
            `SloService: delete decrementRef failed for fingerprint=${fp}: ${
              err instanceof Error ? err.message : String(err)
            }. Reconciler sweep will reconcile.`
          );
        }
      }
    }

    this.core.logger.info(`Deleted SLO (dedup): ${existing.id}`);
    return { deleted: true };
  }

  // ---------- repair ----------

  /**
   * Bring a drifted SLO back to parity with its expected rule groups.
   *
   * Algorithm:
   *   1. Load the SO; throw `SloNotFoundError` if missing (route → 404).
   *   2. Compute expected groups from `status.provisioning` via
   *      `deriveExpectedGroups` — dedup shape returns one recording group
   *      per unique fingerprint plus the per-SLO alert group; single-group
   *      shape returns just the alert group.
   *   3. Probe current rule health via the injected checker.
   *   4. If healthy (`state === 'ok'`), return `{ repaired: false, health }`
   *      without touching the ruler. Idempotent — repeat calls are cheap.
   *   5. If `ruler_unreachable`, throw `SloRulerError` with the probe's
   *      reported code (defaulting to `RULER_UNREACHABLE`) so the route
   *      adapter maps it to a 502 / upstream-gateway response.
   *   6. Otherwise (`rules_missing` / `rules_partial`) regenerate the group
   *      from the doc, upsert via the ruler, invalidate the health cache,
   *      re-probe, and return the post-repair snapshot with `repaired: true`.
   */
  async repair(id: string, ctx: SloRepairContext, request?: unknown): Promise<SloRepairResult> {
    const { sloStore } = this.core.resolveStores(request);
    const doc = await sloStore.get(id);
    if (!doc) throw new SloNotFoundError(id);

    if (this.core.dedupEnabled && isDedupSo(doc)) {
      return this.repairDedup(doc, ctx);
    }

    const expectedGroups = deriveExpectedGroups(doc);
    const namespace =
      doc.status.provisioning.backend === 'prometheus'
        ? doc.status.provisioning.rulerNamespace || sloRulerNamespaceFor(ctx.deploy.workspaceId)
        : sloRulerNamespaceFor(ctx.deploy.workspaceId);

    const pre = await ctx.health.check({
      workspaceId: ctx.deploy.workspaceId,
      datasource: ctx.deploy.datasource,
      client: ctx.deploy.client,
      sloId: doc.id,
      namespace,
      expectedGroups,
    });

    if (pre.state === 'ok') {
      return { sloId: doc.id, repaired: false, health: pre };
    }

    if (pre.state === 'ruler_unreachable') {
      // Surface via SloRulerError so the existing route mapping (toSloError
      // in handlers.ts) translates to the right HTTP status. We prefer
      // reusing the existing typed error rather than introducing a new one.
      const code = pre.rulerErrorCode ?? 'RULER_UNREACHABLE';
      const rawBody = `Rule-health probe reported ruler_unreachable for SLO ${doc.id}`;
      throw new SloRulerError(code, 0, rawBody);
    }

    // Regenerate the group from the doc and re-upsert. Generation is pure, so
    // the recomputed group is byte-equivalent to what the original create/
    // update issued — the upsert is effectively a replay.
    const group: GeneratedRuleGroup = generateSloRuleGroup(doc, {
      workspaceId: ctx.deploy.workspaceId,
    });
    await ctx.deploy.ruler.upsertRuleGroup(
      ctx.deploy.client,
      ctx.deploy.datasource,
      namespace,
      group
    );

    ctx.health.invalidate(ctx.deploy.workspaceId, ctx.deploy.datasource.id, doc.id);

    const post = await ctx.health.check({
      workspaceId: ctx.deploy.workspaceId,
      datasource: ctx.deploy.datasource,
      client: ctx.deploy.client,
      sloId: doc.id,
      namespace,
      expectedGroups,
    });

    this.core.logger.info(
      `Repaired SLO: ${doc.id} (namespace=${namespace}, groups=${expectedGroups.join(',')})`
    );
    return { sloId: doc.id, repaired: true, health: post };
  }

  /**
   * Dedup-aware repair.
   *
   * The single-group `repair()` path above calls `generateSloRuleGroup`,
   * which emits a single monolithic `slo:<slug>_<suffix>` group carrying
   * identity labels on recording rules and no alert-group annotation. For
   * dedup-shape SOs the expected ruler state is a split: one shared
   * `slo:rec:<fp>` per unique fingerprint (label-free so it's reusable
   * across SLOs) plus one per-SLO `slo:alerts:<slug>_<suffix>` carrying the
   * provenance annotation. A single-group upsert here produces a third
   * garbage group and leaves the real ones missing.
   *
   * This method mirrors the `createDedup` / `updateDedup` rule-shape path but
   * skips refcount bookkeeping — repair is recovering from ruler-side drift,
   * not creating or dropping an SLO; the ref store already reflects this
   * SLO's claim and the repair upsert is effectively a byte-equal replay.
   *
   * Recording groups deliberately get NO annotation — Cortex rejects
   * annotations on recording rules (commit e25376c2).
   */
  private async repairDedup(doc: SloDocument, ctx: SloRepairContext): Promise<SloRepairResult> {
    if (doc.status.provisioning.backend !== 'prometheus') {
      // Non-prometheus backends fall through to the legacy path above — but
      // `isDedupSo` gates on `backend === 'prometheus'`, so this is
      // unreachable. Narrow for the type-checker; throw loudly if it ever
      // trips so we catch the invariant drift in CI rather than at runtime.
      throw new Error(`repairDedup invoked on non-prometheus SLO ${doc.id}`);
    }
    const provisioning = doc.status.provisioning;
    const expectedGroups = deriveExpectedGroups(doc);
    const namespace = provisioning.rulerNamespace || sloRulerNamespaceFor(ctx.deploy.workspaceId);

    const pre = await ctx.health.check({
      workspaceId: ctx.deploy.workspaceId,
      datasource: ctx.deploy.datasource,
      client: ctx.deploy.client,
      sloId: doc.id,
      namespace,
      expectedGroups,
    });

    if (pre.state === 'ok') {
      return { sloId: doc.id, repaired: false, health: pre };
    }
    if (pre.state === 'ruler_unreachable') {
      const code = pre.rulerErrorCode ?? 'RULER_UNREACHABLE';
      const rawBody = `Rule-health probe reported ruler_unreachable for SLO ${doc.id}`;
      throw new SloRulerError(code, 0, rawBody);
    }

    // Step 1: re-upsert each unique fingerprint's shared recording group.
    // Recording-rule generation is pure in the fingerprint + representative
    // SLI, so the bytes match whatever the original create/update wrote;
    // Cortex replaces-in-place, which is correct whether the group was
    // missing entirely or present with stale contents.
    const recordingFingerprints = provisioning.recordingFingerprints ?? {};
    const uniqueFps = uniqueValues(recordingFingerprints);
    for (const fp of uniqueFps) {
      const representative = pickRepresentativeForFingerprint(doc.spec, recordingFingerprints, fp);
      if (!representative) continue;
      const recGroup = generateRecordingGroupForFingerprint({
        fingerprint: fp,
        sli: representative.sli,
        objectiveLatencyThreshold: representative.latencyThreshold,
      });
      if (recGroup) {
        await ctx.deploy.ruler.upsertRuleGroup(
          ctx.deploy.client,
          ctx.deploy.datasource,
          namespace,
          recGroup
        );
      }
    }

    // Step 2: re-upsert the per-SLO alert group with fresh `updatedAt` and
    // preserved `createdAt`. Sentinel alert is inserted inside
    // `buildAlertGroupWithProvenance` when burn-rate tiers resolve to zero
    // alerts, so the provenance annotation always has a home.
    const now = new Date().toISOString();
    const refWorkspaceId = ctx.deploy.OSDWorkspaceId ?? 'default';
    const alertGroup = buildAlertGroupWithProvenance(
      doc,
      recordingFingerprints,
      refWorkspaceId,
      ctx.deploy.datasource.name,
      this.core.pluginVersion,
      doc.status.createdAt,
      now
    );
    await ctx.deploy.ruler.upsertRuleGroup(
      ctx.deploy.client,
      ctx.deploy.datasource,
      namespace,
      alertGroup
    );

    ctx.health.invalidate(ctx.deploy.workspaceId, ctx.deploy.datasource.id, doc.id);

    const post = await ctx.health.check({
      workspaceId: ctx.deploy.workspaceId,
      datasource: ctx.deploy.datasource,
      client: ctx.deploy.client,
      sloId: doc.id,
      namespace,
      expectedGroups,
    });

    this.core.logger.info(
      `Repaired SLO (dedup): ${doc.id} (namespace=${namespace}, fps=${uniqueFps.length}, alert=${alertGroup.groupName})`
    );
    return { sloId: doc.id, repaired: true, health: post };
  }

  // ---------- enable / disable ----------

  async setEnabled(
    id: string,
    enabled: boolean,
    updatedBy = 'system',
    deploy?: SloDeployContext,
    request?: unknown
  ): Promise<SloDocument> {
    const { sloStore } = this.core.resolveStores(request);
    const existing = await sloStore.get(id);
    if (!existing) throw new SloNotFoundError(id);
    return this.update(
      id,
      { spec: { enabled }, version: existing.status.version },
      updatedBy,
      deploy,
      request
    );
  }

  // ---------- preview ----------

  previewRules(input: SloCreateInput): GeneratedRuleGroup {
    // Preview and deploy must see the same normalized spec — what the user
    // sees is what gets deployed. Clamp targets before validation.
    const spec = normalizeSpec(input.spec);
    const { errors } = validateSloSpec(spec);
    if (Object.keys(errors).length > 0) throw new SloValidationError(errors);

    const now = new Date().toISOString();
    const id = input.id ?? 'slo-preview-00000000-0000-0000-0000-000000000000';
    const doc: SloDocument = {
      id,
      spec,
      status: {
        version: 0,
        createdAt: now,
        createdBy: 'preview',
        updatedAt: now,
        updatedBy: 'preview',
        provisioning: {
          backend: 'prometheus',
          rulerNamespace: SLO_RULER_NAMESPACE,
        },
      },
    };
    return generateSloRuleGroup(doc);
  }

  // ---------- helpers ----------

  /**
   * Compensation rollback for the ruler-OK / SO-fails edge case.
   * Best-effort: swallow errors so the original SO failure surfaces to the
   * caller unchanged. Reconciler covers the case where this itself fails.
   */
  private async safeRollback(
    deploy: SloDeployContext,
    namespace: string,
    groupName: string
  ): Promise<void> {
    try {
      await deploy.ruler.deleteRuleGroup(deploy.client, deploy.datasource, namespace, groupName);
      this.core.logger.info(
        `Ruler rollback succeeded for ${groupName} in ${namespace} (SO write failed)`
      );
    } catch (err) {
      this.core.logger.warn(
        `Ruler rollback failed for ${groupName} in ${namespace}: ${
          err instanceof Error ? err.message : String(err)
        }. Dangling rule group; reconciler will sweep.`
      );
    }
  }

  private async assertNameUnique(
    datasourceId: string,
    name: string,
    excludeId: string | null,
    request?: unknown
  ): Promise<void> {
    const { sloStore } = this.core.resolveStores(request);
    const peers = await sloStore.list([datasourceId]);
    const conflict = peers.find(
      (p) => p.spec.name === name && (excludeId === null || p.id !== excludeId)
    );
    if (conflict) {
      throw new SloValidationError({
        'spec.name': `An SLO named "${name}" already exists for this datasource`,
      });
    }
  }
}
