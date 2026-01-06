/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { registerApmRoutes } from '../apm_router';

describe('APM Router', () => {
  let mockRouter: any;
  let mockCore: any;
  let mockLogger: any;
  let mockContext: any;
  let mockResponse: any;

  beforeEach(() => {
    // Setup mocks
    mockRouter = {
      post: jest.fn(),
    };

    mockCore = {
      getStartServices: jest.fn(),
    };

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
    };

    mockContext = {
      core: {
        opensearch: {
          legacy: {
            client: {
              callAsCurrentUser: jest.fn(),
            },
          },
        },
      },
      dataSource: {
        opensearch: {
          legacy: {
            getClient: jest.fn(() => ({
              callAPI: jest.fn(),
            })),
          },
        },
      },
    };

    mockResponse = {
      ok: jest.fn((data) => data),
      customError: jest.fn((data) => data),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registerApmRoutes', () => {
    it('registers two POST routes', () => {
      registerApmRoutes(mockRouter, mockCore, mockLogger);

      expect(mockRouter.post).toHaveBeenCalledTimes(2);
      expect(mockRouter.post).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/api/apm/ppl/query' }),
        expect.any(Function)
      );
      expect(mockRouter.post).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/api/apm/promql/query' }),
        expect.any(Function)
      );
    });

    it('registers routes with proper validation schemas', () => {
      registerApmRoutes(mockRouter, mockCore, mockLogger);

      const pplRouteConfig = mockRouter.post.mock.calls[0][0];
      const promqlRouteConfig = mockRouter.post.mock.calls[1][0];

      expect(pplRouteConfig.validate).toBeDefined();
      expect(pplRouteConfig.validate.body).toBeDefined();
      expect(promqlRouteConfig.validate).toBeDefined();
      expect(promqlRouteConfig.validate.body).toBeDefined();
    });
  });

  describe('PPL Query Endpoint', () => {
    let pplHandler: any;

    beforeEach(() => {
      registerApmRoutes(mockRouter, mockCore, mockLogger);
      // Extract the handler function from the first router.post call
      pplHandler = mockRouter.post.mock.calls[0][1];
    });

    it('executes PPL query successfully without datasource ID', async () => {
      const mockRequest = {
        body: {
          query: 'source=test-index | fields field1, field2',
          datasetId: 'test-dataset',
        },
      };

      const mockPplResponse = {
        schema: [
          { name: 'field1', type: 'string' },
          { name: 'field2', type: 'integer' },
        ],
        datarows: [
          ['value1', 123],
          ['value2', 456],
        ],
      };

      mockContext.core.opensearch.legacy.client.callAsCurrentUser.mockResolvedValue(
        mockPplResponse
      );

      await pplHandler(mockContext, mockRequest, mockResponse);

      expect(
        mockContext.core.opensearch.legacy.client.callAsCurrentUser
      ).toHaveBeenCalledWith('enhancements.pplQuery', { body: { query: mockRequest.body.query } });

      expect(mockLogger.info).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('[APM] PPL Query:'));
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('executed successfully')
      );

      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: expect.objectContaining({
          schema: mockPplResponse.schema,
          datarows: mockPplResponse.datarows,
          jsonData: [
            { field1: 'value1', field2: 123 },
            { field1: 'value2', field2: 456 },
          ],
        }),
      });
    });

    it('executes PPL query successfully with datasource ID', async () => {
      const mockRequest = {
        body: {
          query: 'source=test-index | fields field1',
          datasetId: 'test-dataset',
          opensearchDataSourceId: 'datasource-123',
        },
      };

      const mockPplResponse = {
        schema: [{ name: 'field1', type: 'string' }],
        datarows: [['value1']],
      };

      const mockCallAPI = jest.fn().mockResolvedValue(mockPplResponse);
      mockContext.dataSource.opensearch.legacy.getClient.mockReturnValue({
        callAPI: mockCallAPI,
      });

      await pplHandler(mockContext, mockRequest, mockResponse);

      expect(mockContext.dataSource.opensearch.legacy.getClient).toHaveBeenCalledWith(
        'datasource-123'
      );
      expect(mockCallAPI).toHaveBeenCalledWith('enhancements.pplQuery', {
        body: { query: mockRequest.body.query },
      });

      expect(mockResponse.ok).toHaveBeenCalled();
    });

    it('correctly transforms PPL datarows to jsonData', async () => {
      const mockRequest = {
        body: {
          query: 'source=test | fields name, age, active',
          datasetId: 'test-dataset',
        },
      };

      const mockPplResponse = {
        schema: [
          { name: 'name', type: 'string' },
          { name: 'age', type: 'integer' },
          { name: 'active', type: 'boolean' },
        ],
        datarows: [
          ['Alice', 30, true],
          ['Bob', 25, false],
        ],
      };

      mockContext.core.opensearch.legacy.client.callAsCurrentUser.mockResolvedValue(
        mockPplResponse
      );

      await pplHandler(mockContext, mockRequest, mockResponse);

      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: expect.objectContaining({
          jsonData: [
            { name: 'Alice', age: 30, active: true },
            { name: 'Bob', age: 25, active: false },
          ],
        }),
      });
    });

    it('handles empty datarows correctly', async () => {
      const mockRequest = {
        body: {
          query: 'source=empty-index | fields field1',
          datasetId: 'test-dataset',
        },
      };

      const mockPplResponse = {
        schema: [{ name: 'field1', type: 'string' }],
        datarows: [],
      };

      mockContext.core.opensearch.legacy.client.callAsCurrentUser.mockResolvedValue(
        mockPplResponse
      );

      await pplHandler(mockContext, mockRequest, mockResponse);

      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: expect.objectContaining({
          jsonData: [],
        }),
      });
    });

    it('handles null datarows correctly', async () => {
      const mockRequest = {
        body: {
          query: 'source=test-index | fields field1',
          datasetId: 'test-dataset',
        },
      };

      const mockPplResponse = {
        schema: [{ name: 'field1', type: 'string' }],
        datarows: null,
      };

      mockContext.core.opensearch.legacy.client.callAsCurrentUser.mockResolvedValue(
        mockPplResponse
      );

      await pplHandler(mockContext, mockRequest, mockResponse);

      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: expect.objectContaining({
          jsonData: [],
        }),
      });
    });

    it('handles PPL query errors with status code', async () => {
      const mockRequest = {
        body: {
          query: 'invalid query',
          datasetId: 'test-dataset',
        },
      };

      const mockError: any = new Error('Query execution failed');
      mockError.statusCode = 400;

      mockContext.core.opensearch.legacy.client.callAsCurrentUser.mockRejectedValue(mockError);

      await pplHandler(mockContext, mockRequest, mockResponse);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[APM] PPL Query error:')
      );
      expect(mockResponse.customError).toHaveBeenCalledWith({
        statusCode: 400,
        body: expect.objectContaining({
          message: 'Query execution failed',
        }),
      });
    });

    it('handles PPL query errors without status code', async () => {
      const mockRequest = {
        body: {
          query: 'invalid query',
          datasetId: 'test-dataset',
        },
      };

      const mockError = new Error('Network error');

      mockContext.core.opensearch.legacy.client.callAsCurrentUser.mockRejectedValue(mockError);

      await pplHandler(mockContext, mockRequest, mockResponse);

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockResponse.customError).toHaveBeenCalledWith({
        statusCode: 500,
        body: expect.objectContaining({
          message: 'Network error',
        }),
      });
    });
  });

  describe('PromQL Query Endpoint', () => {
    let promqlHandler: any;

    beforeEach(() => {
      registerApmRoutes(mockRouter, mockCore, mockLogger);
      // Extract the handler function from the second router.post call
      promqlHandler = mockRouter.post.mock.calls[1][1];
    });

    it('executes PromQL range query successfully', async () => {
      const mockRequest = {
        body: {
          query: 'up{job="prometheus"}',
          prometheusConnectionName: 'test-prometheus',
          timeRange: { from: 'now-1h', to: 'now' },
          step: '30s',
        },
      };

      const mockSearchResponse = {
        rawResponse: {
          data: { result: [] },
        },
      };

      const mockDataPlugin = {
        search: {
          search: jest.fn().mockResolvedValue(mockSearchResponse),
        },
      };

      mockCore.getStartServices.mockResolvedValue([null, { data: mockDataPlugin }]);

      await promqlHandler(mockContext, mockRequest, mockResponse);

      expect(mockDataPlugin.search.search).toHaveBeenCalledWith(
        mockContext,
        expect.objectContaining({
          body: expect.objectContaining({
            query: expect.objectContaining({
              query: mockRequest.body.query,
              language: 'PromQL',
              dataset: { id: 'test-prometheus', type: 'PROMETHEUS' },
            }),
            timeRange: mockRequest.body.timeRange,
            step: mockRequest.body.step,
            queryType: 'range',
          }),
        }),
        { strategy: 'promql' }
      );

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('[APM] PromQL Query:'));
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('executed successfully')
      );

      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: mockSearchResponse.rawResponse,
      });
    });

    it('executes PromQL instant query successfully', async () => {
      const mockRequest = {
        body: {
          query: 'up',
          prometheusConnectionName: 'test-prometheus',
          timeRange: { from: 'now-1h', to: 'now' },
          queryType: 'instant' as const,
        },
      };

      const mockSearchResponse = {
        rawResponse: {
          data: { result: [] },
        },
      };

      const mockDataPlugin = {
        search: {
          search: jest.fn().mockResolvedValue(mockSearchResponse),
        },
      };

      mockCore.getStartServices.mockResolvedValue([null, { data: mockDataPlugin }]);

      await promqlHandler(mockContext, mockRequest, mockResponse);

      expect(mockDataPlugin.search.search).toHaveBeenCalledWith(
        mockContext,
        expect.objectContaining({
          body: expect.objectContaining({
            queryType: 'instant',
          }),
        }),
        { strategy: 'promql' }
      );
    });

    it('defaults to range query when queryType is omitted', async () => {
      const mockRequest = {
        body: {
          query: 'up',
          prometheusConnectionName: 'test-prometheus',
          timeRange: { from: 'now-1h', to: 'now' },
        },
      };

      const mockSearchResponse = {
        rawResponse: {
          data: { result: [] },
        },
      };

      const mockDataPlugin = {
        search: {
          search: jest.fn().mockResolvedValue(mockSearchResponse),
        },
      };

      mockCore.getStartServices.mockResolvedValue([null, { data: mockDataPlugin }]);

      await promqlHandler(mockContext, mockRequest, mockResponse);

      expect(mockDataPlugin.search.search).toHaveBeenCalledWith(
        mockContext,
        expect.objectContaining({
          body: expect.objectContaining({
            queryType: 'range',
          }),
        }),
        { strategy: 'promql' }
      );
    });

    it('passes opensearchDataSourceId correctly', async () => {
      const mockRequest = {
        body: {
          query: 'up',
          prometheusConnectionName: 'test-prometheus',
          opensearchDataSourceId: 'datasource-456',
          timeRange: { from: 'now-1h', to: 'now' },
        },
      };

      const mockSearchResponse = {
        rawResponse: {
          data: { result: [] },
        },
      };

      const mockDataPlugin = {
        search: {
          search: jest.fn().mockResolvedValue(mockSearchResponse),
        },
      };

      mockCore.getStartServices.mockResolvedValue([null, { data: mockDataPlugin }]);

      await promqlHandler(mockContext, mockRequest, mockResponse);

      expect(mockDataPlugin.search.search).toHaveBeenCalledWith(
        mockContext,
        expect.objectContaining({
          dataSourceId: 'datasource-456',
        }),
        { strategy: 'promql' }
      );
    });

    it('passes step parameter correctly', async () => {
      const mockRequest = {
        body: {
          query: 'up',
          prometheusConnectionName: 'test-prometheus',
          timeRange: { from: 'now-1h', to: 'now' },
          step: '60s',
        },
      };

      const mockSearchResponse = {
        rawResponse: {
          data: { result: [] },
        },
      };

      const mockDataPlugin = {
        search: {
          search: jest.fn().mockResolvedValue(mockSearchResponse),
        },
      };

      mockCore.getStartServices.mockResolvedValue([null, { data: mockDataPlugin }]);

      await promqlHandler(mockContext, mockRequest, mockResponse);

      expect(mockDataPlugin.search.search).toHaveBeenCalledWith(
        mockContext,
        expect.objectContaining({
          body: expect.objectContaining({
            step: '60s',
          }),
        }),
        { strategy: 'promql' }
      );
    });

    it('returns body when rawResponse is not available', async () => {
      const mockRequest = {
        body: {
          query: 'up',
          prometheusConnectionName: 'test-prometheus',
          timeRange: { from: 'now-1h', to: 'now' },
        },
      };

      const mockSearchResponse = {
        body: {
          data: { result: [] },
        },
      };

      const mockDataPlugin = {
        search: {
          search: jest.fn().mockResolvedValue(mockSearchResponse),
        },
      };

      mockCore.getStartServices.mockResolvedValue([null, { data: mockDataPlugin }]);

      await promqlHandler(mockContext, mockRequest, mockResponse);

      expect(mockResponse.ok).toHaveBeenCalledWith({
        body: mockSearchResponse.body,
      });
    });

    it('returns 503 when data plugin is not available', async () => {
      const mockRequest = {
        body: {
          query: 'up',
          prometheusConnectionName: 'test',
          timeRange: { from: 'now-1h', to: 'now' },
        },
      };

      mockCore.getStartServices.mockResolvedValue([null, { data: null }]);

      await promqlHandler(mockContext, mockRequest, mockResponse);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[APM] Data plugin or search service not available')
      );
      expect(mockResponse.customError).toHaveBeenCalledWith({
        statusCode: 503,
        body: { message: 'Search service not available' },
      });
    });

    it('returns 503 when search service is not available', async () => {
      const mockRequest = {
        body: {
          query: 'up',
          prometheusConnectionName: 'test',
          timeRange: { from: 'now-1h', to: 'now' },
        },
      };

      mockCore.getStartServices.mockResolvedValue([null, { data: {} }]);

      await promqlHandler(mockContext, mockRequest, mockResponse);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[APM] Data plugin or search service not available')
      );
      expect(mockResponse.customError).toHaveBeenCalledWith({
        statusCode: 503,
        body: { message: 'Search service not available' },
      });
    });

    it('handles PromQL query execution errors with status code', async () => {
      const mockRequest = {
        body: {
          query: 'invalid{',
          prometheusConnectionName: 'test',
          timeRange: { from: 'now-1h', to: 'now' },
        },
      };

      const mockError: any = new Error('Invalid query syntax');
      mockError.statusCode = 400;

      const mockDataPlugin = {
        search: {
          search: jest.fn().mockRejectedValue(mockError),
        },
      };

      mockCore.getStartServices.mockResolvedValue([null, { data: mockDataPlugin }]);

      await promqlHandler(mockContext, mockRequest, mockResponse);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[APM] PromQL Query error:')
      );
      expect(mockResponse.customError).toHaveBeenCalledWith({
        statusCode: 400,
        body: expect.objectContaining({
          message: 'Invalid query syntax',
        }),
      });
    });

    it('handles PromQL query execution errors without status code', async () => {
      const mockRequest = {
        body: {
          query: 'up',
          prometheusConnectionName: 'invalid-connection',
          timeRange: { from: 'now-1h', to: 'now' },
        },
      };

      const mockError = new Error('Connection refused');

      const mockDataPlugin = {
        search: {
          search: jest.fn().mockRejectedValue(mockError),
        },
      };

      mockCore.getStartServices.mockResolvedValue([null, { data: mockDataPlugin }]);

      await promqlHandler(mockContext, mockRequest, mockResponse);

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockResponse.customError).toHaveBeenCalledWith({
        statusCode: 500,
        body: expect.objectContaining({
          message: 'Connection refused',
        }),
      });
    });
  });
});
