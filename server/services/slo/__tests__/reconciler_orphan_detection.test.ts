/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 4 W4.2 — end-to-end reconciler sweep tests exercising the new orphan
 * categorization + tombstone enrichment path.
 *
 * Runs the real `createSloReconciler` against a `FakeRulerClient` seeded
 * with annotated orphan groups, plus (optionally) an in-memory tombstone
 * store lite. The existing `reconciler.test.ts` remains untouched — this
 * suite is the Phase 4 addition.
 *
 * Covers:
 *   - Adoptable orphan surfaces with full metadata + metrics bump.
 *   - Tombstone present + unexpired → entry.tombstoned === true.
 *   - Tombstone present + expired (past TTL) → entry.tombstoned === false.
 *   - Tombstone store throws → entry.tombstoned === undefined; sweep
 *     continues; error counter NOT bumped (tombstone failures are warns).
 *   - No tombstone store wired → entry.tombstoned === undefined everywhere.
 */

import { createSloReconciler } from '../reconciler';
import type { SloTombstoneReaderLite } from '../reconciler';
import { createReconcilerMetrics } from '../reconciler_metrics';
import { FakeRulerClient } from '../../../../common/slo/__tests__/fake_ruler_client';
import {
  annotateAlertGroup,
  buildAlertProvenance,
} from '../../../../common/slo/slo_rule_provenance';
import { computeSliFingerprint } from '../../../../common/slo/slo_sli_fingerprint';
import { dedupRecordingGroupName } from '../../../../common/slo/slo_promql_generator';
import type { AlertingOSClient, Datasource, Logger } from '../../../../common/types/alerting/types';
import type {
  GeneratedRule,
  GeneratedRuleGroup,
  ISloStore,
  SloDocument,
  SloSpec,
} from '../../../../common/slo/slo_types';
import type { RuleHealthChecker } from '../rule_health_checker';
import type { InMemoryDatasourceService } from '../../alerting/datasource_service';

const DS = 'ds-1';
const WS = 'ds-1'; // default workspaceIdForDatasource echoes the datasourceId
const NS = 'slo-generated-ds-1';

