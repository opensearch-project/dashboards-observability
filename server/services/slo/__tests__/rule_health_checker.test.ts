/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * RuleHealthChecker tests.
 *
 * Covers every state transition, cache hit/miss around the TTL boundary,
 * cache-key isolation across (workspace, datasource, slo), and explicit
 * invalidation. Uses a jest.fn-backed RulerClient so call-count assertions
 * directly prove cache behavior.
 */

import { createRuleHealthChecker } from '../rule_health_checker';
import { SloRulerError } from '../../../../common/slo/slo_errors';
import type { AlertingOSClient, Datasource, Logger } from '../../../../common/types/alerting';
import type { GeneratedRuleGroup } from '../../../../common/slo/slo_types';
import type { RulerClient } from '../ruler_client';

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
    transport: {
      request: jest.fn(async () => ({ statusCode: 200, body: {} })),
    },
  } as unknown) as AlertingOSClient;
}

function mockDatasource(overrides: Partial<Datasource> = {}): Datasource {
  return {
    id: 'ds-1',
    name: 'my-cortex',
    type: 'prometheus',
    url: '',
    enabled: true,
    directQueryName: 'my-cortex-connection',
    ...overrides,
  };
}

function mockGroup(groupName: string): GeneratedRuleGroup {
  return {
    groupName,
    interval: 60,
    rules: [],
    yaml: '',
  };
}

/**
 * Build a RulerClient whose upsert/delete are never expected to be called —
 * the checker only touches `getRuleGroup`. The function returned as `impl` is
 * assigned straight to a jest.fn so callers can swap implementations per-test.
 */
function mockRulerClient(): {
  ruler: RulerClient;
  getRuleGroup: jest.Mock<Promise<GeneratedRuleGroup | null>, unknown[]>;
} {
  const getRuleGroup = jest.fn<Promise<GeneratedRuleGroup | null>, unknown[]>(async () => null);
  const ruler = ({
    upsertRuleGroup: jest.fn(async () => undefined),
    deleteRuleGroup: jest.fn(async () => undefined),
    getRuleGroup,
  } as unknown) as RulerClient;
  return { ruler, getRuleGroup };
}

