/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PPLSearchService } from '../ppl_search_service';

// Mock the coreRefs
jest.mock('../../../../framework/core_refs', () => ({
  coreRefs: {
    http: {
      post: jest.fn(),
    },
  },
}));

// Mock response processor
jest.mock('../query_requests/response_processor', () => ({
  ResponseProcessor: {
    transformListServices: jest.fn((data) => ({ ServiceSummaries: [], ...data })),
    transformGetService: jest.fn((data) => ({ Service: null, ...data })),
    transformListServiceOperations: jest.fn((data) => ({ Operations: [], ...data })),
    transformListServiceDependencies: jest.fn((data) => ({ Dependencies: [], ...data })),
    transformGetServiceMap: jest.fn((data) => ({ Nodes: [], Edges: [], ...data })),
  },
}));

// Mock PPL queries
jest.mock('../query_requests/ppl_queries', () => ({
  getQueryListServices: jest.fn(() => 'source = index | fields service.name'),
  getQueryGetService: jest.fn(() => 'source = index | where service.name = "test"'),
  getQueryListServiceOperations: jest.fn(() => 'source = index | stats count()'),
  getQueryListServiceDependencies: jest.fn(() => 'source = index | where remote'),
  getQueryGetServiceMap: jest.fn(() => 'source = index | fields service, remote'),
}));

import { coreRefs } from '../../../../framework/core_refs';
import { ResponseProcessor } from '../query_requests/response_processor';

