/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SloService.delete — 404 tolerance regression coverage.
 *
 * Pins the contract:
 *   - Happy path: ruler group present → deleteRuleGroup called, SO removed.
 *   - 404 path: ruler `deleteRuleGroup` resolves successfully (the ruler
 *     client is 404-tolerant) → SO still deletes cleanly, callers see
 *     `{ deleted: true, generatedRuleNames }`.
 *   - 5xx / unreachable: ruler throws SloRulerError → SO stays, user retries.
 *
 * The service itself doesn't see the 404; the RulerClient swallows it. This
 * test makes sure we don't re-introduce a bug where the service-layer logic
 * treats a "no-op delete" as a failure.
 */

import { SloDeployContext, SloRulerClient, SloRulerError, SloService } from '../slo_service';
import { DEFAULT_MWMBR_TIERS } from '../slo_promql_generator';
import type { AlertingOSClient, Datasource, Logger } from '../../types/alerting';
import type { GeneratedRuleGroup, ISloStore, SloDocument, SloSpec } from '../slo_types';

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

function makeDeps() {
  const saved = new Map<string, SloDocument>();
  const store: ISloStore & { save: jest.Mock; delete: jest.Mock; get: jest.Mock } = {
    get: jest.fn(async (id: string) => saved.get(id) ?? null),
    list: jest.fn(async () => Array.from(saved.values())),
    save: jest.fn(async (doc: SloDocument) => {
      saved.set(doc.id, doc);
    }),
    delete: jest.fn(async (id: string) => saved.delete(id)),
  };

  const ruler: SloRulerClient & {
    upsertRuleGroup: jest.Mock;
    deleteRuleGroup: jest.Mock;
  } = {
    upsertRuleGroup: jest.fn(
      async (_c: AlertingOSClient, _ds: Datasource, _ns: string, _g: GeneratedRuleGroup) => {
        // no-op
      }
    ),
    deleteRuleGroup: jest.fn(async () => undefined),
  };

  const datasource: Datasource = {
    id: 'prom-ds-001',
    name: 'prom',
    type: 'prometheus',
    url: '',
    enabled: true,
    directQueryName: 'prom-connection',
  };
  const client = ({ transport: { request: jest.fn() } } as unknown) as AlertingOSClient;

  const deploy: SloDeployContext = {
    ruler,
    client,
    datasource,
    workspaceId: 'ws-unit',
  };

  return { ruler, store, deploy, saved };
}

describe('SloService.delete — ruler 404 tolerance', () => {
  it('happy path: rule group present → deleteRuleGroup called once, SO removed', async () => {
    const { ruler, store, deploy, saved } = makeDeps();
    const svc = new SloService(noopLogger(), store);
    svc.setDedupEnabled(false);
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);

    const result = await svc.delete(doc.id, deploy);

    expect(ruler.deleteRuleGroup).toHaveBeenCalledTimes(1);
    expect(saved.has(doc.id)).toBe(false);
    expect(result.deleted).toBe(true);
  });

  it('ruler already succeeded on 404 (mock resolves undefined) → SO still deletes and generatedRuleNames surface', async () => {
    // Simulates the real-world case: somebody DELETE'd the rule group in
    // Cortex out-of-band. DirectQueryRulerClient.deleteRuleGroup sees the
    // 404 and resolves cleanly. The service must NOT treat this as a
    // failure; the SO tear-down continues, and the caller gets a clean
    // { deleted: true, generatedRuleNames } envelope.
    const { ruler, store, deploy, saved } = makeDeps();
    const svc = new SloService(noopLogger(), store);
    svc.setDedupEnabled(false);
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);

    // Ruler client resolves without throwing (404 was swallowed upstream).
    ruler.deleteRuleGroup.mockResolvedValueOnce(undefined);

    const result = await svc.delete(doc.id, deploy);

    expect(ruler.deleteRuleGroup).toHaveBeenCalledTimes(1);
    expect(saved.has(doc.id)).toBe(false);
    expect(result).toEqual({ deleted: true });
  });

  it('ruler unreachable (non-404) → SloRulerError propagates and SO stays intact', async () => {
    const { ruler, store, deploy, saved } = makeDeps();
    const svc = new SloService(noopLogger(), store);
    svc.setDedupEnabled(false);
    const doc = await svc.create({ spec: validSpec() }, 'alice', deploy);

    ruler.deleteRuleGroup.mockRejectedValueOnce(
      new SloRulerError('RULER_UNREACHABLE', 503, 'gateway timeout')
    );

    await expect(svc.delete(doc.id, deploy)).rejects.toBeInstanceOf(SloRulerError);

    expect(saved.has(doc.id)).toBe(true);
  });
});
