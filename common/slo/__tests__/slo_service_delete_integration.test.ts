/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SloService.delete — integration tests.
 *
 * Wires the real `SloService` against:
 *   - `InMemorySloStore` (no SO-layer mocks)
 *   - A `FakeRulerClient` we control (4xx/5xx posture per-scenario)
 *   - Production `createRuleHealthChecker` for the delete → repair cross-check
 *
 * Unlike `slo_service_delete_404.test.ts` (which focuses on the 404-tolerant
 * contract in isolation), this suite exercises multiple subsystems together:
 * delete + repair consistency, the 500-then-heal retry path, and live store
 * preservation across failing delete attempts.
 */

import {
  SloDeployContext,
  SloNotFoundError,
  SloRepairContext,
  SloRulerClient,
  SloRulerError,
  SloService,
} from '../slo_service';
import { InMemorySloStore } from '../slo_store';
import { DEFAULT_MWMBR_TIERS } from '../slo_promql_generator';
import { createRuleHealthChecker } from '../../../server/services/slo/rule_health_checker';
import type { RulerClient } from '../../../server/services/slo/ruler_client';
import type { AlertingOSClient, Datasource, Logger } from '../../types/alerting';
import type { GeneratedRuleGroup, SloSpec } from '../slo_types';

// ============================================================================
// Test doubles (kept in sync with slo_service_repair_integration.test.ts)
// ============================================================================

function noopLogger(): Logger {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  };
}

function validSpec(overrides: Partial<SloSpec> = {}): SloSpec {
  return {
    datasourceId: 'prom-ds-001',
    name: `API Availability ${Math.random().toString(36).slice(2, 8)}`,
    enabled: true,
    mode: 'active',
    service: 'api-gateway',
    owner: { teams: ['platform'] },
    sli: {
      type: 'single',
      definition: {
        backend: 'prometheus',
        type: 'availability',
        calcMethod: 'events',
        metric: 'http_requests_total',
      },
      dimensions: [{ name: 'service', value: 'api-gateway' }],
    },
    objectives: [{ name: 'availability-99-9', target: 0.999 }],
    budgetWarningThresholds: [{ threshold: 0.5, severity: 'warning' }],
    window: { type: 'rolling', duration: '28d' },
    alerting: { strategy: 'mwmbr', burnRates: DEFAULT_MWMBR_TIERS.map((t) => ({ ...t })) },
    alarms: {
      sliHealth: { enabled: false },
      attainmentBreach: { enabled: false },
      budgetWarning: { enabled: true },
      noData: { enabled: false, forDuration: '10m' },
      resolved: { enabled: false },
    },
    exclusionWindows: [],
    labels: {},
    annotations: {},
    ...overrides,
  };
}

class FakeRulerClient implements RulerClient, SloRulerClient {
  public upsertCalls = 0;
  public deleteCalls = 0;
  public getCalls = 0;

  private groups = new Map<string, GeneratedRuleGroup>();
  private upsertError: SloRulerError | null = null;
  private deleteError: SloRulerError | null = null;
  private getError: SloRulerError | null = null;

  private key(ns: string, name: string): string {
    return `${ns}|${name}`;
  }

  setUpsertError(err: SloRulerError | null): void {
    this.upsertError = err;
  }
  setDeleteError(err: SloRulerError | null): void {
    this.deleteError = err;
  }
  setGetError(err: SloRulerError | null): void {
    this.getError = err;
  }

  dropGroup(namespace: string, groupName: string): void {
    this.groups.delete(this.key(namespace, groupName));
  }

  hasGroup(namespace: string, groupName: string): boolean {
    return this.groups.has(this.key(namespace, groupName));
  }

  async upsertRuleGroup(
    _client: AlertingOSClient,
    _datasource: Datasource,
    namespace: string,
    group: GeneratedRuleGroup
  ): Promise<void> {
    this.upsertCalls += 1;
    if (this.upsertError) throw this.upsertError;
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
    // 404-tolerant — missing key is a no-op success.
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
    return this.groups.get(this.key(namespace, groupName)) ?? null;
  }

  async listRuleGroups(
    _client: AlertingOSClient,
    _datasource: Datasource,
    namespace: string
  ): Promise<GeneratedRuleGroup[]> {
    const prefix = `${namespace}|`;
    const out: GeneratedRuleGroup[] = [];
    for (const [k, v] of this.groups.entries()) {
      if (k.startsWith(prefix)) out.push(v);
    }
    return out;
  }
}

