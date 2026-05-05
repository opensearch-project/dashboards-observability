/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MultiBackendAlertService } from '../alert_service';
import type { Datasource, Logger } from '../../../../common/types/alerting/types';
import {
  sampleOSMonitor,
  sampleOSAlert,
  sampleOSDestination,
} from '../../../../common/services/alerting/__tests__/fixtures';

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

const mockClient = {} as never;
let svc: MultiBackendAlertService;

beforeEach(() => {
  svc = new MultiBackendAlertService(mockDsSvc as never, mockLogger);
  svc.registerOpenSearch(mockOsBackend as never);
  svc.registerPrometheus(mockPromBackend as never);
});

describe('MultiBackendAlertService — mutations + detail', () => {
  // ---- createOSMonitor ----
  it('createOSMonitor delegates to OS backend', async () => {
    mockOsBackend.createMonitor.mockResolvedValueOnce({ ...sampleOSMonitor, id: 'new-1' });
    const result = await svc.createOSMonitor(mockClient, 'ds-os', sampleOSMonitor as never);
    expect(mockOsBackend.createMonitor).toHaveBeenCalledWith(mockClient, sampleOSMonitor);
    expect(result.id).toBe('new-1');
  });

  it('createOSMonitor throws for unknown dsId', async () => {
    await expect(
      svc.createOSMonitor(mockClient, 'unknown', sampleOSMonitor as never)
    ).rejects.toThrow(/not found/);
  });

  // ---- updateOSMonitor ----
  it('updateOSMonitor delegates partial update', async () => {
    mockOsBackend.updateMonitor.mockResolvedValueOnce({ ...sampleOSMonitor, name: 'updated' });
    const result = await svc.updateOSMonitor(mockClient, 'ds-os', 'mon-1', { name: 'updated' });
    expect(mockOsBackend.updateMonitor).toHaveBeenCalledWith(mockClient, 'mon-1', {
      name: 'updated',
    });
    expect(result?.name).toBe('updated');
  });

  // ---- deleteOSMonitor ----
  it('deleteOSMonitor returns true on success', async () => {
    mockOsBackend.deleteMonitor.mockResolvedValueOnce(true);
    expect(await svc.deleteOSMonitor(mockClient, 'ds-os', 'mon-1')).toBe(true);
  });

  it('deleteOSMonitor returns false when not found', async () => {
    mockOsBackend.deleteMonitor.mockResolvedValueOnce(false);
    expect(await svc.deleteOSMonitor(mockClient, 'ds-os', 'nope')).toBe(false);
  });

  // ---- acknowledgeOSAlerts ----
  it('acknowledgeOSAlerts delegates to backend', async () => {
    mockOsBackend.acknowledgeAlerts.mockResolvedValueOnce({ success: true });
    const result = await svc.acknowledgeOSAlerts(mockClient, 'ds-os', 'mon-1', ['a1', 'a2']);
    expect(mockOsBackend.acknowledgeAlerts).toHaveBeenCalledWith(mockClient, 'mon-1', ['a1', 'a2']);
    expect(result).toEqual({ success: true });
  });

  // ---- getRuleDetail ----
  it('getRuleDetail returns null for unknown datasource', async () => {
    expect(await svc.getRuleDetail(mockClient, 'unknown', 'r1')).toBeNull();
  });

  it('getRuleDetail returns enriched OS rule with alertHistory', async () => {
    mockOsBackend.getMonitor.mockResolvedValueOnce(sampleOSMonitor);
    mockOsBackend.getAlerts.mockResolvedValueOnce({ alerts: [sampleOSAlert], totalAlerts: 1 });
    mockOsBackend.getDestinations.mockResolvedValueOnce([sampleOSDestination]);
    mockOsBackend.searchQuery.mockResolvedValueOnce({
      aggregations: { time_buckets: { buckets: [] } },
    });
    const result = await svc.getRuleDetail(mockClient, 'ds-os', sampleOSMonitor.id);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(sampleOSMonitor.id);
    expect(result!.raw).toBeDefined();
    expect(Array.isArray(result!.alertHistory)).toBe(true);
  });

  // ---- getAlertDetail ----
  it('getAlertDetail returns null for unknown datasource', async () => {
    expect(await svc.getAlertDetail(mockClient, 'unknown', 'a1')).toBeNull();
  });

  it('getAlertDetail returns OS alert with raw field', async () => {
    mockOsBackend.getAlerts.mockResolvedValueOnce({ alerts: [sampleOSAlert], totalAlerts: 1 });
    const result = await svc.getAlertDetail(mockClient, 'ds-os', sampleOSAlert.id);
    expect(result).not.toBeNull();
    expect(result!.raw).toBe(sampleOSAlert);
  });
});
