/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PromQLSearchService } from '../promql_search_service';

// Mock the coreRefs
jest.mock('../../../../framework/core_refs', () => ({
  coreRefs: {
    http: {
      post: jest.fn(),
    },
  },
}));

import { coreRefs } from '../../../../framework/core_refs';

describe('PromQLSearchService', () => {
  let service: PromQLSearchService;
  const prometheusConnectionId = 'prometheus-connection-123';

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PromQLSearchService(prometheusConnectionId);
  });

  describe('constructor', () => {
    it('should store prometheus connection ID', () => {
      const testService = new PromQLSearchService('test-connection');
      expect(testService).toBeDefined();
    });

    it('should store prometheus connection ID and meta', () => {
      const meta = { prometheusUrl: 'http://prometheus:9090' };
      const testService = new PromQLSearchService('test-connection', meta);
      expect(testService).toBeDefined();
    });

    it('should work with undefined meta', () => {
      const testService = new PromQLSearchService('test-connection', undefined);
      expect(testService).toBeDefined();
    });
  });

  describe('executeMetricRequest', () => {
    it('should execute PromQL query and return body', async () => {
      const mockResponse = {
        body: {
          data: {
            result: [{ metric: { service: 'test' }, values: [[1000, '100']] }],
          },
        },
      };

      (coreRefs.http!.post as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.executeMetricRequest({
        query: 'rate(error[5m])',
        startTime: 1000,
        endTime: 2000,
      });

      expect(coreRefs.http!.post).toHaveBeenCalledWith(
        '/api/enhancements/search/promql',
        expect.objectContaining({
          body: expect.any(String),
        })
      );
      expect(result).toEqual(mockResponse.body);
    });

    it('should not include options.step when step not provided', async () => {
      const mockResponse = { body: { data: { result: [] } } };
      (coreRefs.http!.post as jest.Mock).mockResolvedValue(mockResponse);

      await service.executeMetricRequest({
        query: 'rate(error[5m])',
        startTime: 1000,
        endTime: 2000,
      });

      const callArg = (coreRefs.http!.post as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArg.body);

      expect(body.options?.step).toBeUndefined();
    });

    it('should include options.step when step is provided', async () => {
      const mockResponse = { body: { data: { result: [] } } };
      (coreRefs.http!.post as jest.Mock).mockResolvedValue(mockResponse);

      await service.executeMetricRequest({
        query: 'rate(error[5m])',
        startTime: 1000,
        endTime: 2000,
        step: 60,
      });

      const callArg = (coreRefs.http!.post as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArg.body);

      expect(body.options.step).toBe(60);
    });

    it('should format time range correctly', async () => {
      const mockResponse = { body: { data: { result: [] } } };
      (coreRefs.http!.post as jest.Mock).mockResolvedValue(mockResponse);

      const startTime = 1704067200; // 2024-01-01T00:00:00Z
      const endTime = 1704153600; // 2024-01-02T00:00:00Z

      await service.executeMetricRequest({
        query: 'rate(error[5m])',
        startTime,
        endTime,
      });

      const callArg = (coreRefs.http!.post as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArg.body);

      expect(body.timeRange.from).toBe(new Date(startTime * 1000).toISOString());
      expect(body.timeRange.to).toBe(new Date(endTime * 1000).toISOString());
    });

    it('should set correct dataset format', async () => {
      const mockResponse = { body: { data: { result: [] } } };
      (coreRefs.http!.post as jest.Mock).mockResolvedValue(mockResponse);

      await service.executeMetricRequest({
        query: 'rate(error[5m])',
        startTime: 1000,
        endTime: 2000,
      });

      const callArg = (coreRefs.http!.post as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArg.body);

      expect(body.query.dataset.id).toBe(prometheusConnectionId);
      expect(body.query.dataset.type).toBe('PROMETHEUS');
      expect(body.query.language).toBe('PROMQL');
      expect(body.query.format).toBe('jdbc');
    });

    it('should include meta in dataSource when provided', async () => {
      const meta = { arn: 'sample:arn' };
      const serviceWithMeta = new PromQLSearchService(prometheusConnectionId, meta);
      const mockResponse = { body: { data: { result: [] } } };
      (coreRefs.http!.post as jest.Mock).mockResolvedValue(mockResponse);

      await serviceWithMeta.executeMetricRequest({
        query: 'rate(error[5m])',
        startTime: 1000,
        endTime: 2000,
      });

      const callArg = (coreRefs.http!.post as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArg.body);

      expect(body.query.dataset.id).toBe(prometheusConnectionId);
      expect(body.query.dataset.type).toBe('PROMETHEUS');
      expect(body.query.dataset.dataSource).toEqual({ meta });
    });

    it('should include dataSource with undefined meta when meta not provided', async () => {
      const mockResponse = { body: { data: { result: [] } } };
      (coreRefs.http!.post as jest.Mock).mockResolvedValue(mockResponse);

      await service.executeMetricRequest({
        query: 'rate(error[5m])',
        startTime: 1000,
        endTime: 2000,
      });

      const callArg = (coreRefs.http!.post as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArg.body);

      expect(body.query.dataset.dataSource).toEqual({ meta: undefined });
    });

    it('should throw error on query failure', async () => {
      const mockError = new Error('Query execution failed');
      (coreRefs.http!.post as jest.Mock).mockRejectedValue(mockError);

      await expect(
        service.executeMetricRequest({
          query: 'invalid query',
          startTime: 1000,
          endTime: 2000,
        })
      ).rejects.toThrow('Query execution failed');
    });

    it('should log error on failure', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockError = new Error('Query failed');
      (coreRefs.http!.post as jest.Mock).mockRejectedValue(mockError);

      await expect(
        service.executeMetricRequest({
          query: 'test',
          startTime: 1000,
          endTime: 2000,
        })
      ).rejects.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[PromQLSearchService] Query execution failed:',
        mockError
      );

      consoleSpy.mockRestore();
    });
  });

  describe('executeInstantQuery', () => {
    it('should send options.queryType INSTANT and options.time', async () => {
      const mockResponse = {
        body: {
          data: {
            result: [{ metric: { service: 'test' }, value: [1000, '100'] }],
          },
        },
      };

      (coreRefs.http!.post as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.executeInstantQuery({
        query: 'sum(request{namespace="span_derived"})',
        time: 1704153600,
      });

      const callArg = (coreRefs.http!.post as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArg.body);

      expect(body.options.queryType).toBe('INSTANT');
      expect(body.options.time).toBe('1704153600');
      expect(result).toEqual(mockResponse.body);
    });

    it('should NOT include timeRange in request body', async () => {
      const mockResponse = { body: { data: { result: [] } } };
      (coreRefs.http!.post as jest.Mock).mockResolvedValue(mockResponse);

      await service.executeInstantQuery({
        query: 'sum(request{namespace="span_derived"})',
        time: 1704153600,
      });

      const callArg = (coreRefs.http!.post as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArg.body);

      expect(body.timeRange).toBeUndefined();
    });

    it('should throw on failure', async () => {
      const mockError = new Error('Instant query failed');
      (coreRefs.http!.post as jest.Mock).mockRejectedValue(mockError);

      await expect(
        service.executeInstantQuery({
          query: 'invalid query',
          time: 1000,
        })
      ).rejects.toThrow('Instant query failed');
    });

    it('should log error on failure', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockError = new Error('Query failed');
      (coreRefs.http!.post as jest.Mock).mockRejectedValue(mockError);

      await expect(
        service.executeInstantQuery({
          query: 'test',
          time: 1000,
        })
      ).rejects.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[PromQLSearchService] Instant query execution failed:',
        mockError
      );

      consoleSpy.mockRestore();
    });
  });
});
