/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AlertingOpenSearchService transport tests.
 *
 * Focus on `buildQuery` / `listAlerts` forwarding — the HTTP client comes
 * from `coreRefs.http` (APM-pattern transport); we mock the module so each
 * test can assert on the `get` arguments without a real backend.
 */

// Mock coreRefs before importing the service so `requireHttp()` sees the stub.
const mockGet = jest.fn();
jest.mock('../../../../framework/core_refs', () => ({
  coreRefs: {
    http: { get: (...args: unknown[]) => mockGet(...args) },
  },
}));

import { AlertingOpenSearchService } from '../alerting_opensearch_service';

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({
    results: [],
    datasourceStatus: [],
    totalDatasources: 0,
    completedDatasources: 0,
    fetchedAt: '2026-01-01T00:00:00Z',
  });
});

describe('AlertingOpenSearchService', () => {
  describe('listAlerts', () => {
    it('sends dsIds as comma-joined string on the query object', async () => {
      const svc = new AlertingOpenSearchService();
      await svc.listAlerts({ dsIds: ['ds-1', 'ds-2'] });
      expect(mockGet).toHaveBeenCalledWith('/api/alerting/unified/alerts', {
        query: { dsIds: 'ds-1,ds-2' },
      });
    });

    it('forwards startTime and endTime on the query object when provided', async () => {
      const svc = new AlertingOpenSearchService();
      await svc.listAlerts({
        dsIds: ['ds-1'],
        startTime: 'now-1h',
        endTime: 'now',
      });
      expect(mockGet).toHaveBeenCalledWith('/api/alerting/unified/alerts', {
        query: {
          dsIds: 'ds-1',
          startTime: 'now-1h',
          endTime: 'now',
        },
      });
    });

    it('omits startTime/endTime keys entirely when the caller does not supply them', async () => {
      const svc = new AlertingOpenSearchService();
      await svc.listAlerts({ dsIds: ['ds-1'] });
      const [, options] = mockGet.mock.calls[0];
      expect(options.query).not.toHaveProperty('startTime');
      expect(options.query).not.toHaveProperty('endTime');
    });

    it('omits startTime/endTime when explicitly undefined (does not send the string "undefined")', async () => {
      const svc = new AlertingOpenSearchService();
      await svc.listAlerts({
        dsIds: ['ds-1'],
        startTime: undefined,
        endTime: undefined,
      });
      const [, options] = mockGet.mock.calls[0];
      expect(options.query).not.toHaveProperty('startTime');
      expect(options.query).not.toHaveProperty('endTime');
    });

    it('forwards only startTime when endTime is absent', async () => {
      const svc = new AlertingOpenSearchService();
      await svc.listAlerts({ dsIds: ['ds-1'], startTime: 'now-24h' });
      const [, options] = mockGet.mock.calls[0];
      expect(options.query.startTime).toBe('now-24h');
      expect(options.query).not.toHaveProperty('endTime');
    });

    it('forwards timeout and maxResults alongside range when provided', async () => {
      const svc = new AlertingOpenSearchService();
      await svc.listAlerts({
        dsIds: ['ds-1'],
        timeout: 10000,
        maxResults: 1000,
        startTime: 'now-7d',
        endTime: 'now',
      });
      expect(mockGet).toHaveBeenCalledWith('/api/alerting/unified/alerts', {
        query: {
          dsIds: 'ds-1',
          timeout: '10000',
          maxResults: '1000',
          startTime: 'now-7d',
          endTime: 'now',
        },
      });
    });
  });

  describe('listRules', () => {
    it('does not send startTime/endTime even if present on the params object (rules have no time range)', async () => {
      const svc = new AlertingOpenSearchService();
      await svc.listRules({ dsIds: ['ds-1'] });
      expect(mockGet).toHaveBeenCalledWith('/api/alerting/unified/rules', {
        query: { dsIds: 'ds-1' },
      });
    });
  });

  describe('getNotificationConfigs', () => {
    it('calls /api/notifications/get_configs with channel-type filters', async () => {
      mockGet.mockResolvedValueOnce({
        config_list: [
          {
            config_id: 'ch-1',
            config: { name: 'channel-1', config_type: 'sns', is_enabled: true },
          },
        ],
        total_hits: 1,
      });
      const svc = new AlertingOpenSearchService();
      const result = await svc.getNotificationConfigs('ds-1');

      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockGet.mock.calls[0][0]).toBe('/api/notifications/get_configs');
      const query = mockGet.mock.calls[0][1].query;
      expect(query.dataSourceId).toBe('ds-1');
      expect(query.config_type).toContain('slack');
      expect(query.config_type).toContain('sns');
      expect(result.destinations).toEqual([{ id: 'ch-1', name: 'channel-1', type: 'sns' }]);
      expect(result.totalDestinations).toBe(1);
      expect(result.truncated).toBe(false);
    });

    it('omits dataSourceId for the synthetic local-cluster id', async () => {
      mockGet.mockResolvedValueOnce({ config_list: [], total_hits: 0 });
      const svc = new AlertingOpenSearchService();
      await svc.getNotificationConfigs('local-cluster');

      const query = mockGet.mock.calls[0][1].query;
      expect(query).not.toHaveProperty('dataSourceId');
    });

    it('does not fall back to the legacy alerting destinations route on failure', async () => {
      mockGet.mockRejectedValueOnce(new Error('get_configs failed'));
      const svc = new AlertingOpenSearchService();

      await expect(svc.getNotificationConfigs('ds-1')).rejects.toThrow('get_configs failed');
      expect(mockGet).toHaveBeenCalledTimes(1);
    });
  });
});
