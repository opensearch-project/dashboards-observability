/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InMemoryDatasourceService } from '../datasource_service';
import type { Logger } from '../../../../common/types/alerting';

const mockLogger: Logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

function noopLogger(): Logger {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

const dsInput = {
  name: 'test',
  type: 'opensearch' as const,
  url: 'http://localhost',
  enabled: true,
};

describe('InMemoryDatasourceService', () => {
  let svc: InMemoryDatasourceService;

  beforeEach(() => {
    svc = new InMemoryDatasourceService(mockLogger);
  });

  it('create returns datasource with generated id', async () => {
    const ds = await svc.create(dsInput);
    expect(ds.id).toMatch(/^ds-\d+$/);
    expect(ds.name).toBe('test');
  });

  it('get returns created datasource', async () => {
    const ds = await svc.create(dsInput);
    expect(await svc.get(ds.id)).toEqual(ds);
  });

  it('get returns null for unknown id', async () => {
    expect(await svc.get('nope')).toBeNull();
  });

  it('list returns all datasources', async () => {
    await svc.create(dsInput);
    await svc.create({ ...dsInput, name: 'second' });
    expect(await svc.list()).toHaveLength(2);
  });

  it('delete removes datasource', async () => {
    const ds = await svc.create(dsInput);
    expect(await svc.delete(ds.id)).toBe(true);
    expect(await svc.get(ds.id)).toBeNull();
  });

  it('delete returns false for unknown id', async () => {
    expect(await svc.delete('nope')).toBe(false);
  });

  it('update merges fields', async () => {
    const ds = await svc.create(dsInput);
    const updated = await svc.update(ds.id, { name: 'renamed' });
    expect(updated?.name).toBe('renamed');
  });

  it('seed populates multiple datasources', async () => {
    svc.seed([dsInput, { ...dsInput, name: 'b' }]);
    expect(await svc.list()).toHaveLength(2);
  });
});

describe('InMemoryDatasourceService.get', () => {
  it('resolves by auto-generated ds-N id', async () => {
    const svc = new InMemoryDatasourceService(noopLogger());
    await svc.create({
      name: 'ObservabilityStack_Prometheus',
      type: 'prometheus',
      url: 'so-id-123',
      enabled: true,
      directQueryName: 'ObservabilityStack_Prometheus',
    });

    const ds = await svc.get('ds-1');
    expect(ds?.name).toBe('ObservabilityStack_Prometheus');
  });

  it('falls back to matching directQueryName when ds-N lookup misses', async () => {
    // Repro for #S1: the SLO wizard lets users type the connectionId they see
    // in `GET /api/alerting/datasources` (`directQueryName`), not the
    // auto-generated `ds-N`. Without the fallback, the ruler dual-write
    // silently no-ops because `get()` returns null.
    const svc = new InMemoryDatasourceService(noopLogger());
    await svc.create({
      name: 'ObservabilityStack_Prometheus',
      type: 'prometheus',
      url: 'so-id-123',
      enabled: true,
      directQueryName: 'ObservabilityStack_Prometheus',
    });

    const ds = await svc.get('ObservabilityStack_Prometheus');
    expect(ds).not.toBeNull();
    expect(ds?.id).toBe('ds-1');
    expect(ds?.directQueryName).toBe('ObservabilityStack_Prometheus');
  });

  it('does NOT fall back on display name (collidable, can shadow another datasource)', async () => {
    const svc = new InMemoryDatasourceService(noopLogger());
    await svc.create({
      name: 'My Cortex',
      type: 'opensearch',
      url: 'local',
      enabled: true,
    });

    // Display name lookup must miss. `name` is user-controlled and can
    // collide; resolving by it would let a freshly-created datasource shadow
    // an older one's lookups.
    const ds = await svc.get('My Cortex');
    expect(ds).toBeNull();
  });

  it('returns null when directQueryName matches more than one entry (ambiguous)', async () => {
    const svc = new InMemoryDatasourceService(noopLogger());
    await svc.create({
      name: 'Cortex A',
      type: 'prometheus',
      url: 'so-1',
      enabled: true,
      directQueryName: 'shared-conn',
    });
    await svc.create({
      name: 'Cortex B',
      type: 'prometheus',
      url: 'so-2',
      enabled: true,
      directQueryName: 'shared-conn',
    });

    // SQL plugin contract treats connectionId as unique, but if two registry
    // entries collide we refuse to pick one rather than silently shadowing.
    const ds = await svc.get('shared-conn');
    expect(ds).toBeNull();
  });

  it('returns null when no id / name / directQueryName matches', async () => {
    const svc = new InMemoryDatasourceService(noopLogger());
    await svc.create({
      name: 'ObservabilityStack_Prometheus',
      type: 'prometheus',
      url: 'so-id-123',
      enabled: true,
      directQueryName: 'ObservabilityStack_Prometheus',
    });

    const ds = await svc.get('nonexistent');
    expect(ds).toBeNull();
  });
});

describe('InMemoryDatasourceService.reconcile', () => {
  // Repro for the ds-N cycling bug (adjacent finding in the #S5 session):
  // the old discoverOsdDatasources did `delete-all + seed`, which bumped
  // the auto-increment counter on every refresh. Any persisted SLO whose
  // spec.datasourceId was "ds-3" was orphaned ~30s later because that
  // logical connection was now "ds-6", then "ds-9", etc. Every delete or
  // update after the first refresh silently skipped the ruler dual-write
  // because the route's datasourceService.get("ds-3") resolved to null.
  it('preserves ds-N id across repeated reconciles when the stable key is unchanged', async () => {
    const svc = new InMemoryDatasourceService(noopLogger());
    const discovered = [
      { name: 'Local Cluster', type: 'opensearch' as const, url: 'local', enabled: true },
      {
        name: 'ObservabilityStack_Prometheus',
        type: 'prometheus' as const,
        url: 'so-abc',
        enabled: true,
        directQueryName: 'ObservabilityStack_Prometheus',
      },
    ];

    await svc.reconcile(discovered);
    const firstIds = (await svc.list()).map((d) => `${d.id}:${d.name}`).sort();

    // Simulate the 30s refresh — same logical entries, new Array references.
    await svc.reconcile(discovered.map((d) => ({ ...d })));
    await svc.reconcile(discovered.map((d) => ({ ...d })));
    const laterIds = (await svc.list()).map((d) => `${d.id}:${d.name}`).sort();

    expect(laterIds).toEqual(firstIds);
  });

  it('keeps the id stable when name / url / enabled change but stable key (directQueryName) is the same', async () => {
    const svc = new InMemoryDatasourceService(noopLogger());
    await svc.reconcile([
      {
        name: 'Old Name',
        type: 'prometheus' as const,
        url: 'so-xyz',
        enabled: true,
        directQueryName: 'prod-prom',
      },
    ]);
    const before = (await svc.list())[0];

    await svc.reconcile([
      {
        name: 'Renamed',
        type: 'prometheus' as const,
        url: 'so-abc', // even the SO id can shift; stable key is directQueryName
        enabled: false,
        directQueryName: 'prod-prom',
      },
    ]);
    const after = (await svc.list())[0];

    expect(after.id).toBe(before.id);
    expect(after.name).toBe('Renamed');
    expect(after.enabled).toBe(false);
  });

  it('prunes discovery-owned entries that vanish from the SO set', async () => {
    const svc = new InMemoryDatasourceService(noopLogger());
    await svc.reconcile([
      { name: 'Local Cluster', type: 'opensearch' as const, url: 'local', enabled: true },
      {
        name: 'Prom A',
        type: 'prometheus' as const,
        url: 'so-a',
        enabled: true,
        directQueryName: 'prom-a',
      },
      {
        name: 'Prom B',
        type: 'prometheus' as const,
        url: 'so-b',
        enabled: true,
        directQueryName: 'prom-b',
      },
    ]);
    expect(await svc.list()).toHaveLength(3);

    // Prom B got deleted upstream.
    await svc.reconcile([
      { name: 'Local Cluster', type: 'opensearch' as const, url: 'local', enabled: true },
      {
        name: 'Prom A',
        type: 'prometheus' as const,
        url: 'so-a',
        enabled: true,
        directQueryName: 'prom-a',
      },
    ]);
    const names = (await svc.list()).map((d) => d.name).sort();
    expect(names).toEqual(['Local Cluster', 'Prom A']);
  });

  it('does not prune user-created entries (no directQueryName / mdsId / local sentinel)', async () => {
    const svc = new InMemoryDatasourceService(noopLogger());
    await svc.create({
      name: 'Manually added',
      type: 'prometheus',
      url: 'http://user-prom:9090',
      enabled: true,
    });
    await svc.reconcile([
      { name: 'Local Cluster', type: 'opensearch' as const, url: 'local', enabled: true },
    ]);

    const names = (await svc.list()).map((d) => d.name).sort();
    expect(names).toEqual(['Local Cluster', 'Manually added']);
  });

  it('adds a new entry without disturbing existing ids', async () => {
    const svc = new InMemoryDatasourceService(noopLogger());
    await svc.reconcile([
      {
        name: 'Prom A',
        type: 'prometheus' as const,
        url: 'so-a',
        enabled: true,
        directQueryName: 'prom-a',
      },
    ]);
    const idA = (await svc.list())[0].id;

    await svc.reconcile([
      {
        name: 'Prom A',
        type: 'prometheus' as const,
        url: 'so-a',
        enabled: true,
        directQueryName: 'prom-a',
      },
      {
        name: 'Prom B',
        type: 'prometheus' as const,
        url: 'so-b',
        enabled: true,
        directQueryName: 'prom-b',
      },
    ]);
    const byName = new Map((await svc.list()).map((d) => [d.name, d.id]));
    expect(byName.get('Prom A')).toBe(idA);
    expect(byName.get('Prom B')).toBeDefined();
    expect(byName.get('Prom B')).not.toBe(idA);
  });
});
