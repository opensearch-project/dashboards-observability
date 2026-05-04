/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MultiBackendAlertService } from '../alert_service';
import type { Datasource, Logger } from '../../../../common/types/alerting/types';

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
  getAlerts: jest.fn(async () => ({ alerts: [], totalAlerts: 0 })),
  acknowledgeAlerts: jest.fn(),
  getDestinations: jest.fn(async () => []),
  searchQuery: jest.fn(),
  runMonitor: jest.fn(),
};

const mockPromBackend = {
  type: 'prometheus' as const,
  getRuleGroups: jest.fn(async () => []),
  getAlerts: jest.fn(async () => []),
  listWorkspaces: jest.fn(async () => []),
};

let svc: MultiBackendAlertService;

beforeEach(() => {
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
    mockOsBackend.getAlerts.mockResolvedValueOnce({ alerts: [], totalAlerts: 0 });
    const resolver = jest.fn(async () => ({} as never));
    const response = await svc.getUnifiedAlerts(resolver);
    expect(response.totalDatasources).toBe(1);
  });

  // ---- concurrency isolation ----
  /**
   * Guards against the regressed "shared singleton + setDatasourceService"
   * pattern that leaked SavedObjects clients across concurrent requests.
   *
   * **What this test proves:** two freshly-constructed `MultiBackendAlertService`
   * instances, when driven concurrently via `Promise.all`, each resolve
   * datasources from their own `datasourceService` mock and never cross over.
   *
   * **What this test does NOT prove (acknowledged limitation):** because
   * `datasourceService` is stored in a `private readonly` field, this is
   * true by construction — the test would pass even if `setDatasourceService`
   * were still present and the route layer shared a single instance, as long
   * as callers constructed fresh services themselves. The second assertion
   * (the `@ts-expect-error` below) is therefore the real regression guard:
   * it will fail to compile if someone re-introduces the setter.
   */
  it('has no setDatasourceService setter — the regression guard', () => {
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
    // Compile-time assertion: `setDatasourceService` must not exist on the
    // type. Re-adding it resurrects the cross-tenant SavedObjects-client
    // leak. The `@ts-expect-error` below will fail to compile if the setter
    // comes back, catching the regression at tsc time (well before any
    // runtime test could).
    // @ts-expect-error setDatasourceService was intentionally removed
    const setter = instance.setDatasourceService;
    expect(setter).toBeUndefined();
  });

  it('separate instances cannot observe each other’s datasources under concurrent awaits', async () => {
    const dsA: Datasource = { id: 'ds-a', name: 'A', type: 'opensearch', url: '', enabled: true };
    const dsB: Datasource = { id: 'ds-b', name: 'B', type: 'opensearch', url: '', enabled: true };

    const makeDsSvc = (list: Datasource[]) => ({
      list: jest.fn(async () => list),
      get: jest.fn(async (id: string) => list.find((d) => d.id === id) ?? null),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      testConnection: jest.fn(),
      seed: jest.fn(),
    });

    const osBackend = {
      getMonitors: jest.fn(async () => []),
      getMonitor: jest.fn(),
      createMonitor: jest.fn(),
      updateMonitor: jest.fn(),
      deleteMonitor: jest.fn(),
      getAlerts: jest.fn(async () => ({ alerts: [], totalAlerts: 0 })),
      acknowledgeAlerts: jest.fn(),
      getDestinations: jest.fn(async () => []),
      searchQuery: jest.fn(),
    };

    const dsSvcA = makeDsSvc([dsA]);
    const dsSvcB = makeDsSvc([dsB]);

    const svcA = new MultiBackendAlertService(dsSvcA, mockLogger);
    svcA.registerOpenSearch(osBackend as never);
    const svcB = new MultiBackendAlertService(dsSvcB, mockLogger);
    svcB.registerOpenSearch(osBackend as never);

    // Interleave: kick off A, then B; each resolves against its own ds list.
    const resolver = jest.fn(async () => ({} as never));
    const [respA, respB] = await Promise.all([
      svcA.getUnifiedAlerts(resolver),
      svcB.getUnifiedAlerts(resolver),
    ]);

    expect(respA.totalDatasources).toBe(1);
    expect(respB.totalDatasources).toBe(1);
    expect(dsSvcA.list).toHaveBeenCalled();
    expect(dsSvcB.list).toHaveBeenCalled();
    // Request A must never have reached into request B's datasource service.
    await expect(dsSvcA.list.mock.results[0].value).resolves.toEqual([dsA]);
    await expect(dsSvcB.list.mock.results[0].value).resolves.toEqual([dsB]);
  });
});
