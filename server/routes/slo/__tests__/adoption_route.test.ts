/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Router-level tests for Phase 4 W4.6 — adoption endpoints (`_orphans`,
 * `_recover`).
 *
 * Covers:
 *   - 412 feature-flag gate (ruleDedup off, ruleAdoption off, both off)
 *   - `_orphans` happy path + `datasourceId` filter forwarding
 *   - `_recover` happy path + full error-code → HTTP status mapping
 *   - body validation wiring (schema rejects missing `sloId` before the
 *     handler runs)
 *
 * Framework-agnostic: exercises `registerSloAdoptionRoutes` directly against
 * a fake router (same pattern `delete_registry_lookup.test.ts` uses). No real
 * OSD runtime, no real ruler, no real reconciler — all collaborators are
 * `jest.Mocked<...>` shape-matched fakes.
 */

import { registerSloAdoptionRoutes } from '../adoption_route';
import { InMemoryDatasourceService } from '../../../services/alerting';
import { SloAdoptionError } from '../../../../common/slo/slo_errors';
import type { AdoptionErrorCode } from '../../../../common/slo/slo_errors';
import type { SloService } from '../../../../common/slo/slo_service';
import type { SloReconciler } from '../../../services/slo/reconciler';

// ============================================================================
// Fixtures + helpers
// ============================================================================

interface RouteConfig {
  path: string;
  validate?: {
    body?: {
      validate: (value: unknown) => unknown;
    };
  };
}
type RouteHandler = (ctx: unknown, req: unknown, res: unknown) => Promise<unknown>;

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

function makeRouter() {
  return {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };
}

function makeCtx() {
  return {
    core: {
      savedObjects: { client: { find: jest.fn(async () => ({ saved_objects: [] })) } },
      opensearch: { client: { asCurrentUser: {} } },
    },
  };
}

function makeRes() {
  const ok = jest.fn((body: unknown) => ({ status: 200, body }));
  const customError = jest.fn((body: { statusCode: number; body: unknown }) => ({
    status: body.statusCode,
    body: body.body,
  }));
  const custom = jest.fn((body: { statusCode: number; body: unknown }) => ({
    status: body.statusCode,
    body: body.body,
  }));
  return { ok, customError, custom };
}

function getHandler(
  router: ReturnType<typeof makeRouter>,
  verb: 'get' | 'post',
  predicate: (path: string) => boolean
): RouteHandler {
  const call = (router[verb].mock.calls as Array<[RouteConfig, RouteHandler]>).find(([cfg]) =>
    predicate(cfg.path)
  );
  if (!call) throw new Error(`route not registered for ${verb} matching predicate`);
  return call[1];
}

function getRouteConfig(
  router: ReturnType<typeof makeRouter>,
  verb: 'get' | 'post',
  predicate: (path: string) => boolean
): RouteConfig {
  const call = (router[verb].mock.calls as Array<[RouteConfig, RouteHandler]>).find(([cfg]) =>
    predicate(cfg.path)
  );
  if (!call) throw new Error(`route not registered for ${verb} matching predicate`);
  return call[0];
}

interface FakeReconcileResult {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  datasourceIds: string[];
  missingBySlo: unknown[];
  orphans: unknown[];
  adoptableOrphans: Array<Record<string, unknown>>;
  unknownOrphans: Array<Record<string, unknown>>;
  errors: unknown[];
  danglingRefs: unknown[];
  graceDeletions: unknown[];
}

function makeFakeReconciler() {
  const baseResult: FakeReconcileResult = {
    startedAt: '2026-04-25T00:00:00Z',
    finishedAt: '2026-04-25T00:00:01Z',
    durationMs: 1000,
    datasourceIds: ['ds-7'],
    missingBySlo: [],
    orphans: [],
    adoptableOrphans: [],
    unknownOrphans: [],
    errors: [],
    danglingRefs: [],
    graceDeletions: [],
  };
  return {
    start: jest.fn(),
    stop: jest.fn(async () => undefined),
    reconcileOnce: jest.fn<Promise<FakeReconcileResult>, [{ datasourceIds?: string[] }?]>(
      async () => baseResult
    ),
  };
}

