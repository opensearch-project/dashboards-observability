/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Cursor pagination behavior of `SloService.paginate`. The aim is to
 * cover the round-trip and the drift-reset path without a real
 * saved-objects backend — the bundled `InMemorySloStore` implements the
 * same `paginate` contract the SO-backed store does.
 */

import { SloService } from '../slo_service';
import { InMemorySloStore } from '../slo_store';
import type { Logger } from '../../types/alerting';
import type { SloDocument, SloSpec } from '../slo_types';
import { encodeCursor } from '../slo_pagination_cursor';

function noopLogger(): Logger {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  };
}

function makeDoc(id: string, name: string = id): SloDocument {
  const spec: SloSpec = {
    datasourceId: 'ds-1',
    name,
    enabled: true,
    mode: 'active',
    service: 'svc',
    owner: { teams: ['t'] },
    sli: {
      type: 'single',
      definition: {
        backend: 'prometheus',
        type: 'availability',
        calcMethod: 'events',
        metric: 'http_requests_total',
      },
      dimensions: [{ name: 'service', value: 'svc' }],
    },
    objectives: [{ name: 'o1', target: 0.99 }],
    budgetWarningThresholds: [],
    window: { type: 'rolling', duration: '28d' },
    alerting: { strategy: 'mwmbr', burnRates: [] },
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
  };
  return {
    id,
    spec,
    status: {
      version: 1,
      createdAt: '2024-01-01T00:00:00Z',
      createdBy: 'tester',
      updatedAt: '2024-01-01T00:00:00Z',
      updatedBy: 'tester',
      provisioning: {
        backend: 'prometheus',
        alertGroupName: `grp-${id}`,
      },
    },
  };
}

async function seed(svc: SloService, count: number) {
  // Bypass the create wizard validation by writing through the underlying
  // store so the test can populate a known-cardinality fleet.
  const store = ((svc as unknown) as { core: { store: InMemorySloStore } }).core.store;
  for (let i = 0; i < count; i++) {
    await store.save(makeDoc(`slo-${String(i).padStart(3, '0')}`));
  }
}

describe('SloService.paginate (cursor)', () => {
  it('returns the first page when no cursor is supplied', async () => {
    const svc = new SloService(noopLogger(), new InMemorySloStore());
    await seed(svc, 25);

    const result = await svc.paginate({ pageSize: 10 }, null);
    expect(result.results).toHaveLength(10);
    expect(result.total).toBe(25);
    expect(result.pageSize).toBe(10);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).not.toBeNull();
    expect(result.prevCursor).toBeNull();
  });

  it('paginates forward and back with no duplicates and no gaps', async () => {
    const svc = new SloService(noopLogger(), new InMemorySloStore());
    await seed(svc, 35);

    const ids: string[] = [];
    let cursor: string | null = null;
    while (true) {
      const r = await svc.paginate({ pageSize: 10 }, cursor);
      ids.push(...r.results.map((s) => s.id));
      if (!r.hasMore || !r.nextCursor) break;
      cursor = r.nextCursor;
    }
    expect(ids).toHaveLength(35);
    expect(new Set(ids).size).toBe(35);
  });

  it('final page returns hasMore=false and nextCursor=null', async () => {
    const svc = new SloService(noopLogger(), new InMemorySloStore());
    await seed(svc, 12);

    const first = await svc.paginate({ pageSize: 10 }, null);
    expect(first.hasMore).toBe(true);
    const second = await svc.paginate({ pageSize: 10 }, first.nextCursor);
    expect(second.results).toHaveLength(2);
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeNull();
    expect(second.prevCursor).not.toBeNull();
  });

  it('malformed cursor resets to page 1 (graceful degradation)', async () => {
    const svc = new SloService(noopLogger(), new InMemorySloStore());
    await seed(svc, 30);

    const result = await svc.paginate({ pageSize: 10 }, 'not!base64-and-not-json');
    expect(result.results).toHaveLength(10);
    expect(result.prevCursor).toBeNull();
  });

  it('cursor whose filter-fingerprint differs resets to page 1', async () => {
    const svc = new SloService(noopLogger(), new InMemorySloStore());
    await seed(svc, 30);

    // Build a cursor that points at page 2 but with a wrong fingerprint.
    const staleCursor = encodeCursor({
      v: 1,
      p: 2,
      ps: 10,
      sf: 'name',
      so: 'asc',
      fh: 'wrong-fingerprint',
    });
    const r = await svc.paginate({ pageSize: 10, service: ['svc'] }, staleCursor);
    expect(r.prevCursor).toBeNull();
    expect(r.results.map((s) => s.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => `slo-${String(i).padStart(3, '0')}`)
    );
  });

  it('keyword filter pushes through and is applied', async () => {
    const svc = new SloService(noopLogger(), new InMemorySloStore());
    const store = ((svc as unknown) as { core: { store: InMemorySloStore } }).core.store;
    await store.save(makeDoc('a', 'a'));
    const b = makeDoc('b', 'b');
    b.spec.service = 'other';
    await store.save(b);

    const r = await svc.paginate({ pageSize: 10, service: ['other'] }, null);
    expect(r.results).toHaveLength(1);
    expect(r.results[0].id).toBe('b');
  });
});
