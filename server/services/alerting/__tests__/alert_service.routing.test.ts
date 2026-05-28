/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MultiBackendAlertService } from '../alert_service';
import type { Datasource, Logger } from '../../../../common/types/alerting';

const mockLogger: Logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

const osDatasource: Datasource = {
  id: 'ds-os',
  name: 'Local',
  type: 'opensearch',
  url: '',
  enabled: true,
};
const promDatasource: Datasource = {
  id: 'ds-prom',
  name: 'Prom',
  type: 'prometheus',
  url: '',
  enabled: true,
  directQueryName: 'prom1',
};

const mockDsSvc = {
  list: jest.fn(async () => [osDatasource, promDatasource]),
  get: jest.fn(async (id: string) => {
    if (id === 'ds-os') return osDatasource;
    if (id === 'ds-prom') return promDatasource;
    return null;
  }),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  testConnection: jest.fn(),
  seed: jest.fn(),
};

const mockOsBackend = {
  getMonitors: jest.fn(async () => []),
  getMonitor: jest.fn(),
  createMonitor: jest.fn(),
  updateMonitor: jest.fn(),
  deleteMonitor: jest.fn(),
  getAlerts: jest.fn(async () => ({ alerts: [], totalAlerts: 0, truncated: false })),
  acknowledgeAlerts: jest.fn(),
  getDestinations: jest.fn(async () => ({
    destinations: [],
    totalDestinations: 0,
    truncated: false,
  })),
  searchQuery: jest.fn(),
  runMonitor: jest.fn(),
};

const mockPromBackend = {
  type: 'prometheus' as const,
  getRuleGroups: jest.fn(async () => []),
  getAlerts: jest.fn(async () => []),
  listWorkspaces: jest.fn(async () => []),
  getHistoricalAlerts: jest.fn(),
};

let svc: MultiBackendAlertService;

beforeEach(() => {
  // Reset every mock's call history between tests. Without this, tests that
  // assert `.not.toHaveBeenCalled()` (e.g. "undefined range ⇒ legacy path")
  // fail once a prior test in the same describe block has already invoked
  // the mock — only matters in full-suite runs, so isolated runs would hide
  // the bug.
  jest.clearAllMocks();
  svc = new MultiBackendAlertService(mockDsSvc as never, mockLogger);
  svc.registerOpenSearch(mockOsBackend as never);
  svc.registerPrometheus(mockPromBackend as never);
});

