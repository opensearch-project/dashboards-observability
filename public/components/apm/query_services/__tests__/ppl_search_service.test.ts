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
jest.mock('../../common/constants', () => {
  const actual = jest.requireActual('../../common/constants');
  return {
    ...actual,
    APPLICATION_MAP_CONSTANTS: { ...actual.APPLICATION_MAP_CONSTANTS, MAX_EDGE_PAGES: 3 },
  };
});

jest.mock('../query_requests/ppl_queries', () => ({
  DEFAULT_ROW_LIMIT: 2,
  getQueryListServices: jest.fn(() => 'source = index | fields service.name'),
  getQueryGetService: jest.fn(() => 'source = index | where service.name = "test"'),
  getQueryListServiceOperations: jest.fn(() => 'source = index | stats count()'),
  getQueryListServiceDependencies: jest.fn(() => 'source = index | where remote'),
  getQueryGetServiceMap: jest.fn(() => 'source = index | fields service, remote'),
  getQueryDistinctEdgeCount: jest.fn(() => 'COUNT'),
}));

import { coreRefs } from '../../../../framework/core_refs';
import { ResponseProcessor } from '../query_requests/response_processor';
import { getQueryGetServiceMap } from '../query_requests/ppl_queries';

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

    // DEFAULT_ROW_LIMIT is mocked to 2 and MAX_EDGE_PAGES to 3.
    const page = (names: string[]) => ({
      body: { fields: [{ name: 'sourceNode.keyAttributes', values: names }], size: names.length },
    });
    const params = {
      queryIndex: 'test-index',
      startTime: 1000,
      endTime: 2000,
      dataset: mockDataset,
    };

    // Routes the distinct-count query (mocked as 'COUNT') apart from the paged queries.
    const post = () => coreRefs.http!.post as jest.Mock;
    const isCount = (call: any[]) => JSON.parse(call[1].body).query.query === 'COUNT';
    const routePosts = (pages: unknown[], count: number | Error = NaN) => {
      let i = 0;
      post().mockImplementation((_url: string, opts: { body: string }) => {
        if (JSON.parse(opts.body).query.query === 'COUNT') {
          return count instanceof Error
            ? Promise.reject(count)
            : Promise.resolve({ body: { fields: [{ name: 'edges', values: [count] }], size: 1 } });
        }
        const next = pages[Math.min(i++, pages.length - 1)];
        if (typeof next === 'function') return (next as () => Promise<unknown>)();
        return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
      });
    };
    const pageCalls = () => post().mock.calls.filter((c) => !isCount(c));

    it('pages the edge query until a short page and merges the rows', async () => {
      routePosts([page(['a', 'b']), page(['c'])], 3);

      const result = await service.getServiceMap(params);

      expect(pageCalls()).toHaveLength(2);
      expect(getQueryGetServiceMap).toHaveBeenNthCalledWith(1, 'test-index', 1000, 2000, 0);
      expect(getQueryGetServiceMap).toHaveBeenNthCalledWith(2, 'test-index', 1000, 2000, 2);
      expect(result.jsonData.map((r: any) => r['sourceNode.keyAttributes'])).toEqual([
        'a',
        'b',
        'c',
      ]);
      expect(result.size).toBe(3);
      expect(result.truncated).toBe(false);
    });

    it('stops at the page cap and reports the map as truncated', async () => {
      routePosts([page(['a', 'b'])]);

      const result = await service.getServiceMap(params);

      expect(pageCalls()).toHaveLength(3);
      expect(result.size).toBe(6);
      expect(result.truncated).toBe(true);
    });

    it('marks a result the engine cut short (rows well below the distinct count) truncated', async () => {
      // e.g. the 2.x PPL engine deduping only the first size_limit raw documents.
      routePosts([page(['a', 'b']), page(['c'])], 100);
      const result = await service.getServiceMap(params);
      expect(result.size).toBe(3);
      expect(result.truncated).toBe(true);
    });

    it('allows for the approximate count, and ignores a failed count', async () => {
      routePosts([page(['a', 'b']), page(['c'])], 3.05);
      expect((await service.getServiceMap(params)).truncated).toBe(false);
      routePosts([page(['a', 'b']), page(['c'])], new Error('no stats'));
      expect((await service.getServiceMap(params)).truncated).toBe(false);
    });

    it('keeps the pages already loaded when a later page fails, marked truncated', async () => {
      routePosts([page(['a', 'b']), new Error('timed out')]);

      const result = await service.getServiceMap(params);

      expect(result.size).toBe(2);
      expect(result.truncated).toBe(true);
      expect(result.partialError?.message).toBe('timed out');
    });

    it('still fails when the first page fails, and on abort', async () => {
      routePosts([new Error('timed out')]);
      await expect(service.getServiceMap(params)).rejects.toThrow('timed out');

      const controller = new AbortController();
      routePosts([
        page(['a', 'b']),
        () => {
          controller.abort();
          return Promise.reject(new Error('aborted'));
        },
      ]);
      await expect(service.getServiceMap(params, controller.signal)).rejects.toThrow('aborted');
    });

    it('listServices pages too, passes the signal, and reports truncation', async () => {
      routePosts([page(['a', 'b'])]);
      const controller = new AbortController();

      const result = await service.listServices(params as any, controller.signal);

      expect(pageCalls()).toHaveLength(3);
      post().mock.calls.forEach((c) => expect(c[1].signal).toBe(controller.signal));
      expect(result.truncated).toBe(true);
    });

    it('issues one page query when the first page is short', async () => {
      routePosts([page(['a'])], 1);

      const result = await service.getServiceMap(params);

      expect(pageCalls()).toHaveLength(1);
      expect(result.truncated).toBe(false);
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