function makeFakeService() {
  return {
    recover: jest.fn(),
  };
}

async function seedDatasource(service: InMemoryDatasourceService): Promise<string> {
  const ds = await service.create({
    name: 'prometheus-test',
    type: 'prometheus',
    url: '',
    enabled: true,
    directQueryName: 'prometheus-test',
  });
  return ds.id;
}

const fakeRulerClient = {
  upsertRuleGroup: jest.fn(async () => undefined),
  deleteRuleGroup: jest.fn(async () => undefined),
  getRuleGroup: jest.fn(async () => null),
} as never;

interface Wiring {
  router: ReturnType<typeof makeRouter>;
  datasourceService: InMemoryDatasourceService;
  reconciler: ReturnType<typeof makeFakeReconciler>;
  service: ReturnType<typeof makeFakeService>;
  datasourceId: string;
}

async function setupWiring(options: {
  ruleDedupEnabled: boolean;
  ruleAdoptionEnabled: boolean;
}): Promise<Wiring> {
  const datasourceService = new InMemoryDatasourceService(mockLogger as never);
  const datasourceId = await seedDatasource(datasourceService);
  const router = makeRouter();
  const reconciler = makeFakeReconciler();
  const service = makeFakeService();
  (fakeRulerClient as {
    deleteRuleGroup: jest.Mock;
  }).deleteRuleGroup.mockReset();
  (fakeRulerClient as {
    deleteRuleGroup: jest.Mock;
  }).deleteRuleGroup.mockResolvedValue(undefined);
  registerSloAdoptionRoutes({
    router: router as never,
    sloService: (service as unknown) as SloService,
    logger: mockLogger as never,
    rulerClient: fakeRulerClient,
    datasourceService,
    reconciler: (reconciler as unknown) as SloReconciler,
    ruleDedupEnabled: options.ruleDedupEnabled,
    ruleAdoptionEnabled: options.ruleAdoptionEnabled,
  });
  return { router, datasourceService, reconciler, service, datasourceId };
}

// ============================================================================
// 412 gate
// ============================================================================

describe('W4.6 adoption routes — 412 feature-flag gate', () => {
  it('returns 412 with missingFlags=["ruleDedup"] when dedup is off but adoption is on', async () => {
    const { router, reconciler } = await setupWiring({
      ruleDedupEnabled: false,
      ruleAdoptionEnabled: true,
    });

    const orphans = getHandler(router, 'get', (p) => p.endsWith('/_orphans'));
    const recover = getHandler(router, 'post', (p) => p.endsWith('/_recover'));

    for (const [name, handler, reqBody] of [
      ['_orphans', orphans, { query: {} }],
      ['_recover', recover, { body: { sloId: 'slo-1', datasourceId: 'ds-1' }, query: {} }],
    ] as const) {
      const res = makeRes();
      await handler(makeCtx(), reqBody, res);
      expect(res.customError).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 412,
          body: expect.objectContaining({
            attributes: expect.objectContaining({
              error: 'PRECONDITION_FAILED',
              missingFlags: ['ruleDedup'],
            }),
          }),
        })
      );
      expect(res.ok).not.toHaveBeenCalled();
      expect(reconciler.reconcileOnce).not.toHaveBeenCalled();
      reconciler.reconcileOnce.mockClear();
      void name;
    }
  });

  it('returns 412 with missingFlags=["ruleAdoption"] when adoption is off but dedup is on', async () => {
    const { router } = await setupWiring({
      ruleDedupEnabled: true,
      ruleAdoptionEnabled: false,
    });

    const orphans = getHandler(router, 'get', (p) => p.endsWith('/_orphans'));
    const recover = getHandler(router, 'post', (p) => p.endsWith('/_recover'));

    for (const [handler, reqBody] of [
      [orphans, { query: {} }],
      [recover, { body: { sloId: 'slo-1', datasourceId: 'ds-1' }, query: {} }],
    ] as const) {
      const res = makeRes();
      await handler(makeCtx(), reqBody, res);
      expect(res.customError).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 412,
          body: expect.objectContaining({
            attributes: expect.objectContaining({
              error: 'PRECONDITION_FAILED',
              missingFlags: ['ruleAdoption'],
            }),
          }),
        })
      );
    }
  });

  it('returns 412 with both flags listed in deterministic order when both are off', async () => {
    const { router } = await setupWiring({
      ruleDedupEnabled: false,
      ruleAdoptionEnabled: false,
    });

    const orphans = getHandler(router, 'get', (p) => p.endsWith('/_orphans'));
    const res = makeRes();
    await orphans(makeCtx(), { query: {} }, res);

    expect(res.customError).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 412,
        body: expect.objectContaining({
          attributes: expect.objectContaining({
            error: 'PRECONDITION_FAILED',
            missingFlags: ['ruleDedup', 'ruleAdoption'],
            message: expect.stringContaining(
              'observability.slo.ruleDedup.enabled and observability.slo.ruleAdoption.enabled'
            ),
          }),
        }),
      })
    );
  });
});

