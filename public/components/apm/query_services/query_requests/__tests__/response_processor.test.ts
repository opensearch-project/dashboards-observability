/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  transposeDataFrame,
  transformListServicesResponse,
  transformGetServiceResponse,
  transformListServiceOperationsResponse,
  transformListServiceDependenciesResponse,
  transformGetServiceMapResponse,
  ResponseProcessor,
} from '../response_processor';

describe('response_processor', () => {
  describe('transposeDataFrame', () => {
    it('should use jsonData directly when available', () => {
      const dataFrame = {
        jsonData: [
          { name: 'service1', value: 100 },
          { name: 'service2', value: 200 },
        ],
        size: 2,
      };

      const result = transposeDataFrame(dataFrame as unknown);

      expect(result).toEqual(dataFrame.jsonData);
    });

    it('should transpose fields format to row objects', () => {
      const dataFrame = {
        fields: [
          { name: 'serviceName', values: ['svc1', 'svc2'] },
          { name: 'count', values: [10, 20] },
        ],
        size: 2,
      };

      const result = transposeDataFrame(dataFrame as unknown);

      expect(result).toEqual([
        { serviceName: 'svc1', count: 10 },
        { serviceName: 'svc2', count: 20 },
      ]);
    });

    it('should return empty array for empty dataFrame', () => {
      const dataFrame = {
        fields: [],
        size: 0,
      };

      const result = transposeDataFrame(dataFrame as unknown);

      expect(result).toEqual([]);
    });

    it('should return empty array when size is 0', () => {
      const dataFrame = {
        fields: [{ name: 'test', values: [] }],
        size: 0,
      };

      const result = transposeDataFrame(dataFrame as unknown);

      expect(result).toEqual([]);
    });

    it('should handle missing fields', () => {
      const result = transposeDataFrame({} as unknown);

      expect(result).toEqual([]);
    });
  });

  describe('transformListServicesResponse', () => {
    it('should transform valid service data', () => {
      const pplResponse = {
        jsonData: [
          {
            'sourceNode.keyAttributes': { name: 'api-gateway', environment: 'production' },
            'sourceNode.groupByAttributes': { team: 'platform' },
          },
          {
            'sourceNode.keyAttributes': { name: 'user-service', environment: 'production' },
            'sourceNode.groupByAttributes': { team: 'users' },
          },
        ],
        size: 2,
      };

      const result = transformListServicesResponse(pplResponse as unknown);

      expect(result.ServiceSummaries).toHaveLength(2);
      expect(result.ServiceSummaries[0].KeyAttributes.Name).toBe('api-gateway');
      expect(result.ServiceSummaries[0].KeyAttributes.Environment).toBe('production');
      expect(result.AvailableGroupByAttributes).toBeDefined();
    });

    it('should collect services from both sourceNode and targetNode', () => {
      const pplResponse = {
        jsonData: [
          {
            'sourceNode.keyAttributes': { name: 'api-gateway', environment: 'prod' },
            'sourceNode.groupByAttributes': { team: 'platform' },
            'targetNode.keyAttributes': { name: 'user-service', environment: 'prod' },
            'targetNode.groupByAttributes': { team: 'users' },
          },
        ],
        size: 1,
      };

      const result = transformListServicesResponse(pplResponse as unknown);

      expect(result.ServiceSummaries).toHaveLength(2);
      const names = result.ServiceSummaries.map((s: any) => s.KeyAttributes.Name);
      expect(names).toContain('api-gateway');
      expect(names).toContain('user-service');
    });

    it('should handle null targetNode gracefully', () => {
      const pplResponse = {
        jsonData: [
          {
            'sourceNode.keyAttributes': { name: 'leaf-service', environment: 'prod' },
            'sourceNode.groupByAttributes': {},
            'targetNode.keyAttributes': null,
            'targetNode.groupByAttributes': null,
          },
        ],
        size: 1,
      };

      const result = transformListServicesResponse(pplResponse as unknown);

      expect(result.ServiceSummaries).toHaveLength(1);
      expect(result.ServiceSummaries[0].KeyAttributes.Name).toBe('leaf-service');
    });

    it('should return empty response for empty data', () => {
      const pplResponse = {
        jsonData: [],
        size: 0,
      };

      const result = transformListServicesResponse(pplResponse as unknown);

      expect(result.ServiceSummaries).toEqual([]);
      expect(result.NextToken).toBeNull();
    });

    it('should skip rows without required fields', () => {
      const pplResponse = {
        jsonData: [
          { 'sourceNode.keyAttributes': { name: 'valid-service', environment: 'prod' } },
          { 'sourceNode.keyAttributes': { name: 'missing-env' } }, // Missing environment
          { someOtherField: 'value' }, // Missing both
        ],
        size: 3,
      };

      const result = transformListServicesResponse(pplResponse as unknown);

      expect(result.ServiceSummaries).toHaveLength(1);
      expect(result.ServiceSummaries[0].KeyAttributes.Name).toBe('valid-service');
    });

    it('should deduplicate services by key', () => {
      const pplResponse = {
        jsonData: [
          { 'sourceNode.keyAttributes': { name: 'api-gateway', environment: 'prod' } },
          { 'sourceNode.keyAttributes': { name: 'api-gateway', environment: 'prod' } }, // Duplicate
        ],
        size: 2,
      };

      const result = transformListServicesResponse(pplResponse as unknown);

      expect(result.ServiceSummaries).toHaveLength(1);
    });

    it('should sort services by name', () => {
      const pplResponse = {
        jsonData: [
          { 'sourceNode.keyAttributes': { name: 'zebra-service', environment: 'prod' } },
          { 'sourceNode.keyAttributes': { name: 'alpha-service', environment: 'prod' } },
        ],
        size: 2,
      };

      const result = transformListServicesResponse(pplResponse as unknown);

      expect(result.ServiceSummaries[0].KeyAttributes.Name).toBe('alpha-service');
      expect(result.ServiceSummaries[1].KeyAttributes.Name).toBe('zebra-service');
    });
  });

  describe('transformGetServiceResponse', () => {
    it('should transform valid service detail', () => {
      const pplResponse = {
        jsonData: [
          {
            'sourceNode.keyAttributes': { name: 'api-gateway', environment: 'production' },
          },
        ],
        size: 1,
      };

      const result = transformGetServiceResponse(pplResponse as unknown);

      expect(result.Service).toBeDefined();
      expect(result.Service.KeyAttributes.Name).toBe('api-gateway');
      expect(result.Service.KeyAttributes.Environment).toBe('production');
    });

    it('should return null Service for empty response', () => {
      const pplResponse = {
        jsonData: [],
        size: 0,
      };

      const result = transformGetServiceResponse(pplResponse as unknown);

      expect(result.Service).toBeNull();
    });

    it('should return null Service when missing required fields', () => {
      const pplResponse = {
        jsonData: [{ 'sourceNode.keyAttributes': { name: 'missing-env' } }],
        size: 1,
      };

      const result = transformGetServiceResponse(pplResponse as unknown);

      expect(result.Service).toBeNull();
    });
  });

  describe('transformListServiceOperationsResponse', () => {
    it('should transform valid operations data', () => {
      const pplResponse = {
        jsonData: [
          { 'sourceOperation.name': 'GET /users' },
          { 'sourceOperation.name': 'POST /users' },
          { 'sourceOperation.name': 'GET /users' }, // Duplicate should increment count
        ],
        size: 3,
      };

      const result = transformListServiceOperationsResponse(pplResponse as unknown);

      expect(result.Operations).toHaveLength(2);
      const getUsersOp = result.Operations.find(
        (op: { Name: string; Count: number }) => op.Name === 'GET /users'
      );
      expect(getUsersOp.Count).toBe(2);
    });

    it('should return empty operations for empty response', () => {
      const pplResponse = {
        jsonData: [],
        size: 0,
      };

      const result = transformListServiceOperationsResponse(pplResponse as unknown);

      expect(result.Operations).toEqual([]);
    });

    it('should skip rows without operation name', () => {
      const pplResponse = {
        jsonData: [{ 'sourceOperation.name': 'GET /users' }, { someOtherField: 'value' }],
        size: 2,
      };

      const result = transformListServiceOperationsResponse(pplResponse as unknown);

      expect(result.Operations).toHaveLength(1);
    });
  });

  describe('transformListServiceDependenciesResponse', () => {
    it('should transform valid dependencies data', () => {
      const pplResponse = {
        jsonData: [
          {
            'targetNode.keyAttributes': { name: 'database', environment: 'prod' },
            'sourceOperation.name': 'query',
            'targetOperation.name': 'SELECT',
          },
        ],
        size: 1,
      };

      const result = transformListServiceDependenciesResponse(pplResponse as unknown);

      expect(result.Dependencies).toHaveLength(1);
      expect(result.Dependencies[0].DependencyName).toBe('database');
    });

    it('should return empty dependencies for empty response', () => {
      const pplResponse = {
        jsonData: [],
        size: 0,
      };

      const result = transformListServiceDependenciesResponse(pplResponse as unknown);

      expect(result.Dependencies).toEqual([]);
    });
  });

  describe('transformGetServiceMapResponse', () => {
    it('should transform valid service map data', () => {
      const pplResponse = {
        jsonData: [
          {
            'sourceNode.keyAttributes': { name: 'api-gateway', environment: 'prod' },
            'targetNode.keyAttributes': { name: 'user-service', environment: 'prod' },
          },
        ],
        size: 1,
      };

      const result = transformGetServiceMapResponse(pplResponse as unknown);

      expect(result.Nodes).toBeDefined();
      expect(result.Edges).toBeDefined();
      expect(result.Nodes.length).toBeGreaterThan(0);
    });

    it('should return empty nodes and edges for empty response', () => {
      const pplResponse = {
        jsonData: [],
        size: 0,
      };

      const result = transformGetServiceMapResponse(pplResponse as unknown);

      expect(result.Nodes).toEqual([]);
      expect(result.Edges).toEqual([]);
      expect(result.AggregatedNodes).toEqual([]);
    });

    it('should create edges between services', () => {
      const pplResponse = {
        jsonData: [
          {
            'sourceNode.keyAttributes': { name: 'api-gateway', environment: 'prod' },
            'targetNode.keyAttributes': { name: 'user-service', environment: 'prod' },
          },
        ],
        size: 1,
      };

      const result = transformGetServiceMapResponse(pplResponse as unknown);

      expect(result.Edges.length).toBeGreaterThan(0);
      expect(result.Edges[0].SourceNodeId).toContain('api-gateway');
      expect(result.Edges[0].DestinationNodeId).toContain('user-service');
    });

    it('should deduplicate nodes', () => {
      const pplResponse = {
        jsonData: [
          {
            'sourceNode.keyAttributes': { name: 'api-gateway', environment: 'prod' },
            'targetNode.keyAttributes': { name: 'user-service', environment: 'prod' },
          },
          {
            'sourceNode.keyAttributes': { name: 'api-gateway', environment: 'prod' },
            'targetNode.keyAttributes': { name: 'order-service', environment: 'prod' },
          },
        ],
        size: 2,
      };

      const result = transformGetServiceMapResponse(pplResponse as unknown);

      // api-gateway should only appear once as a node
      const apiGatewayNodes = result.Nodes.filter(
        (n: { KeyAttributes: { Name: string; Environment: string } }) =>
          n.KeyAttributes.Name === 'api-gateway'
      );
      expect(apiGatewayNodes).toHaveLength(1);
    });
  });

  describe('ResponseProcessor static methods', () => {
    it('should expose transformListServices', () => {
      expect(ResponseProcessor.transformListServices).toBe(transformListServicesResponse);
    });

    it('should expose transformGetService', () => {
      expect(ResponseProcessor.transformGetService).toBe(transformGetServiceResponse);
    });

    it('should expose transformListServiceOperations', () => {
      expect(ResponseProcessor.transformListServiceOperations).toBe(
        transformListServiceOperationsResponse
      );
    });

    it('should expose transformListServiceDependencies', () => {
      expect(ResponseProcessor.transformListServiceDependencies).toBe(
        transformListServiceDependenciesResponse
      );
    });

    it('should expose transformGetServiceMap', () => {
      expect(ResponseProcessor.transformGetServiceMap).toBe(transformGetServiceMapResponse);
    });
  });
});