describe('RuleHealthChecker — state transitions', () => {
  const datasource = mockDatasource();
  const client = mockClient();
  const namespace = 'slo-generated-ws1';

  it('returns state="ok" when every expected group is present', async () => {
    const { ruler, getRuleGroup } = mockRulerClient();
    getRuleGroup.mockImplementation(async (_c, _d, _ns, groupName: string) =>
      mockGroup(groupName as string)
    );
    const checker = createRuleHealthChecker(ruler, noopLogger());

    const report = await checker.check({
      workspaceId: 'ws1',
      datasource,
      client,
      sloId: 'slo-1',
      namespace,
      expectedGroups: ['g1', 'g2'],
    });

    expect(report.state).toBe('ok');
    expect(report.presentGroups).toEqual(['g1', 'g2']);
    expect(report.missingGroups).toEqual([]);
    expect(report.expectedGroups).toEqual(['g1', 'g2']);
    expect(report.rulerErrorCode).toBeUndefined();
    expect(report.computedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(getRuleGroup).toHaveBeenCalledTimes(2);
  });

  it('returns state="rules_missing" when every expected group is absent', async () => {
    const { ruler, getRuleGroup } = mockRulerClient();
    getRuleGroup.mockResolvedValue(null);
    const checker = createRuleHealthChecker(ruler, noopLogger());

    const report = await checker.check({
      workspaceId: 'ws1',
      datasource,
      client,
      sloId: 'slo-1',
      namespace,
      expectedGroups: ['g1', 'g2'],
    });

    expect(report.state).toBe('rules_missing');
    expect(report.presentGroups).toEqual([]);
    expect(report.missingGroups).toEqual(['g1', 'g2']);
  });

  it('returns state="rules_partial" when one is present and one is missing', async () => {
    const { ruler, getRuleGroup } = mockRulerClient();
    getRuleGroup.mockImplementation(async (_c, _d, _ns, groupName: string) =>
      groupName === 'g1' ? mockGroup('g1') : null
    );
    const checker = createRuleHealthChecker(ruler, noopLogger());

    const report = await checker.check({
      workspaceId: 'ws1',
      datasource,
      client,
      sloId: 'slo-1',
      namespace,
      expectedGroups: ['g1', 'g2'],
    });

    expect(report.state).toBe('rules_partial');
    expect(report.presentGroups).toEqual(['g1']);
    expect(report.missingGroups).toEqual(['g2']);
  });

  it('returns state="ruler_unreachable" with code RULER_UNREACHABLE when probe throws 5xx/network error', async () => {
    const { ruler, getRuleGroup } = mockRulerClient();
    getRuleGroup.mockRejectedValue(new SloRulerError('RULER_UNREACHABLE', 0, 'connection refused'));
    const checker = createRuleHealthChecker(ruler, noopLogger());

    const report = await checker.check({
      workspaceId: 'ws1',
      datasource,
      client,
      sloId: 'slo-1',
      namespace,
      expectedGroups: ['g1', 'g2'],
    });

    expect(report.state).toBe('ruler_unreachable');
    expect(report.rulerErrorCode).toBe('RULER_UNREACHABLE');
    expect(report.expectedGroups).toEqual(['g1', 'g2']);
    expect(report.presentGroups).toEqual([]);
    expect(report.missingGroups).toEqual([]);
    // Probes fan out in parallel: every expected group is dispatched and the
    // aggregate outcome is `ruler_unreachable` because at least one failed.
    expect(getRuleGroup).toHaveBeenCalledTimes(2);
  });

  it('returns state="ruler_unreachable" with code RULER_AUTH_FAILED when probe throws 401/403', async () => {
    const { ruler, getRuleGroup } = mockRulerClient();
    getRuleGroup.mockRejectedValue(new SloRulerError('RULER_AUTH_FAILED', 401, 'unauthorized'));
    const checker = createRuleHealthChecker(ruler, noopLogger());

    const report = await checker.check({
      workspaceId: 'ws1',
      datasource,
      client,
      sloId: 'slo-1',
      namespace,
      expectedGroups: ['g1'],
    });

    expect(report.state).toBe('ruler_unreachable');
    expect(report.rulerErrorCode).toBe('RULER_AUTH_FAILED');
  });
});

describe('RuleHealthChecker — cache behavior', () => {
  const datasource = mockDatasource();
  const client = mockClient();
  const namespace = 'slo-generated-ws1';

  it('serves subsequent check() calls from cache within TTL (no ruler call)', async () => {
    const { ruler, getRuleGroup } = mockRulerClient();
    getRuleGroup.mockResolvedValue(mockGroup('g1'));
    let currentMs = 1_000_000;
    const checker = createRuleHealthChecker(ruler, noopLogger(), {
      ttlMs: 30_000,
      now: () => currentMs,
    });

    const input = {
      workspaceId: 'ws1',
      datasource,
      client,
      sloId: 'slo-1',
      namespace,
      expectedGroups: ['g1'],
    };

    const first = await checker.check(input);
    expect(getRuleGroup).toHaveBeenCalledTimes(1);

    // Advance within TTL window.
    currentMs += 10_000;
    const second = await checker.check(input);
    expect(getRuleGroup).toHaveBeenCalledTimes(1);
    // Identical cached report is returned (same object reference).
    expect(second).toBe(first);
  });

  it('recomputes after the TTL expires', async () => {
    const { ruler, getRuleGroup } = mockRulerClient();
    getRuleGroup.mockResolvedValue(mockGroup('g1'));
    let currentMs = 1_000_000;
    const checker = createRuleHealthChecker(ruler, noopLogger(), {
      ttlMs: 30_000,
      now: () => currentMs,
    });

    const input = {
      workspaceId: 'ws1',
      datasource,
      client,
      sloId: 'slo-1',
      namespace,
      expectedGroups: ['g1'],
    };

    await checker.check(input);
    expect(getRuleGroup).toHaveBeenCalledTimes(1);

    // Advance past the TTL boundary.
    currentMs += 30_001;
    await checker.check(input);
    expect(getRuleGroup).toHaveBeenCalledTimes(2);
  });

  it('isolates cache entries by workspaceId', async () => {
    const { ruler, getRuleGroup } = mockRulerClient();
    getRuleGroup.mockResolvedValue(mockGroup('g1'));
    const checker = createRuleHealthChecker(ruler, noopLogger());

    const base = {
      datasource,
      client,
      sloId: 'slo-1',
      namespace,
      expectedGroups: ['g1'],
    };
    await checker.check({ ...base, workspaceId: 'ws1' });
    await checker.check({ ...base, workspaceId: 'ws2' });

    // Different workspace = different key, so the ruler was hit for each.
    expect(getRuleGroup).toHaveBeenCalledTimes(2);
  });

  it('isolates cache entries by datasource id', async () => {
    const { ruler, getRuleGroup } = mockRulerClient();
    getRuleGroup.mockResolvedValue(mockGroup('g1'));
    const checker = createRuleHealthChecker(ruler, noopLogger());

    const dsA = mockDatasource({ id: 'ds-a' });
    const dsB = mockDatasource({ id: 'ds-b' });
    const base = {
      workspaceId: 'ws1',
      client,
      sloId: 'slo-1',
      namespace,
      expectedGroups: ['g1'],
    };

    await checker.check({ ...base, datasource: dsA });
    await checker.check({ ...base, datasource: dsB });

    expect(getRuleGroup).toHaveBeenCalledTimes(2);
  });

  it('invalidate() drops only the targeted key', async () => {
    const { ruler, getRuleGroup } = mockRulerClient();
    getRuleGroup.mockResolvedValue(mockGroup('g1'));
    let currentMs = 1_000_000;
    const checker = createRuleHealthChecker(ruler, noopLogger(), {
      ttlMs: 30_000,
      now: () => currentMs,
    });

    const baseFor = (sloId: string) => ({
      workspaceId: 'ws1',
      datasource,
      client,
      sloId,
      namespace,
      expectedGroups: ['g1'],
    });

    // Prime cache for two different SLOs.
    await checker.check(baseFor('slo-a'));
    await checker.check(baseFor('slo-b'));
    expect(getRuleGroup).toHaveBeenCalledTimes(2);

    // Invalidate only slo-a. Advance time a bit but stay within TTL so the
    // un-invalidated entry would still serve from cache.
    currentMs += 1_000;
    checker.invalidate('ws1', 'ds-1', 'slo-a');

    await checker.check(baseFor('slo-a'));
    expect(getRuleGroup).toHaveBeenCalledTimes(3); // recomputed

    await checker.check(baseFor('slo-b'));
    expect(getRuleGroup).toHaveBeenCalledTimes(3); // still cached
  });

  it('invalidate() on a key that was never cached is a no-op', async () => {
    const { ruler } = mockRulerClient();
    const checker = createRuleHealthChecker(ruler, noopLogger());
    expect(() => checker.invalidate('ws1', 'ds-1', 'never-cached')).not.toThrow();
  });
});