describe('PPLSearchService', () => {
  let service: PPLSearchService;
  const mockDataset = {
    id: 'test-dataset-id',
    title: 'test-index',
    dataSource: { id: 'datasource-1', type: 'DATA_SOURCE' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PPLSearchService();
  });

  describe('listServices', () => {
    it('should execute PPL query and transform response', async () => {
      const mockResponse = {
        body: {
          fields: [{ name: 'service.name', values: ['svc1', 'svc2'] }],
          size: 2,
        },
      };

      (coreRefs.http!.post as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.listServices({
        queryIndex: 'test-index',
        startTime: 1000,
        endTime: 2000,
        dataset: mockDataset,
      });

      expect(coreRefs.http!.post).toHaveBeenCalledWith(
        '/api/enhancements/search/ppl',
        expect.objectContaining({
          body: expect.any(String),
        })
      );
      expect(ResponseProcessor.transformListServices).toHaveBeenCalled();
      expect(result.ServiceSummaries).toBeDefined();
    });

    it('should return empty result on index not found error', async () => {
      const mockError = new Error('index_not_found_exception');
      (coreRefs.http!.post as jest.Mock).mockRejectedValue(mockError);

      const result = await service.listServices({
        queryIndex: 'test-index',
        startTime: 1000,
        endTime: 2000,
        dataset: mockDataset,
      });

      expect(result.jsonData).toEqual([]);
      expect(result.size).toBe(0);
    });

    it('should return empty result on unauthorized error', async () => {
      const mockError = new Error('Unauthorized');
      (coreRefs.http!.post as jest.Mock).mockRejectedValue(mockError);

      const result = await service.listServices({
        queryIndex: 'test-index',
        startTime: 1000,
        endTime: 2000,
        dataset: mockDataset,
      });

      expect(result.jsonData).toEqual([]);
    });

    it('should throw on other errors', async () => {
      const mockError = new Error('Network error');
      (coreRefs.http!.post as jest.Mock).mockRejectedValue(mockError);

      await expect(
        service.listServices({
          queryIndex: 'test-index',
          startTime: 1000,
          endTime: 2000,
          dataset: mockDataset,
        })
      ).rejects.toThrow('Network error');
    });
  });

  describe('getService', () => {
    it('should execute PPL query with key attributes', async () => {
      const mockResponse = {
        body: {
          fields: [{ name: 'service.name', values: ['api-gateway'] }],
          size: 1,
        },
      };

      (coreRefs.http!.post as jest.Mock).mockResolvedValue(mockResponse);

      await service.getService({
        queryIndex: 'test-index',
        startTime: 1000,
        endTime: 2000,
        keyAttributes: { Environment: 'prod', Name: 'api-gateway' },
        dataset: mockDataset,
      });

      expect(coreRefs.http!.post).toHaveBeenCalled();
      expect(ResponseProcessor.transformGetService).toHaveBeenCalled();
    });
  });

  describe('listServiceOperations', () => {
    it('should execute PPL query and transform operations', async () => {
      const mockResponse = {
        body: {
          fields: [{ name: 'operation.name', values: ['GET /users'] }],
          size: 1,
        },
      };

      (coreRefs.http!.post as jest.Mock).mockResolvedValue(mockResponse);

      await service.listServiceOperations({
        queryIndex: 'test-index',
        startTime: 1000,
        endTime: 2000,
        keyAttributes: { Environment: 'prod', Name: 'api-gateway' },
        dataset: mockDataset,
      });

      expect(ResponseProcessor.transformListServiceOperations).toHaveBeenCalled();
    });
  });

  describe('listServiceDependencies', () => {
    it('should execute PPL query and transform dependencies', async () => {
      const mockResponse = {
        body: {
          fields: [{ name: 'remoteService.name', values: ['database'] }],
          size: 1,
        },
      };

      (coreRefs.http!.post as jest.Mock).mockResolvedValue(mockResponse);

      await service.listServiceDependencies({
        queryIndex: 'test-index',
        startTime: 1000,
        endTime: 2000,
        keyAttributes: { Environment: 'prod', Name: 'api-gateway' },
        dataset: mockDataset,
      });

      expect(ResponseProcessor.transformListServiceDependencies).toHaveBeenCalled();
    });
  });

  describe('getServiceMap', () => {
    it('should execute PPL query and transform service map', async () => {
      const mockResponse = {
        body: {
          fields: [
            { name: 'service.name', values: ['api-gateway'] },
            { name: 'remoteService.name', values: ['user-service'] },
          ],
          size: 1,
        },
      };

      (coreRefs.http!.post as jest.Mock).mockResolvedValue(mockResponse);

      await service.getServiceMap({
        queryIndex: 'test-index',
        startTime: 1000,
        endTime: 2000,
        dataset: mockDataset,
      });

      expect(ResponseProcessor.transformGetServiceMap).toHaveBeenCalled();
    });
  });

  describe('executeQuery', () => {
    it('should execute arbitrary PPL query', async () => {
      const mockResponse = {
        body: {
          jsonData: [{ count: 100 }],
          size: 1,
        },
      };

      (coreRefs.http!.post as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.executeQuery('source = index | stats count()', mockDataset);

      expect(coreRefs.http!.post).toHaveBeenCalled();
      expect(result.jsonData).toBeDefined();
    });
  });

  describe('transformResponse', () => {
    it('should transform fields format to jsonData', async () => {
      const mockResponse = {
        body: {
          fields: [
            { name: 'field1', values: ['a', 'b'] },
            { name: 'field2', values: [1, 2] },
          ],
          size: 2,
        },
      };

      (coreRefs.http!.post as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.executeQuery('source = test', mockDataset);

      expect(result.jsonData).toEqual([
        { field1: 'a', field2: 1 },
        { field1: 'b', field2: 2 },
      ]);
    });

    it('should handle datarows format', async () => {
      const mockResponse = {
        body: {
          schema: [{ name: 'col1' }, { name: 'col2' }],
          datarows: [
            ['val1', 'val2'],
            ['val3', 'val4'],
          ],
        },
      };

      (coreRefs.http!.post as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.executeQuery('source = test', mockDataset);

      expect(result.jsonData).toEqual([
        { col1: 'val1', col2: 'val2' },
        { col1: 'val3', col2: 'val4' },
      ]);
    });

    it('should pass through response without fields or datarows', async () => {
      const mockResponse = {
        body: {
          customField: 'value',
        },
      };

      (coreRefs.http!.post as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.executeQuery('source = test', mockDataset);

      expect(result.customField).toBe('value');
    });
  });

  describe('request body format', () => {
    it('should include dataset with dataSource when provided', async () => {
      const mockResponse = { body: { jsonData: [], size: 0 } };
      (coreRefs.http!.post as jest.Mock).mockResolvedValue(mockResponse);

      await service.executeQuery('source = test', mockDataset);

      const callArg = (coreRefs.http!.post as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArg.body);

      expect(body.query.dataset.id).toBe('test-dataset-id');
      expect(body.query.dataset.title).toBe('test-index');
      expect(body.query.dataset.dataSource).toEqual({ id: 'datasource-1', type: 'DATA_SOURCE' });
      expect(body.query.language).toBe('PPL');
      expect(body.query.format).toBe('jdbc');
    });

    it('should omit dataSource when not provided', async () => {
      const mockResponse = { body: { jsonData: [], size: 0 } };
      (coreRefs.http!.post as jest.Mock).mockResolvedValue(mockResponse);

      const datasetWithoutSource = {
        id: 'test-id',
        title: 'test-index',
      };

      await service.executeQuery('source = test', datasetWithoutSource);

      const callArg = (coreRefs.http!.post as jest.Mock).mock.calls[0][1];
      const body = JSON.parse(callArg.body);

      expect(body.query.dataset.dataSource).toBeUndefined();
    });
  });
});
