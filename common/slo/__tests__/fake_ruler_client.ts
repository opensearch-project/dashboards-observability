/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared FakeRulerClient for integration tests.
 *
 * Earlier, two near-identical copies existed in
 * `slo_service_repair_integration.test.ts` and `reconciler_integration.test.ts`.
 * Each had slightly different error-injection knobs; this module DRYs the
 * union so the dedup integration suite (and anyone new) pulls one shape.
 *
 * The fake satisfies both `RulerClient` (server-side, for the rule-health
 * checker + reconciler) and `SloRulerClient` (common, for the service) —
 * they're structurally compatible.
 */

import type { AlertingOSClient, Datasource } from '../../types/alerting';
import type { GeneratedRuleGroup } from '../slo_types';
import type { SloRulerClient } from '../slo_service';
import { SloRulerError } from '../slo_errors';
import type { RulerClient } from '../../../server/services/slo/ruler_client';

export class FakeRulerClient implements RulerClient, SloRulerClient {
  public upsertCalls = 0;
  public deleteCalls = 0;
  public getCalls = 0;
  public listCalls = 0;
  public readonly upserts: Array<{ namespace: string; group: GeneratedRuleGroup }> = [];
  public readonly deletes: Array<{ namespace: string; groupName: string }> = [];

  private readonly groups = new Map<string, GeneratedRuleGroup>();
  private getError: SloRulerError | null = null;
  private upsertError: SloRulerError | null = null;
  private deleteError: SloRulerError | null = null;
  private listError: SloRulerError | null = null;
  private nullOnceForGroup: string | null = null;
  private readonly listErrorByNamespace = new Map<string, SloRulerError>();

  private key(ns: string, name: string): string {
    return `${ns}|${name}`;
  }

  // Error injection
  setGetError(err: SloRulerError | null): void {
    this.getError = err;
  }
  setUpsertError(err: SloRulerError | null): void {
    this.upsertError = err;
  }
  setDeleteError(err: SloRulerError | null): void {
    this.deleteError = err;
  }
  setListError(err: SloRulerError | null): void {
    this.listError = err;
  }
  setListErrorForNamespace(namespace: string, err: SloRulerError | null): void {
    if (err) this.listErrorByNamespace.set(namespace, err);
    else this.listErrorByNamespace.delete(namespace);
  }
  setNullOnceForGroup(groupName: string): void {
    this.nullOnceForGroup = groupName;
  }

  // Seed + inspect
  dropGroup(namespace: string, groupName: string): void {
    this.groups.delete(this.key(namespace, groupName));
  }
  hasGroup(namespace: string, groupName: string): boolean {
    return this.groups.has(this.key(namespace, groupName));
  }
  seedGroup(namespace: string, group: GeneratedRuleGroup): void {
    this.groups.set(this.key(namespace, group.groupName), group);
  }
  getGroup(namespace: string, groupName: string): GeneratedRuleGroup | undefined {
    return this.groups.get(this.key(namespace, groupName));
  }
  upsertsOfName(groupName: string): number {
    return this.upserts.filter((u) => u.group.groupName === groupName).length;
  }
  allGroups(): IterableIterator<[string, GeneratedRuleGroup]> {
    return this.groups.entries();
  }

  // Seed + inspect — convenience accessors kept around so older call sites
  // (e.g. the repair integration test) that predate `getGroup`/`allGroups`
  // keep working without a local re-declaration of the fake.
  groupByName(namespace: string, groupName: string): GeneratedRuleGroup | null {
    return this.groups.get(this.key(namespace, groupName)) ?? null;
  }
  listGroupNames(namespace: string): string[] {
    const prefix = `${namespace}|`;
    const out: string[] = [];
    for (const [k, v] of this.groups.entries()) {
      if (k.startsWith(prefix)) out.push(v.groupName);
    }
    return out;
  }

  async upsertRuleGroup(
    _client: AlertingOSClient,
    _datasource: Datasource,
    namespace: string,
    group: GeneratedRuleGroup
  ): Promise<void> {
    this.upsertCalls += 1;
    if (this.upsertError) throw this.upsertError;
    // Mimic Cortex: recording rules may not carry annotations. Any rule with
    // `type: 'recording'` that ships an annotation payload is a 400 the ruler
    // would reject; fail the upsert loudly so a future regression that
    // re-adds `osd_slo_recording_provenance` (or anything else) doesn't
    // silently pass the in-memory fake.
    for (const rule of group.rules) {
      const isRecording = rule.type === 'recording';
      const hasAnnotations =
        typeof rule.annotations === 'object' &&
        rule.annotations !== null &&
        Object.keys(rule.annotations).length > 0;
      if (isRecording && hasAnnotations) {
        throw new SloRulerError(
          'RULER_VALIDATION_FAILED',
          400,
          `recording rule ${rule.name} may not carry annotations`
        );
      }
    }
    this.upserts.push({ namespace, group });
    this.groups.set(this.key(namespace, group.groupName), group);
  }

  async deleteRuleGroup(
    _client: AlertingOSClient,
    _datasource: Datasource,
    namespace: string,
    groupName: string
  ): Promise<void> {
    this.deleteCalls += 1;
    if (this.deleteError) throw this.deleteError;
    this.deletes.push({ namespace, groupName });
    this.groups.delete(this.key(namespace, groupName));
  }

  async getRuleGroup(
    _client: AlertingOSClient,
    _datasource: Datasource,
    namespace: string,
    groupName: string
  ): Promise<GeneratedRuleGroup | null> {
    this.getCalls += 1;
    if (this.getError) throw this.getError;
    if (this.nullOnceForGroup === groupName) {
      this.nullOnceForGroup = null;
      return null;
    }
    return this.groups.get(this.key(namespace, groupName)) ?? null;
  }

  async listRuleGroups(
    _client: AlertingOSClient,
    _datasource: Datasource,
    namespace: string
  ): Promise<GeneratedRuleGroup[]> {
    this.listCalls += 1;
    const nsError = this.listErrorByNamespace.get(namespace);
    if (nsError) throw nsError;
    if (this.listError) throw this.listError;
    const prefix = `${namespace}|`;
    const out: GeneratedRuleGroup[] = [];
    for (const [k, v] of this.groups.entries()) {
      if (k.startsWith(prefix)) out.push(v);
    }
    return out;
  }
}
