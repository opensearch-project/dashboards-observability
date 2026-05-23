/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SavedObjectsClientContract } from '../../../../../../src/core/server';
import type { SloDocument } from '../../../../common/slo/slo_types';
import { SavedObjectSloStore } from '../slo_saved_object_store';

const SO_TYPE = 'slo-definition';

class StatusError extends Error {
  public output: { statusCode: number };
  public statusCode: number;
  constructor(status: number, message: string) {
    super(message);
    this.statusCode = status;
    this.output = { statusCode: status };
  }
}

function notFound(id: string) {
  return new StatusError(404, `Saved object [${SO_TYPE}/${id}] not found`);
}

interface FakeStored {
  id: string;
  attributes: Record<string, unknown>;
}

function makeFakeClient() {
  const byId = new Map<string, FakeStored>();
  let lastFindFilter: string | undefined;
  let lastFindOpts:
    | {
        type: string;
        perPage: number;
        page: number;
        filter?: string;
        search?: string;
        searchFields?: string[];
      }
    | undefined;

  const client = ({
    async get(_type: string, id: string) {
      const hit = byId.get(id);
      if (!hit) throw notFound(id);
      return { id, type: SO_TYPE, attributes: { ...hit.attributes }, references: [] };
    },
    async create(_type: string, attrs: Record<string, unknown>, options: { id: string }) {
      byId.set(options.id, { id: options.id, attributes: { ...attrs } });
      return { id: options.id, type: SO_TYPE, attributes: { ...attrs }, references: [] };
    },
    async delete(_type: string, id: string) {
      if (!byId.has(id)) throw notFound(id);
      byId.delete(id);
      return {};
    },
    async find(opts: {
      type: string;
      perPage: number;
      page: number;
      filter?: string;
      search?: string;
      searchFields?: string[];
    }) {
      lastFindFilter = opts.filter;
      lastFindOpts = opts;
      const all = Array.from(byId.values()).map((s) => ({
        id: s.id,
        type: SO_TYPE,
        attributes: { ...s.attributes },
        references: [],
      }));
      // Paginate the fake — the store loops until total is reached.
      const start = (opts.page - 1) * opts.perPage;
      const slice = all.slice(start, start + opts.perPage);
      return { saved_objects: slice, total: all.length, page: opts.page, per_page: opts.perPage };
    },
  } as unknown) as SavedObjectsClientContract;

  return {
    client,
    byId,
    getLastFindFilter: () => lastFindFilter,
    getLastFindOpts: () => lastFindOpts,
    /** Inject a malformed entry the listing should skip rather than throw on. */
    addRaw(id: string, attributes: Record<string, unknown>) {
      byId.set(id, { id, attributes });
    },
  };
}

function makeDoc(overrides: Partial<SloDocument['spec']> = {}, id = 'slo-1'): SloDocument {
  return {
    id,
    spec: {
      datasourceId: 'prom-ds-001',
      name: 'API Availability',
      enabled: true,
      mode: 'active',
      service: 'api-gateway',
      owner: { teams: ['platform', 'sre'], primaryUser: 'oncall@example.com' },
      tier: 'tier-1',
      sli: {
        type: 'single',
        definition: {
          backend: 'prometheus',
          type: 'availability',
          calcMethod: 'events',
          metric: 'http_requests_total',
          goodEventsFilter: 'status_code!~"5.."',
        },
        dimensions: [
          { name: 'service', value: 'api-gateway' },
          { name: 'handler', value: '/api/v1/users' },
        ],
      },
      objectives: [
        { name: 'availability-99-9', target: 0.999 },
        { name: 'availability-99-95', target: 0.9995 },
      ],
      budgetWarningThresholds: [{ threshold: 0.5, severity: 'warning' }],
      window: { type: 'rolling', duration: '30d' },
      alerting: { strategy: 'mwmbr', burnRates: [] },
      alarms: {
        sliHealth: { enabled: false },
        attainmentBreach: { enabled: false },
        budgetWarning: { enabled: true },
        noData: { enabled: false, forDuration: '10m' },
        resolved: { enabled: false },
      },
      exclusionWindows: [],
      labels: { compliance: 'pci', region: ['us-west-2', 'us-east-1'] },
      annotations: { runbook: 'https://wiki/slo' },
      ...overrides,
    },
    status: {
      version: 1,
      createdAt: '2026-04-22T00:00:00.000Z',
      createdBy: 'alice',
      updatedAt: '2026-04-23T00:00:00.000Z',
      updatedBy: 'bob',
      provisioning: {
        backend: 'prometheus',
        alertGroupName: 'slo:api_availability_abcd1234',
        rulerNamespace: 'slo-generated',
      },
    },
  };
}