// ============================================================================
// _orphans happy path
// ============================================================================

describe('W4.6 GET /_orphans', () => {
  it('maps adoptableOrphans → candidates and unknownOrphans → unknowns', async () => {
    const { router, reconciler } = await setupWiring({
      ruleDedupEnabled: true,
      ruleAdoptionEnabled: true,
    });

    reconciler.reconcileOnce.mockResolvedValueOnce({
      startedAt: '2026-04-25T00:00:00Z',
      finishedAt: '2026-04-25T00:00:01Z',
      durationMs: 1000,
      datasourceIds: ['ds-7'],
      missingBySlo: [],
      orphans: [],
      adoptableOrphans: [
        {
          datasourceId: 'ds-7',
          namespace: 'slo-generated-ds-7',
          groupName: 'slo:alert:group-a',
          sourceSloId: 'slo-a',
          sourceWorkspaceId: 'ds-7',
          spec: {
            datasourceId: 'ds-7',
            name: 'api-availability',
          } as Record<string, unknown>,
          fingerprints: ['fp-a-1', 'fp-a-2'],
          specIntegrity: 'ok',
          tombstoned: false,
        },
        {
          datasourceId: 'ds-7',
          namespace: 'slo-generated-ds-7',
          groupName: 'slo:alert:group-b',
          sourceSloId: 'slo-b',
          sourceWorkspaceId: 'ds-7',
          spec: { datasourceId: 'ds-7', name: 'api-latency' } as Record<string, unknown>,
          fingerprints: ['fp-b-1'],
          specIntegrity: 'ok',
          tombstoned: true,
          tombstoneCreatedAt: '2026-04-24T10:00:00Z',
        },
      ],
      unknownOrphans: [
        {
          datasourceId: 'ds-7',
          namespace: 'slo-generated-ds-7',
          groupName: 'slo:legacy-group',
          diagnostic: 'pre-Phase-3 rule layout; not eligible for adoption',
        },
      ],
      errors: [],
      danglingRefs: [],
      graceDeletions: [],
    });

    const handler = getHandler(router, 'get', (p) => p.endsWith('/_orphans'));
    const res = makeRes();
    await handler(makeCtx(), { query: {} }, res);

    expect(res.ok).toHaveBeenCalled();
    const body = (res.ok.mock.calls[0][0] as { body: unknown }).body as {
      candidates: Array<Record<string, unknown>>;
      unknowns: Array<Record<string, unknown>>;
    };
    expect(body.candidates).toHaveLength(2);
    expect(body.unknowns).toHaveLength(1);
    expect(body.candidates[0]).toMatchObject({
      sloId: 'slo-a',
      datasourceId: 'ds-7',
      workspaceId: 'ds-7',
      groupName: 'slo:alert:group-a',
      specIntegrity: 'ok',
      tombstoned: false,
      fingerprints: ['fp-a-1', 'fp-a-2'],
    });
    expect(body.candidates[1]).toMatchObject({
      sloId: 'slo-b',
      tombstoned: true,
      tombstoneCreatedAt: '2026-04-24T10:00:00Z',
    });
    expect(typeof body.candidates[0].specSha256).toBe('string');
    expect(body.unknowns[0]).toMatchObject({
      datasourceId: 'ds-7',
      groupName: 'slo:legacy-group',
      diagnostic: expect.stringContaining('pre-Phase-3'),
    });
  });

  it('surfaces unsupported-schema discriminator fields on unknowns so the UI can distinguish "upgrade plugin" from "legacy layout"', async () => {
    const { router, reconciler } = await setupWiring({
      ruleDedupEnabled: true,
      ruleAdoptionEnabled: true,
    });

    reconciler.reconcileOnce.mockResolvedValueOnce({
      startedAt: '2026-04-29T00:00:00Z',
      finishedAt: '2026-04-29T00:00:01Z',
      durationMs: 1000,
      datasourceIds: ['ds-7'],
      missingBySlo: [],
      orphans: [],
      adoptableOrphans: [],
      unknownOrphans: [
        {
          datasourceId: 'ds-7',
          namespace: 'slo-generated-ds-7',
          groupName: 'slo:alerts:future-slo',
          diagnostic: 'provenance schemaVersion 99 not supported (expected 1)',
          sourceSloId: 'slo-from-future',
          sourceWorkspaceId: 'ds-7',
          schemaVersion: 99,
          specIntegrity: 'unsupported_schema',
        },
        {
          datasourceId: 'ds-7',
          namespace: 'slo-generated-ds-7',
          groupName: 'slo-legacy-monolithic',
          diagnostic: 'pre-Phase-3 rule layout; not eligible for adoption',
        },
      ],
      errors: [],
      danglingRefs: [],
      graceDeletions: [],
    });

    const handler = getHandler(router, 'get', (p) => p.endsWith('/_orphans'));
    const res = makeRes();
    await handler(makeCtx(), { query: {} }, res);

    expect(res.ok).toHaveBeenCalled();
    const body = (res.ok.mock.calls[0][0] as { body: unknown }).body as {
      candidates: Array<Record<string, unknown>>;
      unknowns: Array<Record<string, unknown>>;
    };
    expect(body.unknowns).toHaveLength(2);
    expect(body.unknowns[0]).toMatchObject({
      groupName: 'slo:alerts:future-slo',
      sourceSloId: 'slo-from-future',
      schemaVersion: 99,
      specIntegrity: 'unsupported_schema',
    });
    expect(body.unknowns[1]).toMatchObject({
      groupName: 'slo-legacy-monolithic',
      diagnostic: expect.stringContaining('pre-Phase-3'),
    });
    expect(body.unknowns[1].sourceSloId).toBeUndefined();
    expect(body.unknowns[1].specIntegrity).toBeUndefined();
  });

  it('forwards a ?datasourceId= filter to reconcileOnce', async () => {
    const { router, reconciler } = await setupWiring({
      ruleDedupEnabled: true,
      ruleAdoptionEnabled: true,
    });

    const handler = getHandler(router, 'get', (p) => p.endsWith('/_orphans'));
    await handler(makeCtx(), { query: { datasourceId: 'ds-42' } }, makeRes());

    expect(reconciler.reconcileOnce).toHaveBeenCalledWith({ datasourceIds: ['ds-42'] });
  });

  it('passes undefined datasourceIds when no filter is given', async () => {
    const { router, reconciler } = await setupWiring({
      ruleDedupEnabled: true,
      ruleAdoptionEnabled: true,
    });

    const handler = getHandler(router, 'get', (p) => p.endsWith('/_orphans'));
    await handler(makeCtx(), { query: {} }, makeRes());

    expect(reconciler.reconcileOnce).toHaveBeenCalledWith({ datasourceIds: undefined });
  });
});

