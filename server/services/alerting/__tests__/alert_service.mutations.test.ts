/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MultiBackendAlertService } from '../alert_service';
import type { Datasource, Logger } from '../../../../common/types/alerting';
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
};

const mockClient = {} as never;
let svc: MultiBackendAlertService;

beforeEach(() => {
  jest.clearAllMocks();
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
    mockOsBackend.getDestinations.mockResolvedValueOnce({
      destinations: [sampleOSDestination],
      totalDestinations: 1,
      truncated: false,
    });
    mockOsBackend.searchQuery.mockResolvedValueOnce({
      aggregations: { time_buckets: { buckets: [] } },
    });
    const result = await svc.getRuleDetail(mockClient, 'ds-os', sampleOSMonitor.id);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(sampleOSMonitor.id);
    expect(result!.raw).toBeDefined();
    expect(Array.isArray(result!.alertHistory)).toBe(true);
  });

  it('getRuleDetail bounds the alert history with limit + start_time desc sort', async () => {
    mockOsBackend.getMonitor.mockResolvedValueOnce(sampleOSMonitor);
    mockOsBackend.getAlerts.mockResolvedValueOnce({ alerts: [], totalAlerts: 0, truncated: false });
    mockOsBackend.searchQuery.mockResolvedValueOnce({
      aggregations: { time_buckets: { buckets: [] } },
    });
    await svc.getRuleDetail(mockClient, 'ds-os', sampleOSMonitor.id);
    expect(mockOsBackend.getAlerts).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({
        monitorId: sampleOSMonitor.id,
        limit: 20,
        sortString: 'start_time',
        sortOrder: 'desc',
      })
    );
  });

  it('getRuleDetail uses the detector hint to skip monitor and forecaster probes', async () => {
    const transportRequest = jest.fn(async () => ({
      body: {
        _id: 'detector-1',
        anomaly_detector: {
          name: 'flight detector',
          indices: ['flights'],
          time_field: 'timestamp',
          detector_type: 'SINGLE_ENTITY',
          last_update_time: Date.UTC(2026, 5, 4, 12, 0, 0),
          detection_interval: { period: { interval: 1, unit: 'Minutes' } },
          window_delay: { period: { interval: 0, unit: 'Seconds' } },
          feature_attributes: [
            {
              feature_id: 'feature-1',
              feature_name: 'delay_sum',
              feature_enabled: true,
              aggregation_query: { delay_sum: { sum: { field: 'FlightDelayMin' } } },
            },
          ],
        },
      },
    }));
    const client = { transport: { request: transportRequest } } as never;

    const result = await svc.getRuleDetail(client, 'ds-os', 'detector-1', undefined, 'detector');

    expect(mockOsBackend.getMonitor).not.toHaveBeenCalled();
    expect(result?.definitionType).toBe('detector');
    expect(result?.name).toBe('flight detector');
    expect(transportRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/_plugins/_anomaly_detection/detectors/detector-1',
      })
    );
  });

  it('getRuleDetail uses the forecaster hint to skip monitor and detector probes', async () => {
    const transportRequest = jest.fn(async () => ({
      body: {
        _id: 'forecaster-1',
        forecaster: {
          name: 'cpu forecaster',
          indices: ['metrics'],
          time_field: '@timestamp',
          last_update_time: Date.UTC(2026, 5, 4, 12, 0, 0),
          forecast_interval: { period: { interval: 1, unit: 'Minutes' } },
          window_delay: { period: { interval: 0, unit: 'Seconds' } },
          feature_attributes: [
            {
              feature_id: 'feature-1',
              feature_name: 'cpu_sum',
              feature_enabled: true,
              aggregation_query: { cpu_sum: { sum: { field: 'cpu' } } },
            },
          ],
        },
      },
    }));
    const client = { transport: { request: transportRequest } } as never;

    const result = await svc.getRuleDetail(
      client,
      'ds-os',
      'forecaster-1',
      undefined,
      'forecaster'
    );

    expect(mockOsBackend.getMonitor).not.toHaveBeenCalled();
    expect(result?.definitionType).toBe('forecaster');
    expect(result?.name).toBe('cpu forecaster');
    expect(transportRequest).toHaveBeenCalledTimes(1);
    expect(transportRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/_plugins/_forecast/forecasters/forecaster-1',
      })
    );
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

  it('getAlertDetail forwards findAlertId so backend pagination short-circuits on match', async () => {
    mockOsBackend.getAlerts.mockResolvedValueOnce({ alerts: [sampleOSAlert], totalAlerts: 1 });
    await svc.getAlertDetail(mockClient, 'ds-os', sampleOSAlert.id, 'mon-7');
    expect(mockOsBackend.getAlerts).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({ findAlertId: sampleOSAlert.id, monitorId: 'mon-7' })
    );
  });

  it('getAlertDetail still forwards findAlertId when monitorId is omitted', async () => {
    mockOsBackend.getAlerts.mockResolvedValueOnce({ alerts: [sampleOSAlert], totalAlerts: 1 });
    await svc.getAlertDetail(mockClient, 'ds-os', sampleOSAlert.id);
    const callOpts = mockOsBackend.getAlerts.mock.calls[0][1];
    expect(callOpts).toEqual({ findAlertId: sampleOSAlert.id });
  });
});