describe('SavedObjectSloStore.save → projectAttributes', () => {
  it('persists the full spec/status plus flattened projections used for listing filters', async () => {
    const fake = makeFakeClient();
    const store = new SavedObjectSloStore(fake.client);
    const doc = makeDoc();

    await store.save(doc);

    const stored = fake.byId.get('slo-1');
    expect(stored).toBeDefined();
    const a = stored!.attributes;

    // Opaque payload preserved verbatim.
    expect(a.spec).toEqual(doc.spec);
    expect(a.status).toEqual(doc.status);

    // Spec projections.
    expect(a.name).toBe('API Availability');
    expect(a.datasourceId).toBe('prom-ds-001');
    expect(a.enabled).toBe(true);
    expect(a.mode).toBe('active');
    expect(a.service).toBe('api-gateway');
    expect(a.tier).toBe('tier-1');
    expect(a.ownerTeams).toEqual(['platform', 'sre']);
    expect(a.ownerPrimaryUser).toBe('oncall@example.com');
    expect(a.primaryOwnerTeam).toBe('platform');
    expect(a.sliNodeType).toBe('single');
    expect(a.sliBackend).toBe('prometheus');
    expect(a.sliLeafType).toBe('availability');
    expect(a.dimensionNames).toEqual(['service', 'handler']);
    expect(a.dimensionValues).toEqual(['api-gateway', '/api/v1/users']);
    expect(a.objectiveCount).toBe(2);
    // worstTarget is the MAX across objectives (the tightest target — the
    // smallest error budget — is the highest number).
    expect(a.worstTarget).toBe(0.9995);
    expect(a.labelKeys).toEqual(['compliance', 'region']);
    // Multi-value labels flatten to a single array.
    expect(a.labelValues).toEqual(['pci', 'us-west-2', 'us-east-1']);

    // Audit projections.
    expect(a.version).toBe(1);
    expect(a.createdBy).toBe('alice');
    expect(a.updatedBy).toBe('bob');
  });

  it('handles an empty objectives array without throwing (worstTarget=0)', async () => {
    const fake = makeFakeClient();
    const store = new SavedObjectSloStore(fake.client);
    const doc = makeDoc({ objectives: [] });

    await store.save(doc);

    const a = fake.byId.get('slo-1')!.attributes;
    expect(a.objectiveCount).toBe(0);
    expect(a.worstTarget).toBe(0);
  });

  it('handles a composite SLI shape (no dimensions / definition fields)', async () => {
    const fake = makeFakeClient();
    const store = new SavedObjectSloStore(fake.client);
    // Composite SLIs are reserved (P2) but the projection must not throw on
    // them — the SO writer is downstream of the route schema, which forbids
    // composite specs only at the validator layer.
    const doc = makeDoc({
      sli: ({
        type: 'composite',
        operator: 'all',
        members: [],
      } as unknown) as SloDocument['spec']['sli'],
    });

    await store.save(doc);

    const a = fake.byId.get('slo-1')!.attributes;
    expect(a.sliNodeType).toBe('composite');
    expect(a.sliBackend).toBeUndefined();
    expect(a.sliLeafType).toBeUndefined();
    expect(a.dimensionNames).toEqual([]);
    expect(a.dimensionValues).toEqual([]);
  });
});

