/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable max-classes-per-file */

/**
 * SloService.delete — tombstone write path (Phase 4 W4.1).
 *
 * Both the legacy single-group delete and the Phase 3 dedup delete write a
 * tombstone via the optional `tombstoneStore`. The tombstone is best-effort:
 * failures are logged and swallowed so a tombstone-write problem cannot roll
 * back an otherwise-successful delete.
 *
 * Covers:
 *   - Legacy (dedup-disabled) delete writes the tombstone with the expected
 *     attrs and the default `reason: 'user_delete'`.
 *   - Dedup delete writes the tombstone with the deploy-context workspaceId.
 *   - Tombstone-store throws → delete still resolves (no propagation).
 *   - Tombstone store unset → delete is a no-op write (no throw).
 */

import {
  SloDeployContext,
  SloRulerClient,
  SloService,
  SloTombstoneAttributesLite,
  SloTombstoneStoreLite,
} from '../slo_service';
import { InMemorySloStore } from '../slo_store';
import { DEFAULT_MWMBR_TIERS } from '../slo_promql_generator';
import type { AlertingOSClient, Datasource, Logger } from '../../types/alerting/types';
import type { GeneratedRuleGroup, SloSpec } from '../slo_types';

// ============================================================================
// Doubles
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
    name: 'API Availability',
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

class FakeRulerClient implements SloRulerClient {
  public deleteCalls = 0;
  private groups = new Map<string, GeneratedRuleGroup>();

  private key(ns: string, name: string): string {
    return `${ns}|${name}`;
  }

  async upsertRuleGroup(
    _client: AlertingOSClient,
    _datasource: Datasource,
    namespace: string,
    group: GeneratedRuleGroup
  ): Promise<void> {
    this.groups.set(this.key(namespace, group.groupName), group);
  }

  async deleteRuleGroup(
    _client: AlertingOSClient,
    _datasource: Datasource,
    namespace: string,
    groupName: string
  ): Promise<void> {
    this.deleteCalls += 1;
    this.groups.delete(this.key(namespace, groupName));
  }
}

/**
 * Minimal in-memory tombstone double. Supports the SloTombstoneStoreLite
 * contract exactly — the service only calls `write` from the delete path, but
 * `get` / `remove` exist so tests can verify writes without pulling in a real
 * SavedObjectsClient.
 */
class FakeTombstoneStore implements SloTombstoneStoreLite {
  public writeCalls = 0;
  public writeError: Error | null = null;
  private byId = new Map<string, SloTombstoneAttributesLite>();

  async write(attrs: SloTombstoneAttributesLite): Promise<void> {
    this.writeCalls += 1;
    if (this.writeError) throw this.writeError;
    this.byId.set(attrs.sloId, attrs);
  }

  async get(sloId: string) {
    const a = this.byId.get(sloId);
    return a ? { attributes: a } : null;
  }

  async remove(sloId: string): Promise<boolean> {
    return this.byId.delete(sloId);
  }

  getAttrs(sloId: string): SloTombstoneAttributesLite | undefined {
    return this.byId.get(sloId);
  }
}

function makeHarness(opts: { dedup: boolean } = { dedup: false }) {
  const store = new InMemorySloStore();
  const ruler = new FakeRulerClient();
  const tombstones = new FakeTombstoneStore();
  const svc = new SloService(noopLogger(), store);
  svc.setDedupEnabled(opts.dedup);
  svc.setTombstoneStore(tombstones);

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
    workspaceId: 'ws-42',
  };

  return { store, ruler, tombstones, svc, deploy };
}

// ============================================================================
// Tests
// ============================================================================

describe('SloService.delete — tombstone (W4.1)', () => {
  describe('legacy (dedup disabled)', () => {
    it('writes a tombstone after the delete succeeds', async () => {
      const { svc, tombstones, deploy } = makeHarness({ dedup: false });
      const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);

      await svc.delete(doc.id, deploy);

      expect(tombstones.writeCalls).toBe(1);
      const attrs = tombstones.getAttrs(doc.id);
      expect(attrs).toBeDefined();
      expect(attrs?.sloId).toBe(doc.id);
      expect(attrs?.workspaceId).toBe('ws-42');
      expect(attrs?.datasourceId).toBe('prom-ds-001');
      expect(attrs?.name).toBe(doc.spec.name);
      expect(attrs?.reason).toBe('user_delete');
      expect(typeof attrs?.createdAt).toBe('string');
      // createdAt should be an ISO-8601 timestamp.
      expect(Number.isFinite(Date.parse(attrs?.createdAt ?? ''))).toBe(true);
    });

    it('falls back to spec.datasourceId as workspaceId when no deploy context is provided', async () => {
      // Seed the SLO through the dedup-disabled create path with a deploy
      // context, then re-delete it without one. The legacy path tolerates a
      // missing deploy when there are no ruler groups to tear down — we
      // simulate that by stripping the provisioning ruleGroupName.
      const { svc, store, tombstones, deploy } = makeHarness({ dedup: false });
      const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);
      if (doc.status.provisioning.backend === 'prometheus') {
        doc.status.provisioning.alertGroupName = '';
      }
      await store.save(doc);

      await svc.delete(doc.id); // no deploy

      const attrs = tombstones.getAttrs(doc.id);
      expect(attrs?.workspaceId).toBe(doc.spec.datasourceId);
      expect(attrs?.reason).toBe('user_delete');
    });
  });

  describe('dedup path', () => {
    it('writes a tombstone with the deploy-context workspaceId', async () => {
      const { svc, tombstones, deploy } = makeHarness({ dedup: true });
      const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);

      await svc.delete(doc.id, deploy);

      expect(tombstones.writeCalls).toBe(1);
      const attrs = tombstones.getAttrs(doc.id);
      expect(attrs?.sloId).toBe(doc.id);
      expect(attrs?.workspaceId).toBe('ws-42');
      expect(attrs?.datasourceId).toBe('prom-ds-001');
      expect(attrs?.name).toBe(doc.spec.name);
      expect(attrs?.reason).toBe('user_delete');
    });
  });

  describe('error tolerance', () => {
    it('does not propagate a tombstone-store failure out of delete', async () => {
      const { svc, store, tombstones, deploy } = makeHarness({ dedup: false });
      const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);
      tombstones.writeError = new Error('tombstone store unavailable');

      const result = await svc.delete(doc.id, deploy);

      expect(result.deleted).toBe(true);
      // SO is still gone — delete committed before the tombstone write was attempted.
      expect(await store.get(doc.id)).toBeNull();
      expect(tombstones.writeCalls).toBe(1);
    });

    it('is a no-op when the tombstone store is unset', async () => {
      const { svc, deploy } = makeHarness({ dedup: false });
      // Explicitly clear the tombstone store.
      svc.setTombstoneStore(undefined);
      const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);

      await expect(svc.delete(doc.id, deploy)).resolves.toMatchObject({ deleted: true });
    });
  });
});
