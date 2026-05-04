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