describe('SavedObjectSloStore.list', () => {
  it('skips malformed documents (missing spec/status) instead of failing the listing', async () => {
    const fake = makeFakeClient();
    const store = new SavedObjectSloStore(fake.client);

    const goodDoc = makeDoc({}, 'slo-good');
    await store.save(goodDoc);

    // Inject a malformed doc bypassing the writer — simulates a corrupted
    // document landing in the index from a different code path or version.
    fake.addRaw('slo-malformed', { name: 'no spec or status' });

    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('slo-good');
  });

  it('builds an OR filter on datasourceId and escapes embedded backslashes/quotes', async () => {
    const fake = makeFakeClient();
    const store = new SavedObjectSloStore(fake.client);

    await store.list(['ds-1', 'ds"crafty', 'ds\\evil"id']);

    const filter = fake.getLastFindFilter() ?? '';
    expect(filter).toContain(`${SO_TYPE}.attributes.datasourceId: "ds-1"`);
    expect(filter).toContain(`${SO_TYPE}.attributes.datasourceId: "ds\\"crafty"`);
    expect(filter).toContain(`${SO_TYPE}.attributes.datasourceId: "ds\\\\evil\\"id"`);
    // Single OR clause group — balanced parens.
    const open = (filter.match(/\(/g) ?? []).length;
    const close = (filter.match(/\)/g) ?? []).length;
    expect(open).toBe(close);
  });

  it('passes no filter when datasourceIds is omitted or empty', async () => {
    const fake = makeFakeClient();
    const store = new SavedObjectSloStore(fake.client);
    await store.list();
    expect(fake.getLastFindFilter()).toBeUndefined();
    await store.list([]);
    expect(fake.getLastFindFilter()).toBeUndefined();
  });
});

describe('SavedObjectSloStore.paginate — search', () => {
  // Regression: `service` was previously included in `searchFields`, which
  // made OpenSearch reject every non-empty `?search=` query with
  // "Can only use phrase prefix queries on text fields - not on
  // [slo-definition.service] which is of type [keyword]". Service-name
  // filtering is exposed through the structured `service` filter facet, so
  // the free-text search restricts to text-mapped fields (`name`,
  // `description`).
  it('omits the keyword-mapped `service` field from searchFields', async () => {
    const fake = makeFakeClient();
    const store = new SavedObjectSloStore(fake.client);

    await store.paginate({
      page: 1,
      perPage: 20,
      search: 'unicorn',
    });

    const opts = fake.getLastFindOpts();
    expect(opts).toBeDefined();
    expect(opts!.search).toBe('unicorn*');
    expect(opts!.searchFields).toEqual(['name', 'description']);
    expect(opts!.searchFields).not.toContain('service');
  });

  it('does not pass search/searchFields when search is omitted', async () => {
    const fake = makeFakeClient();
    const store = new SavedObjectSloStore(fake.client);

    await store.paginate({ page: 1, perPage: 20 });

    const opts = fake.getLastFindOpts();
    expect(opts!.search).toBeUndefined();
    expect(opts!.searchFields).toBeUndefined();
  });
});

describe('SavedObjectSloStore.get', () => {
  it('returns the persisted document on a hit', async () => {
    const fake = makeFakeClient();
    const store = new SavedObjectSloStore(fake.client);
    await store.save(makeDoc({}, 'slo-1'));

    const fetched = await store.get('slo-1');
    expect(fetched?.id).toBe('slo-1');
    expect(fetched?.spec.name).toBe('API Availability');
  });

  it('swallows 404 from the saved-objects client and returns null', async () => {
    const fake = makeFakeClient();
    const store = new SavedObjectSloStore(fake.client);

    await expect(store.get('does-not-exist')).resolves.toBeNull();
  });

  it('rethrows non-404 errors so callers can distinguish missing from broken', async () => {
    const fake = makeFakeClient();
    // Patch the fake to throw a 5xx for `get`.
    (fake.client.get as unknown) = async () => {
      throw new StatusError(500, 'index unavailable');
    };
    const store = new SavedObjectSloStore(fake.client);

    await expect(store.get('whatever')).rejects.toMatchObject({
      statusCode: 500,
    });
  });
});

describe('SavedObjectSloStore.delete', () => {
  it('returns true when the doc existed', async () => {
    const fake = makeFakeClient();
    const store = new SavedObjectSloStore(fake.client);
    await store.save(makeDoc({}, 'slo-1'));
    await expect(store.delete('slo-1')).resolves.toBe(true);
    expect(fake.byId.has('slo-1')).toBe(false);
  });

  it('returns false on a 404 (idempotent delete)', async () => {
    const fake = makeFakeClient();
    const store = new SavedObjectSloStore(fake.client);
    await expect(store.delete('missing')).resolves.toBe(false);
  });

  it('rethrows non-404 errors', async () => {
    const fake = makeFakeClient();
    (fake.client.delete as unknown) = async () => {
      throw new StatusError(409, 'version conflict');
    };
    const store = new SavedObjectSloStore(fake.client);
    await expect(store.delete('whatever')).rejects.toMatchObject({ statusCode: 409 });
  });
});