// ============================================================================
// _recover happy path + error mapping
// ============================================================================

describe('W4.6 POST /_recover', () => {
  it('returns 200 with the service result on happy path', async () => {
    const { router, service, datasourceId } = await setupWiring({
      ruleDedupEnabled: true,
      ruleAdoptionEnabled: true,
    });

    service.recover.mockResolvedValueOnce({
      slo: { id: 'slo-a', spec: { name: 'api-availability' } },
      tombstoneCleared: false,
      refcountChanges: [{ fingerprint: 'fp-a-1', previousRefcount: 0, newRefcount: 1 }],
    });

    const handler = getHandler(router, 'post', (p) => p.endsWith('/_recover'));
    const res = makeRes();
    await handler(makeCtx(), { body: { sloId: 'slo-a', datasourceId }, query: {} }, res);

    expect(res.ok).toHaveBeenCalledWith({
      body: expect.objectContaining({
        slo: expect.objectContaining({ id: 'slo-a' }),
        tombstoneCleared: false,
        refcountChanges: expect.any(Array),
      }),
    });
    expect(service.recover).toHaveBeenCalledTimes(1);
    const [_input, deploy] = service.recover.mock.calls[0];
    expect(deploy).toMatchObject({ workspaceId: datasourceId });
  });

  it.each<[AdoptionErrorCode, number]>([
    ['ORPHAN_SPEC_DRIFT', 422],
    ['ORPHAN_WORKSPACE_MISMATCH', 422],
    ['ORPHAN_UNSUPPORTED_SCHEMA', 422],
    ['ORPHAN_CLAIM_CONFLICT', 409],
    ['ORPHAN_TOMBSTONED', 409],
  ])('maps SloAdoptionError[%s] to HTTP %d', async (code, expectedStatus) => {
    const { router, service, datasourceId } = await setupWiring({
      ruleDedupEnabled: true,
      ruleAdoptionEnabled: true,
    });

    service.recover.mockRejectedValueOnce(new SloAdoptionError(code, `simulated ${code}`));

    const handler = getHandler(router, 'post', (p) => p.endsWith('/_recover'));
    const res = makeRes();
    await handler(makeCtx(), { body: { sloId: 'slo-a', datasourceId }, query: {} }, res);

    expect(res.customError).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: expectedStatus,
        body: expect.objectContaining({
          attributes: expect.objectContaining({ code }),
        }),
      })
    );
  });

  it('maps SloNotFoundError to HTTP 404', async () => {
    const { router, service, datasourceId } = await setupWiring({
      ruleDedupEnabled: true,
      ruleAdoptionEnabled: true,
    });

    const {
      SloNotFoundError,
      // eslint-disable-next-line @typescript-eslint/no-var-requires
    } = require('../../../../common/slo/slo_errors');
    service.recover.mockRejectedValueOnce(new SloNotFoundError('slo-missing'));

    const handler = getHandler(router, 'post', (p) => p.endsWith('/_recover'));
    const res = makeRes();
    await handler(makeCtx(), { body: { sloId: 'slo-missing', datasourceId }, query: {} }, res);

    expect(res.customError).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  it('maps SloValidationError to HTTP 400', async () => {
    const { router, service, datasourceId } = await setupWiring({
      ruleDedupEnabled: true,
      ruleAdoptionEnabled: true,
    });

    const {
      SloValidationError,
      // eslint-disable-next-line @typescript-eslint/no-var-requires
    } = require('../../../../common/slo/slo_errors');
    service.recover.mockRejectedValueOnce(
      new SloValidationError({ 'spec.name': 'must not be empty' })
    );

    const handler = getHandler(router, 'post', (p) => p.endsWith('/_recover'));
    const res = makeRes();
    await handler(makeCtx(), { body: { sloId: 'slo-a', datasourceId }, query: {} }, res);

    expect(res.customError).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('maps generic Error to HTTP 500', async () => {
    const { router, service, datasourceId } = await setupWiring({
      ruleDedupEnabled: true,
      ruleAdoptionEnabled: true,
    });

    service.recover.mockRejectedValueOnce(new Error('unexpected kaboom'));

    const handler = getHandler(router, 'post', (p) => p.endsWith('/_recover'));
    const res = makeRes();
    await handler(makeCtx(), { body: { sloId: 'slo-a', datasourceId }, query: {} }, res);

    expect(res.customError).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500 }));
  });

  it('rejects bodies missing `sloId` at the schema layer', async () => {
    const { router } = await setupWiring({
      ruleDedupEnabled: true,
      ruleAdoptionEnabled: true,
    });

    const cfg = getRouteConfig(router, 'post', (p) => p.endsWith('/_recover'));
    const bodyValidator = (cfg.validate?.body as unknown) as {
      validate: (value: unknown) => unknown;
    };
    expect(bodyValidator).toBeDefined();
    expect(() => bodyValidator.validate({ datasourceId: 'ds-7' })).toThrow();
  });
});