function noopLogger(): Logger {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

function mockClient(): AlertingOSClient {
  return ({
    transport: { request: jest.fn(async () => ({ statusCode: 200, body: {} })) },
  } as unknown) as AlertingOSClient;
}

function mockDatasource(overrides: Partial<Datasource> = {}): Datasource {
  return {
    id: DS,
    name: 'my-cortex',
    type: 'prometheus',
    url: '',
    enabled: true,
    directQueryName: 'my-cortex-connection',
    ...overrides,
  };
}

function validSpec(overrides: Partial<SloSpec> = {}): SloSpec {
  return {
    datasourceId: DS,
    name: 'API availability',
    enabled: true,
    mode: 'active',
    service: 'api',
    owner: { teams: ['platform'] },
    sli: {
      type: 'single',
      definition: {
        backend: 'prometheus',
        type: 'availability',
        calcMethod: 'events',
        metric: 'http_requests_total',
      },
      dimensions: [{ name: 'service', value: 'api' }],
    },
    objectives: [{ name: 'availability-99-9', target: 0.999 }],
    budgetWarningThresholds: [{ threshold: 0.5, severity: 'warning' }],
    window: { type: 'rolling', duration: '28d' },
    alerting: { strategy: 'mwmbr', burnRates: [] },
    alarms: {
      sliHealth: { enabled: false },
      attainmentBreach: { enabled: false },
      budgetWarning: { enabled: false },
      noData: { enabled: false, forDuration: '10m' },
      resolved: { enabled: false },
    },
    exclusionWindows: [],
    labels: {},
    annotations: {},
    ...overrides,
  };
}

function stubAlertRule(name: string): GeneratedRule {
  return {
    type: 'alerting',
    name,
    expr: 'vector(1) > 0',
    for: '2m',
    labels: {},
    description: name,
  };
}

function stubRecordingRule(name: string): GeneratedRule {
  return {
    type: 'recording',
    name,
    expr: 'vector(0)',
    labels: { slo_window: '5m' },
    description: name,
  };
}

function bareGroup(groupName: string, rules: GeneratedRule[]): GeneratedRuleGroup {
  return { groupName, interval: 60, rules, yaml: '' };
}

function buildAdoptableGroups(
  spec: SloSpec,
  sloId: string
): {
  alertGroup: GeneratedRuleGroup;
  recordingGroup: GeneratedRuleGroup;
  fingerprint: string;
} {
  const fingerprint = computeSliFingerprint(spec.datasourceId, spec.sli, spec.objectives[0]);
  if (!fingerprint) {
    throw new Error('fingerprint unexpectedly null for this spec');
  }
  const alertGroupName = `slo:alerts:api-availability_ab1`;
  const alertGroup = annotateAlertGroup(
    bareGroup(alertGroupName, [stubAlertRule('burn-rate')]),
    buildAlertProvenance({
      pluginVersion: '4.0.0',
      sloId,
      workspaceId: WS,
      datasourceId: spec.datasourceId,
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
      spec,
    })
  );
  // Recording groups are NOT annotated — Cortex/Prometheus reject annotations
  // on recording rules. Detector recognizes them by the slo:rec:<fp> name.
  const recordingGroup = bareGroup(dedupRecordingGroupName(fingerprint), [
    stubRecordingRule(`slo:sli_error:ratio_rate_5m:sli_${fingerprint}`),
  ]);
  return { alertGroup, recordingGroup, fingerprint };
}

interface Harness {
  ruler: FakeRulerClient;
  store: jest.Mocked<ISloStore>;
  healthChecker: jest.Mocked<RuleHealthChecker>;
  datasourceService: jest.Mocked<Pick<InMemoryDatasourceService, 'get'>>;
  logger: Logger;
  metrics: ReturnType<typeof createReconcilerMetrics>;
  buildClient: jest.Mock<AlertingOSClient, [Datasource]>;
}

function buildHarness(): Harness {
  const logger = noopLogger();
  return {
    ruler: new FakeRulerClient(),
    store: ({
      list: jest.fn(async () => [] as SloDocument[]),
      get: jest.fn(async () => null),
      save: jest.fn(async () => undefined),
      delete: jest.fn(async () => true),
    } as unknown) as jest.Mocked<ISloStore>,
    healthChecker: ({
      check: jest.fn(),
      invalidate: jest.fn(),
    } as unknown) as jest.Mocked<RuleHealthChecker>,
    datasourceService: ({
      get: jest.fn(async (id: string) => mockDatasource({ id })),
    } as unknown) as jest.Mocked<Pick<InMemoryDatasourceService, 'get'>>,
    logger,
    metrics: createReconcilerMetrics(logger),
    buildClient: jest.fn((_ds: Datasource) => mockClient()),
  };
}

function makeReconciler(
  h: Harness,
  opts: {
    tombstoneStore?: SloTombstoneReaderLite;
    tombstoneTtlMs?: number;
    now?: () => Date;
  } = {}
) {
  return createSloReconciler({
    store: h.store,
    ruler: h.ruler,
    healthChecker: h.healthChecker,
    datasourceService: (h.datasourceService as unknown) as InMemoryDatasourceService,
    logger: h.logger,
    metrics: h.metrics,
    buildClient: h.buildClient,
    tombstoneStore: opts.tombstoneStore,
    tombstoneTtlMs: opts.tombstoneTtlMs,
    now: opts.now,
  });
}

describe('SloReconciler — Phase 4 orphan categorization', () => {
  it('end-to-end sweep: adoptable orphan surfaces with full metadata; metric bumped', async () => {
    const h = buildHarness();
    // One datasource, no live SLO — rule groups on the ruler are entirely
    // orphan from the SO-inventory perspective.
    h.datasourceService.get.mockImplementation(async (id: string) => mockDatasource({ id }));
    const spec = validSpec();
    const { alertGroup, recordingGroup, fingerprint } = buildAdoptableGroups(spec, 'slo-adopted');
    h.ruler.seedGroup(NS, alertGroup);
    h.ruler.seedGroup(NS, recordingGroup);

    const reconciler = makeReconciler(h);
    const result = await reconciler.reconcileOnce({ datasourceIds: [DS] });

    expect(result.adoptableOrphans).toHaveLength(1);
    const entry = result.adoptableOrphans[0];
    expect(entry.groupName).toBe(alertGroup.groupName);
    expect(entry.sourceSloId).toBe('slo-adopted');
    expect(entry.sourceWorkspaceId).toBe(WS);
    expect(entry.specIntegrity).toBe('ok');
    expect(entry.schemaVersion).toBe(1);
    expect(entry.fingerprints).toEqual([fingerprint]);
    // Paired recording group is suppressed.
    expect(result.unknownOrphans).toHaveLength(0);
    // Tombstone store not wired → field left undefined.
    expect(entry.tombstoned).toBeUndefined();

    // Metrics bumps: `orphans` counts total; adoptable/unknown split tracks
    // the new Phase 4 categories.
    const snap = h.metrics.snapshot();
    expect(snap.adoptableOrphans).toBe(1);
    expect(snap.unknownOrphans).toBe(0);
    expect(snap.orphans).toBe(1);
  });

  it('tombstone present + unexpired → entry.tombstoned === true, tombstoneCreatedAt populated', async () => {
    const h = buildHarness();
    h.datasourceService.get.mockImplementation(async (id: string) => mockDatasource({ id }));
    const spec = validSpec();
    const { alertGroup, recordingGroup } = buildAdoptableGroups(spec, 'slo-tombstoned');
    h.ruler.seedGroup(NS, alertGroup);
    h.ruler.seedGroup(NS, recordingGroup);

    const createdAt = '2026-04-20T00:00:00.000Z';
    const tombstoneStore: SloTombstoneReaderLite = {
      get: jest.fn(async (sloId: string) => (sloId === 'slo-tombstoned' ? { createdAt } : null)),
    };
    const reconciler = makeReconciler(h, {
      tombstoneStore,
      // Sweep time: 5 days after creation, TTL: 30 days → unexpired.
      now: () => new Date('2026-04-25T00:00:00.000Z'),
    });

    const result = await reconciler.reconcileOnce({ datasourceIds: [DS] });

    expect(result.adoptableOrphans).toHaveLength(1);
    expect(result.adoptableOrphans[0].tombstoned).toBe(true);
    expect(result.adoptableOrphans[0].tombstoneCreatedAt).toBe(createdAt);
    expect(tombstoneStore.get).toHaveBeenCalledWith('slo-tombstoned');
  });

  it('tombstone present + expired → entry.tombstoned === false, no tombstoneCreatedAt', async () => {
    const h = buildHarness();
    h.datasourceService.get.mockImplementation(async (id: string) => mockDatasource({ id }));
    const spec = validSpec();
    const { alertGroup, recordingGroup } = buildAdoptableGroups(spec, 'slo-expired');
    h.ruler.seedGroup(NS, alertGroup);
    h.ruler.seedGroup(NS, recordingGroup);

    const tombstoneStore: SloTombstoneReaderLite = {
      get: jest.fn(async () => ({ createdAt: '2026-01-01T00:00:00.000Z' })),
    };
    const reconciler = makeReconciler(h, {
      tombstoneStore,
      tombstoneTtlMs: 7 * 24 * 60 * 60_000, // 7 days
      now: () => new Date('2026-04-25T00:00:00.000Z'), // ~4 months later
    });

    const result = await reconciler.reconcileOnce({ datasourceIds: [DS] });

    expect(result.adoptableOrphans).toHaveLength(1);
    expect(result.adoptableOrphans[0].tombstoned).toBe(false);
    expect(result.adoptableOrphans[0].tombstoneCreatedAt).toBeUndefined();
  });

  it('tombstone store throws → tombstoned === undefined; sweep continues; error counter NOT bumped', async () => {
    const h = buildHarness();
    const logger = noopLogger();
    // Swap in a logger we can assert on — the reconciler warn-logs tombstone
    // failures rather than treating them as sweep errors.
    h.logger = logger;
    h.metrics = createReconcilerMetrics(logger);

    h.datasourceService.get.mockImplementation(async (id: string) => mockDatasource({ id }));
    const spec = validSpec();
    const { alertGroup, recordingGroup } = buildAdoptableGroups(spec, 'slo-broken-tombstone');
    h.ruler.seedGroup(NS, alertGroup);
    h.ruler.seedGroup(NS, recordingGroup);

    const tombstoneStore: SloTombstoneReaderLite = {
      get: jest.fn(async () => {
        throw new Error('tombstone SO index unavailable');
      }),
    };
    const reconciler = makeReconciler(h, { tombstoneStore });

    const result = await reconciler.reconcileOnce({ datasourceIds: [DS] });

    expect(result.adoptableOrphans).toHaveLength(1);
    expect(result.adoptableOrphans[0].tombstoned).toBeUndefined();
    // Sweep itself succeeded — `errors` should stay empty.
    expect(result.errors).toHaveLength(0);
    expect(h.metrics.snapshot().errors).toBe(0);
    // Failure logged at warn.
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('tombstone lookup failed for slo=slo-broken-tombstone')
    );
  });

  it('tombstone store not wired → every orphan entry has tombstoned === undefined', async () => {
    const h = buildHarness();
    h.datasourceService.get.mockImplementation(async (id: string) => mockDatasource({ id }));
    const spec = validSpec();
    const { alertGroup, recordingGroup } = buildAdoptableGroups(spec, 'slo-no-tombstone-store');
    h.ruler.seedGroup(NS, alertGroup);
    h.ruler.seedGroup(NS, recordingGroup);

    // Also seed a no-provenance orphan so we exercise the unknownOrphans
    // enrichment branch too.
    h.ruler.seedGroup(NS, bareGroup('slo:legacy_ab1', [stubAlertRule('burn-rate-no-provenance')]));

    const reconciler = makeReconciler(h);
    const result = await reconciler.reconcileOnce({ datasourceIds: [DS] });

    expect(result.adoptableOrphans).toHaveLength(1);
    expect(result.adoptableOrphans[0].tombstoned).toBeUndefined();
    expect(result.unknownOrphans).toHaveLength(1);
    expect(result.unknownOrphans[0].tombstoned).toBeUndefined();

    // Both counters bumped: 1 adoptable + 1 unknown.
    const snap = h.metrics.snapshot();
    expect(snap.adoptableOrphans).toBe(1);
    expect(snap.unknownOrphans).toBe(1);
    expect(snap.orphans).toBe(2);
  });

  it('orphans with no sourceSloId (legacy layout) skip the tombstone lookup', async () => {
    const h = buildHarness();
    h.datasourceService.get.mockImplementation(async (id: string) => mockDatasource({ id }));
    h.ruler.seedGroup(NS, bareGroup('slo:legacy_ab1', [stubAlertRule('burn-rate-no-provenance')]));

    const tombstoneStore: SloTombstoneReaderLite = {
      get: jest.fn(async () => null),
    };
    const reconciler = makeReconciler(h, { tombstoneStore });

    const result = await reconciler.reconcileOnce({ datasourceIds: [DS] });

    expect(result.unknownOrphans).toHaveLength(1);
    expect(result.unknownOrphans[0].sourceSloId).toBeUndefined();
    expect(result.unknownOrphans[0].tombstoned).toBeUndefined();
    // The store wasn't consulted because we have no sloId to key on.
    expect(tombstoneStore.get).not.toHaveBeenCalled();
  });
});
