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

// Mock PromQLQueryBuilder
jest.mock('../query_requests/promql_query_builder', () => ({
  PromQLQueryBuilder: {
    buildQuery: jest.fn(() => 'rate(error{service="test"}[5m])'),
  },
}));

import { coreRefs } from '../../../../framework/core_refs';
import { PromQLQueryBuilder } from '../query_requests/promql_query_builder';

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

    // Note: step parameter is not part of ExecuteMetricRequestParams and is
    // calculated automatically by OSD core, so we don't test for it here.

    it('should not include step in request body (calculated by OSD core)', async () => {
      const mockResponse = { body: { data: { result: [] } } };
      (coreRefs.http!.post as jest.Mock).mockResolvedValue(mockResponse);

      await service.executeMetricRequest({
        query: 'rate(error[5m])',
        startTime: 1000,
        endTime: 2000,
      });

      const callArg = (coreRefs.http!.post as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArg.body);

      expect(body.step).toBeUndefined();
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
      expect(body.query.language).toBe('PromQL');
      expect(body.query.format).toBe('jdbc');
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

  describe('executeBuiltQuery', () => {
    it('should build query using PromQLQueryBuilder and execute', async () => {
      const mockResponse = { body: { data: { result: [] } } };
      (coreRefs.http!.post as jest.Mock).mockResolvedValue(mockResponse);

      await service.executeBuiltQuery({
        metricName: 'error',
        filters: { service: 'api-gateway' },
        stat: 'sum',
        interval: '5m',
        startTime: 1000,
        endTime: 2000,
      });

      expect(PromQLQueryBuilder.buildQuery).toHaveBeenCalledWith({
        metricName: 'error',
        filters: { service: 'api-gateway' },
        stat: 'sum',
        interval: '5m',
      });
      expect(coreRefs.http!.post).toHaveBeenCalled();
    });

    // Note: step parameter is not part of executeBuiltQuery and is
    // calculated automatically by OSD core, so we don't test for it here.

    it('should handle missing stat parameter', async () => {
      const mockResponse = { body: { data: { result: [] } } };
      (coreRefs.http!.post as jest.Mock).mockResolvedValue(mockResponse);

      await service.executeBuiltQuery({
        metricName: 'latency',
        filters: { service: 'test' },
        interval: '1m',
        startTime: 1000,
        endTime: 2000,
      });

      expect(PromQLQueryBuilder.buildQuery).toHaveBeenCalledWith({
        metricName: 'latency',
        filters: { service: 'test' },
        stat: undefined,
        interval: '1m',
      });
    });
  });
});