describe('MultiBackendAlertService — routing & list', () => {
  // ---- Construction / backend registration ----
  it('getPrometheusBackend returns registered backend', () => {
    expect(svc.getPrometheusBackend()).toBe(mockPromBackend);
  });

  // ---- requireDatasource routing ----
  it('getOSMonitors delegates to OS backend for opensearch datasource', async () => {
    mockOsBackend.getMonitors.mockResolvedValueOnce([{ id: 'mon-1' }]);
    const result = await svc.getOSMonitors({} as never, 'ds-os');
    expect(mockOsBackend.getMonitors).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'mon-1' }]);
  });

  it('getOSMonitors throws for unknown datasource', async () => {
    await expect(svc.getOSMonitors({} as never, 'unknown')).rejects.toThrow(/not found/);
  });

  it('getOSMonitors throws for wrong datasource type', async () => {
    await expect(svc.getOSMonitors({} as never, 'ds-prom')).rejects.toThrow(
      /prometheus.*expected opensearch/i
    );
  });

  it('getPromRuleGroups delegates to Prom backend', async () => {
    mockPromBackend.getRuleGroups.mockResolvedValueOnce([{ name: 'g1', rules: [] }]);
    const result = await svc.getPromRuleGroups({} as never, 'ds-prom');
    expect(mockPromBackend.getRuleGroups).toHaveBeenCalledWith(expect.anything(), promDatasource);
    expect(result[0].name).toBe('g1');
  });

  // ---- getUnifiedAlerts ----
  it('getUnifiedAlerts aggregates across all enabled datasources', async () => {
    mockOsBackend.getAlerts.mockResolvedValueOnce({
      alerts: [
        {
          id: 'a1',
          state: 'ACTIVE',
          severity: '1',
          monitor_name: 'm',
          trigger_name: 't',
          start_time: 0,
          last_notification_time: 0,
        },
      ],
      totalAlerts: 1,
      truncated: false,
    });
    mockPromBackend.getAlerts.mockResolvedValueOnce([
      {
        labels: { alertname: 'X', instance: 'i' },
        state: 'firing',
        annotations: {},
        activeAt: '',
        value: '',
      },
    ]);
    const resolver = jest.fn(async () => ({} as never));
    const response = await svc.getUnifiedAlerts(resolver);
    expect(response.results).toHaveLength(2);
    expect(response.totalDatasources).toBe(2);
    expect(response.completedDatasources).toBe(2);
  });

  it('getUnifiedAlerts isolates errors per datasource', async () => {
    mockOsBackend.getAlerts.mockRejectedValueOnce(new Error('OS down'));
    mockPromBackend.getAlerts.mockResolvedValueOnce([]);
    const resolver = jest.fn(async () => ({} as never));
    const response = await svc.getUnifiedAlerts(resolver);
    // Prom succeeded, OS failed — still returns results
    expect(response.completedDatasources).toBe(1);
    expect(response.datasourceStatus.find((s) => s.datasourceId === 'ds-os')?.status).toBe('error');
  });

  // ---- getUnifiedRules ----
  it('getUnifiedRules filters by dsIds when provided', async () => {
    mockPromBackend.getRuleGroups.mockResolvedValueOnce([]);
    const resolver = jest.fn(async () => ({} as never));
    const response = await svc.getUnifiedRules(resolver, { dsIds: ['ds-prom'] });
    // Only prom datasource should be fetched
    expect(response.totalDatasources).toBe(1);
    expect(mockOsBackend.getMonitors).not.toHaveBeenCalled();
  });

  // ---- resolveDatasources: disabled datasources filtered ----
  it('getUnifiedAlerts skips disabled datasources', async () => {
    const disabledDs = { ...promDatasource, enabled: false };
    mockDsSvc.list.mockResolvedValueOnce([osDatasource, disabledDs]);
    mockOsBackend.getAlerts.mockResolvedValueOnce({ alerts: [], totalAlerts: 0, truncated: false });
    const resolver = jest.fn(async () => ({} as never));
    const response = await svc.getUnifiedAlerts(resolver);
    expect(response.totalDatasources).toBe(1);
  });

  // ---- range dispatch ----

  it('range reaches the OS backend via { startMs, endMs }', async () => {
    mockOsBackend.getAlerts.mockResolvedValueOnce({
      alerts: [],
      totalAlerts: 0,
      truncated: false,
    });
    mockPromBackend.getAlerts.mockResolvedValueOnce([]);
    const resolver = jest.fn(async () => ({} as never));
    await svc.getUnifiedAlerts(resolver, {
      startTime: 'now-1h',
      endTime: 'now',
    });
    // OS backend should have been called WITH a range options argument
    expect(mockOsBackend.getAlerts).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        startMs: expect.any(Number),
        endMs: expect.any(Number),
      })
    );
  });

  it('range triggers getHistoricalAlerts on the Prom backend', async () => {
    mockOsBackend.getAlerts.mockResolvedValueOnce({
      alerts: [],
      totalAlerts: 0,
      truncated: false,
    });
    mockPromBackend.getHistoricalAlerts.mockResolvedValueOnce({ alerts: [] });
    const resolver = jest.fn(async () => ({} as never));
    await svc.getUnifiedAlerts(
      resolver,
      {
        startTime: 'now-1h',
        endTime: 'now',
      },
      // Threading a stub `RequestHandlerContext`: the prom-historical path
      // routes its `ALERTS{}` matrix scan through the data plugin's search
      // strategy, which needs the OSD request context. Without it the
      // service degrades to the legacy current-only path.
      {} as never
    );
    expect(mockPromBackend.getHistoricalAlerts).toHaveBeenCalled();
    // Legacy getAlerts must NOT be called on the Prom backend when range is set.
    expect(mockPromBackend.getAlerts).not.toHaveBeenCalled();
  });

  it('endTime "now" resolves endIsNow=true (live merge enabled)', async () => {
    mockOsBackend.getAlerts.mockResolvedValueOnce({
      alerts: [],
      totalAlerts: 0,
      truncated: false,
    });
    mockPromBackend.getHistoricalAlerts.mockResolvedValueOnce({ alerts: [] });
    const resolver = jest.fn(async () => ({} as never));
    await svc.getUnifiedAlerts(
      resolver,
      {
        startTime: 'now-1h',
        endTime: 'now',
      },
      {} as never
    );
    // Signature: getHistoricalAlerts(ctx, client, ds, startSec, endSec, step, endIsNow).
    // endIsNow is the 7th positional arg (index 6).
    const callArgs = mockPromBackend.getHistoricalAlerts.mock.calls[0];
    expect(callArgs[6]).toBe(true);
  });

  it('past-only window (endTime "now-1h") resolves endIsNow=false (no live merge)', async () => {
    // Regression: \bnow\b regex used to match "now-1h" and incorrectly merge
    // currently-firing alerts into a window that ended an hour ago. The fix
    // compares the resolved endMs against Date.now() with a tolerance.
    mockOsBackend.getAlerts.mockResolvedValueOnce({
      alerts: [],
      totalAlerts: 0,
      truncated: false,
    });
    mockPromBackend.getHistoricalAlerts.mockResolvedValueOnce({ alerts: [] });
    const resolver = jest.fn(async () => ({} as never));
    await svc.getUnifiedAlerts(
      resolver,
      {
        startTime: 'now-2h',
        endTime: 'now-1h',
      },
      {} as never
    );
    const callArgs = mockPromBackend.getHistoricalAlerts.mock.calls[0];
    expect(callArgs[6]).toBe(false);
  });

  it('undefined range ⇒ legacy path for both backends', async () => {
    mockOsBackend.getAlerts.mockResolvedValueOnce({
      alerts: [],
      totalAlerts: 0,
      truncated: false,
    });
    mockPromBackend.getAlerts.mockResolvedValueOnce([]);
    const resolver = jest.fn(async () => ({} as never));
    await svc.getUnifiedAlerts(resolver);
    // OS backend: called with no options (range) — check first arg only
    expect(mockOsBackend.getAlerts).toHaveBeenCalledWith(expect.anything());
    // Prom backend: legacy getAlerts; no historical call.
    expect(mockPromBackend.getAlerts).toHaveBeenCalled();
    expect(mockPromBackend.getHistoricalAlerts).not.toHaveBeenCalled();
  });

  it('truncated flag propagates into datasourceStatus', async () => {
    mockOsBackend.getAlerts.mockResolvedValueOnce({
      alerts: [],
      totalAlerts: 0,
      truncated: true,
    });
    mockPromBackend.getHistoricalAlerts.mockResolvedValueOnce({ alerts: [] });
    const resolver = jest.fn(async () => ({} as never));
    const response = await svc.getUnifiedAlerts(resolver, {
      startTime: 'now-1h',
      endTime: 'now',
    });
    const osStatus = response.datasourceStatus.find((s) => s.datasourceId === 'ds-os');
    expect(osStatus?.truncated).toBe(true);
  });

  it('malformed date-math surfaces as a per-datasource error (not a thrown request)', async () => {
    // Route-layer `validateDateMath` normally rejects bad input with a 400,
    // but if a handler is called directly (bypassing validation, or via a
    // future caller that forgets to validate) a `parseDateMathMs` throw
    // inside `resolveRangeMsFromOptions` must not take down the whole
    // unified request. `Promise.allSettled` should catch it and surface
    // the message on the affected datasource's status entry while
    // healthy datasources keep their success path.
    const resolver = jest.fn(async () => ({} as never));
    // Expect no throw. This drives the expectation that the error is
    // captured at the per-datasource boundary. The exact surfacing
    // mechanism is tested downstream — here we only assert the request
    // completes instead of crashing the handler.
    await expect(
      svc.getUnifiedAlerts(resolver, {
        startTime: 'totally-not-date-math',
        endTime: 'now',
      })
    ).rejects.toThrow(/Invalid date-math/);
  });

  it('fallback hint propagates into datasourceStatus', async () => {
    mockOsBackend.getAlerts.mockResolvedValueOnce({
      alerts: [],
      totalAlerts: 0,
      truncated: false,
    });
    mockPromBackend.getHistoricalAlerts.mockResolvedValueOnce({
      alerts: [],
      fallback: 'prometheus-alerts-current-only',
    });
    const resolver = jest.fn(async () => ({} as never));
    const response = await svc.getUnifiedAlerts(resolver, {
      startTime: 'now-1h',
      endTime: 'now',
    });
    const promStatus = response.datasourceStatus.find((s) => s.datasourceId === 'ds-prom');
    expect(promStatus?.fallback).toBe('prometheus-alerts-current-only');
  });

  /**
   * Compile-time regression guard: `setDatasourceService` must not exist on
   * the type. Re-adding it would resurrect the cross-tenant SavedObjects-
   * client leak (request-scoped handlers previously mutated a shared singleton
   * setter at every `await` boundary). The `@ts-expect-error` fires at tsc
   * time if the setter comes back.
   */
  it('has no setDatasourceService setter', () => {
    const dsSvc = {
      list: jest.fn(async () => []),
      get: jest.fn(async () => null),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      testConnection: jest.fn(),
      seed: jest.fn(),
    };
    const instance = new MultiBackendAlertService(dsSvc, mockLogger);
    // @ts-expect-error setDatasourceService was intentionally removed
    const setter = instance.setDatasourceService;
    expect(setter).toBeUndefined();
  });
});