function makeHarness() {
  const store = new InMemorySloStore();
  const ruler = new FakeRulerClient();
  const logger = noopLogger();
  const svc = new SloService(logger, store);
  // Pin the single-group contract — dedup has its own integration test.
  svc.setDedupEnabled(false);
  const health = createRuleHealthChecker(ruler, logger, { ttlMs: 0 });

  const datasource: Datasource = {
    id: 'prom-ds-001',
    name: 'prom',
    type: 'prometheus',
    url: '',
    enabled: true,
    directQueryName: 'prom-connection',
  };
  const client = ({
    transport: { request: () => Promise.resolve({}) },
  } as unknown) as AlertingOSClient;

  const deploy: SloDeployContext = {
    ruler,
    client,
    datasource,
    workspaceId: 'ws-int',
  };
  const repairCtx: SloRepairContext = { health, deploy };

  return { store, ruler, svc, deploy, repairCtx };
}

// ============================================================================
// Tests
// ============================================================================

describe('SloService.delete — integration', () => {
  it('ruler 404-tolerant delete: group already gone → delete succeeds and SO is removed', async () => {
    // Real-world case: out-of-band delete removed the rule group from Cortex
    // *before* the user clicked Delete in the UI. The fake ruler's
    // `deleteRuleGroup` resolves (404-tolerant by design); the service must
    // not treat that as a failure.
    const { svc, store, ruler, deploy } = makeHarness();
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);

    // Simulate the out-of-band deletion.
    ruler.dropGroup(
      doc.status.provisioning.backend === 'prometheus'
        ? doc.status.provisioning.rulerNamespace
        : '',
      doc.status.provisioning.backend === 'prometheus' && doc.status.provisioning.alertGroupName
        ? doc.status.provisioning.alertGroupName
        : ''
    );

    const result = await svc.delete(doc.id, deploy);

    expect(result.deleted).toBe(true);
    expect(ruler.deleteCalls).toBe(1);
    expect(await store.get(doc.id)).toBeNull();
  });

  it('ruler 500 on delete: throws SloRulerError and preserves the SO for retry', async () => {
    const { svc, store, ruler, deploy } = makeHarness();
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);

    ruler.setDeleteError(new SloRulerError('RULER_UNREACHABLE', 503, 'down'));

    await expect(svc.delete(doc.id, deploy)).rejects.toMatchObject({
      name: 'SloRulerError',
      code: 'RULER_UNREACHABLE',
    });

    // SO survives so the user can retry once Cortex is back.
    const preserved = await store.get(doc.id);
    expect(preserved).not.toBeNull();
    expect(preserved?.id).toBe(doc.id);
  });

  it('idempotent retry after transient 500: first delete throws, second delete succeeds once the ruler heals', async () => {
    const { svc, store, ruler, deploy } = makeHarness();
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);
    const namespace =
      doc.status.provisioning.backend === 'prometheus'
        ? doc.status.provisioning.rulerNamespace
        : '';
    const groupName =
      doc.status.provisioning.backend === 'prometheus' && doc.status.provisioning.alertGroupName
        ? doc.status.provisioning.alertGroupName
        : '';

    // First attempt: transient ruler failure.
    ruler.setDeleteError(new SloRulerError('RULER_UNREACHABLE', 503, 'down'));
    await expect(svc.delete(doc.id, deploy)).rejects.toBeInstanceOf(SloRulerError);
    expect(await store.get(doc.id)).not.toBeNull();
    expect(ruler.hasGroup(namespace, groupName)).toBe(true);

    // Ruler heals.
    ruler.setDeleteError(null);

    // Retry succeeds: ruler write goes through, SO is removed.
    const result = await svc.delete(doc.id, deploy);
    expect(result.deleted).toBe(true);
    expect(await store.get(doc.id)).toBeNull();
    expect(ruler.hasGroup(namespace, groupName)).toBe(false);
    // Two delete attempts made it to the ruler (the 503 still counted as a
    // call; the retry was the real one).
    expect(ruler.deleteCalls).toBe(2);
  });

  it('delete + repair are mutually consistent: repair on a just-deleted SLO throws SloNotFoundError', async () => {
    const { svc, deploy, repairCtx } = makeHarness();
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);

    const delResult = await svc.delete(doc.id, deploy);
    expect(delResult.deleted).toBe(true);

    await expect(svc.repair(doc.id, repairCtx)).rejects.toBeInstanceOf(SloNotFoundError);
  });
});
