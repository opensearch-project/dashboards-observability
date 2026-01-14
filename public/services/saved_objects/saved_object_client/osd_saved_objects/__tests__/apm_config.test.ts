/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OSDSavedApmConfigClient } from '../apm_config';
import * as utils from '../../../../../../common/utils';

// Mock the utils module
jest.mock('../../../../../../common/utils', () => ({
  getOSDSavedObjectsClient: jest.fn(),
}));

describe('OSDSavedApmConfigClient', () => {
  let client: OSDSavedApmConfigClient;
  let mockSavedObjectsClient: any;
  let mockDataService: any;

  beforeEach(() => {
    mockSavedObjectsClient = {
      create: jest.fn(),
      update: jest.fn(),
      find: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
    };

    // Default mock dataService - tests can override as needed
    mockDataService = {
      dataViews: {
        get: jest.fn().mockResolvedValue(null),
      },
    };

    (utils.getOSDSavedObjectsClient as jest.Mock).mockReturnValue(mockSavedObjectsClient);
    client = new OSDSavedApmConfigClient(mockSavedObjectsClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create()', () => {
    const mockParams = {
      workspaceId: 'workspace-123',
      tracesDatasetId: 'trace-dataset-1',
      serviceMapDatasetId: 'service-map-dataset-1',
      prometheusDataSourceId: 'prometheus-ds-1',
    };

    const mockUuid = '12345678-1234-4234-8234-123456789abc';

    describe('Success Cases', () => {
      it('should create APM config with correct structure', async () => {
        const mockResponse = {
          id: mockUuid,
          type: 'correlations',
          attributes: {
            correlationType: 'APM-Config-workspace-123',
            version: '1.0.0',
            entities: [
              { tracesDataset: { id: 'references[0].id' } },
              { serviceMapDataset: { id: 'references[1].id' } },
              { prometheusDataSource: { id: 'references[2].id' } },
            ],
          },
        };

        mockSavedObjectsClient.create.mockResolvedValue(mockResponse);

        const result = await client.create(mockParams);

        expect(mockSavedObjectsClient.create).toHaveBeenCalledWith(
          'correlations',
          expect.objectContaining({
            correlationType: 'APM-Config-workspace-123',
            version: '1.0.0',
          }),
          expect.any(Object)
        );

        expect(result.objectId).toBe(`correlations:${mockUuid}`);
        expect(result.object).toEqual(mockResponse);
      });

      it('should create proper references array', async () => {
        const mockResponse = { id: mockUuid };
        mockSavedObjectsClient.create.mockResolvedValue(mockResponse);

        await client.create(mockParams);

        expect(mockSavedObjectsClient.create).toHaveBeenCalledWith(
          'correlations',
          expect.any(Object),
          {
            references: [
              {
                name: 'entities[0].index',
                type: 'index-pattern',
                id: 'trace-dataset-1',
              },
              {
                name: 'entities[1].index',
                type: 'index-pattern',
                id: 'service-map-dataset-1',
              },
              {
                name: 'entities[2].dataConnection',
                type: 'data-connection',
                id: 'prometheus-ds-1',
              },
            ],
          }
        );
      });

      it('should create proper entities array with reference placeholders', async () => {
        const mockResponse = { id: mockUuid };
        mockSavedObjectsClient.create.mockResolvedValue(mockResponse);

        await client.create(mockParams);

        expect(mockSavedObjectsClient.create).toHaveBeenCalledWith(
          'correlations',
          expect.objectContaining({
            entities: [
              { tracesDataset: { id: 'references[0].id' } },
              { serviceMapDataset: { id: 'references[1].id' } },
              { prometheusDataSource: { id: 'references[2].id' } },
            ],
          }),
          expect.any(Object)
        );
      });

      it('should set correlationType with APM-Config- prefix', async () => {
        const mockResponse = { id: mockUuid };
        mockSavedObjectsClient.create.mockResolvedValue(mockResponse);

        await client.create(mockParams);

        expect(mockSavedObjectsClient.create).toHaveBeenCalledWith(
          'correlations',
          expect.objectContaining({
            correlationType: 'APM-Config-workspace-123',
          }),
          expect.any(Object)
        );
      });

      it('should return objectId with prepended type', async () => {
        const mockResponse = { id: mockUuid };
        mockSavedObjectsClient.create.mockResolvedValue(mockResponse);

        const result = await client.create(mockParams);

        expect(result.objectId).toBe(`correlations:${mockUuid}`);
      });
    });

    describe('Failure Cases', () => {
      it('should handle create error from client', async () => {
        const mockError = new Error('Failed to create saved object');
        mockSavedObjectsClient.create.mockRejectedValue(mockError);

        await expect(client.create(mockParams)).rejects.toThrow('Failed to create saved object');
      });
    });
  });

  describe('update()', () => {
    const mockUuid = '12345678-1234-4234-8234-123456789abc';
    const mockUpdateParams = {
      objectId: `correlations:${mockUuid}`,
      tracesDatasetId: 'new-trace-dataset',
    };

    const mockExistingConfig = {
      id: mockUuid,
      attributes: {
        correlationType: 'APM-Config-workspace-123',
        version: '1.0.0',
        entities: [
          { tracesDataset: { id: 'references[0].id' } },
          { serviceMapDataset: { id: 'references[1].id' } },
          { prometheusDataSource: { id: 'references[2].id' } },
        ],
      },
      references: [
        { name: 'entities[0].index', type: 'index-pattern', id: 'old-trace-dataset' },
        { name: 'entities[1].index', type: 'index-pattern', id: 'old-service-map' },
        { name: 'entities[2].dataConnection', type: 'data-connection', id: 'old-prometheus' },
      ],
    };

    describe('Success Cases', () => {
      it('should update existing config', async () => {
        mockSavedObjectsClient.get.mockResolvedValue(mockExistingConfig);
        mockSavedObjectsClient.update.mockResolvedValue({ id: mockUuid });

        await client.update(mockUpdateParams);

        // extractTypeAndUUID correctly extracts just the UUID from 'correlations:uuid' format
        expect(mockSavedObjectsClient.update).toHaveBeenCalledWith(
          'correlations',
          mockUuid,
          expect.any(Object),
          expect.any(Object)
        );
      });

      it('should preserve unchanged values', async () => {
        mockSavedObjectsClient.get.mockResolvedValue(mockExistingConfig);
        mockSavedObjectsClient.update.mockResolvedValue({ id: mockUuid });

        await client.update(mockUpdateParams);

        const updateCall = mockSavedObjectsClient.update.mock.calls[0];
        const references = updateCall[3].references;

        expect(references[0].id).toBe('new-trace-dataset'); // Updated
        expect(references[1].id).toBe('old-service-map'); // Preserved
        expect(references[2].id).toBe('old-prometheus'); // Preserved
      });

      it('should extract UUID from objectId', async () => {
        mockSavedObjectsClient.get.mockResolvedValue(mockExistingConfig);
        mockSavedObjectsClient.update.mockResolvedValue({ id: mockUuid });

        await client.update(mockUpdateParams);

        // extractTypeAndUUID correctly extracts just the UUID from 'correlations:uuid' format
        expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('correlations', mockUuid);
        expect(mockSavedObjectsClient.update).toHaveBeenCalledWith(
          'correlations',
          mockUuid,
          expect.any(Object),
          expect.any(Object)
        );
      });

      it('should get existing config first', async () => {
        mockSavedObjectsClient.get.mockResolvedValue(mockExistingConfig);
        mockSavedObjectsClient.update.mockResolvedValue({ id: mockUuid });

        await client.update(mockUpdateParams);

        // Check that get was called before update
        expect(mockSavedObjectsClient.get).toHaveBeenCalled();
        expect(mockSavedObjectsClient.update).toHaveBeenCalled();

        // Verify get was called first by checking call order
        const getCalls = mockSavedObjectsClient.get.mock.invocationCallOrder[0];
        const updateCalls = mockSavedObjectsClient.update.mock.invocationCallOrder[0];
        expect(getCalls).toBeLessThan(updateCalls);
      });

      it('should preserve correlationType and version from existing config', async () => {
        mockSavedObjectsClient.get.mockResolvedValue(mockExistingConfig);
        mockSavedObjectsClient.update.mockResolvedValue({ id: mockUuid });

        await client.update(mockUpdateParams);

        // extractTypeAndUUID correctly extracts just the UUID from 'correlations:uuid' format
        expect(mockSavedObjectsClient.update).toHaveBeenCalledWith(
          'correlations',
          mockUuid,
          expect.objectContaining({
            correlationType: 'APM-Config-workspace-123',
            version: '1.0.0',
          }),
          expect.any(Object)
        );
      });

      it('should return objectId with prepended type', async () => {
        mockSavedObjectsClient.get.mockResolvedValue(mockExistingConfig);
        mockSavedObjectsClient.update.mockResolvedValue({ id: mockUuid });

        const result = await client.update(mockUpdateParams);

        expect(result.objectId).toBe(`correlations:${mockUuid}`);
      });

      it('should resolve existing references correctly regardless of entity order', async () => {
        // Existing config with entities in different order (prometheus first)
        const configWithDifferentOrder = {
          id: mockUuid,
          attributes: {
            correlationType: 'APM-Config-workspace-123',
            version: '1.0.0',
            entities: [
              { prometheusDataSource: { id: 'references[0].id' } },
              { tracesDataset: { id: 'references[1].id' } },
              { serviceMapDataset: { id: 'references[2].id' } },
            ],
          },
          references: [
            { name: 'entities[0].dataConnection', type: 'data-connection', id: 'old-prometheus' },
            { name: 'entities[1].index', type: 'index-pattern', id: 'old-trace-dataset' },
            { name: 'entities[2].index', type: 'index-pattern', id: 'old-service-map' },
          ],
        };

        mockSavedObjectsClient.get.mockResolvedValue(configWithDifferentOrder);
        mockSavedObjectsClient.update.mockResolvedValue({ id: mockUuid });

        // Only update traces, preserve others
        await client.update({
          objectId: `correlations:${mockUuid}`,
          tracesDatasetId: 'new-traces',
        });

        const updateCall = mockSavedObjectsClient.update.mock.calls[0];
        const references = updateCall[3].references;

        // Should correctly preserve existing values based on entity type, not index
        expect(references[0].id).toBe('new-traces'); // Updated traces
        expect(references[1].id).toBe('old-service-map'); // Preserved service map
        expect(references[2].id).toBe('old-prometheus'); // Preserved prometheus
      });
    });

    describe('Failure Cases', () => {
      it('should handle missing existing config', async () => {
        const mockError = new Error('Saved object not found');
        mockSavedObjectsClient.get.mockRejectedValue(mockError);

        await expect(client.update(mockUpdateParams)).rejects.toThrow('Saved object not found');
      });

      it('should handle update error from client', async () => {
        mockSavedObjectsClient.get.mockResolvedValue(mockExistingConfig);
        const mockError = new Error('Failed to update saved object');
        mockSavedObjectsClient.update.mockRejectedValue(mockError);

        await expect(client.update(mockUpdateParams)).rejects.toThrow(
          'Failed to update saved object'
        );
      });
    });
  });

  describe('getBulkWithResolvedReferences()', () => {
    describe('Basic behavior', () => {
      it('should fetch all correlations', async () => {
        mockSavedObjectsClient.find.mockResolvedValue({
          savedObjects: [],
        });

        await client.getBulkWithResolvedReferences(mockDataService);

        expect(mockSavedObjectsClient.find).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'correlations',
            perPage: 1000,
          })
        );
      });

      it('should filter for APM-Config- prefix', async () => {
        const mockResponse = {
          savedObjects: [
            {
              id: 'config-1',
              attributes: {
                correlationType: 'APM-Config-workspace-1',
                version: '1.0.0',
                entities: [],
              },
              references: [],
            },
            {
              id: 'correlation-1',
              attributes: {
                correlationType: 'APM-Correlation',
                version: '1.0.0',
                entities: [],
              },
              references: [],
            },
            {
              id: 'config-2',
              attributes: {
                correlationType: 'APM-Config-workspace-2',
                version: '1.0.0',
                entities: [],
              },
              references: [],
            },
          ],
        };

        mockSavedObjectsClient.find.mockResolvedValue(mockResponse);

        const result = await client.getBulkWithResolvedReferences(mockDataService);

        expect(result.total).toBe(2);
        expect(result.configs).toHaveLength(2);
        expect(result.configs.every((c) => c.correlationType.startsWith('APM-Config-'))).toBe(true);
      });

      it('should return dataset ids as titles when dataViews.get fails', async () => {
        const mockResponse = {
          savedObjects: [
            {
              id: 'config-1',
              attributes: {
                correlationType: 'APM-Config-workspace-1',
                version: '1.0.0',
                entities: [
                  { tracesDataset: { id: 'references[0].id' } },
                  { serviceMapDataset: { id: 'references[1].id' } },
                  { prometheusDataSource: { id: 'references[2].id' } },
                ],
              },
              references: [
                { name: 'entities[0].index', type: 'index-pattern', id: 'trace-1' },
                { name: 'entities[1].index', type: 'index-pattern', id: 'service-map-1' },
                { name: 'entities[2].dataConnection', type: 'data-connection', id: 'prom-1' },
              ],
            },
          ],
        };

        mockSavedObjectsClient.find.mockResolvedValue(mockResponse);
        mockSavedObjectsClient.get.mockResolvedValue({
          attributes: { title: 'Prometheus Source' },
        });
        // Mock dataViews.get to return null (simulating failure/not found)
        mockDataService.dataViews.get.mockResolvedValue(null);

        const result = await client.getBulkWithResolvedReferences(mockDataService);

        // When dataViews.get returns null, datasets use id as fallback title
        expect(result.configs[0].tracesDataset).toEqual({
          id: 'trace-1',
          title: 'trace-1',
          name: undefined,
          datasourceId: undefined,
        });
        expect(result.configs[0].serviceMapDataset).toEqual({
          id: 'service-map-1',
          title: 'service-map-1',
          name: undefined,
          datasourceId: undefined,
        });
        // Prometheus still uses savedObjectsClient.get
        expect(result.configs[0].prometheusDataSource).toEqual({
          id: 'prom-1',
          title: 'Prometheus Source',
        });
      });

      it('should handle missing references gracefully', async () => {
        const mockResponse = {
          savedObjects: [
            {
              id: 'config-1',
              attributes: {
                correlationType: 'APM-Config-workspace-1',
                version: '1.0.0',
                entities: [],
              },
              references: [],
            },
          ],
        };

        mockSavedObjectsClient.find.mockResolvedValue(mockResponse);

        const result = await client.getBulkWithResolvedReferences(mockDataService);

        expect(result.configs[0].tracesDataset).toBeNull();
        expect(result.configs[0].serviceMapDataset).toBeNull();
        expect(result.configs[0].prometheusDataSource).toBeNull();
      });

      it('should return correct structure with objectId', async () => {
        const mockResponse = {
          savedObjects: [
            {
              id: 'config-1',
              attributes: {
                correlationType: 'APM-Config-workspace-1',
                version: '1.0.0',
                entities: [],
              },
              references: [],
            },
          ],
        };

        mockSavedObjectsClient.find.mockResolvedValue(mockResponse);

        const result = await client.getBulkWithResolvedReferences(mockDataService);

        expect(result.configs[0].objectId).toBe('correlations:config-1');
        expect(result.configs[0].correlationType).toBe('APM-Config-workspace-1');
        expect(result.configs[0].version).toBe('1.0.0');
      });

      it('should use connectionId for Prometheus title', async () => {
        const mockResponse = {
          savedObjects: [
            {
              id: 'config-1',
              attributes: {
                correlationType: 'APM-Config-workspace-1',
                version: '1.0.0',
                entities: [{ prometheusDataSource: { id: 'references[0].id' } }],
              },
              references: [
                { name: 'entities[0].dataConnection', type: 'data-connection', id: 'prom-1' },
              ],
            },
          ],
        };

        mockSavedObjectsClient.find.mockResolvedValue(mockResponse);
        mockSavedObjectsClient.get.mockResolvedValue({
          attributes: { connectionId: 'prometheus-prod' },
        });

        const result = await client.getBulkWithResolvedReferences(mockDataService);

        expect(result.configs[0].prometheusDataSource?.title).toBe('prometheus-prod');
      });

      it('should resolve entities regardless of their order in array', async () => {
        // Entities in different order than standard (prometheus first, then service map, then traces)
        const mockResponse = {
          savedObjects: [
            {
              id: 'config-1',
              attributes: {
                correlationType: 'APM-Config-workspace-1',
                version: '1.0.0',
                entities: [
                  { prometheusDataSource: { id: 'references[0].id' } },
                  { serviceMapDataset: { id: 'references[1].id' } },
                  { tracesDataset: { id: 'references[2].id' } },
                ],
              },
              references: [
                { name: 'entities[0].dataConnection', type: 'data-connection', id: 'prom-1' },
                { name: 'entities[1].index', type: 'index-pattern', id: 'service-map-1' },
                { name: 'entities[2].index', type: 'index-pattern', id: 'trace-1' },
              ],
            },
          ],
        };

        mockSavedObjectsClient.find.mockResolvedValue(mockResponse);
        mockSavedObjectsClient.get.mockResolvedValue({
          attributes: { connectionId: 'prometheus-prod' },
        });

        const result = await client.getBulkWithResolvedReferences(mockDataService);

        // Should correctly resolve based on entity type, not index
        expect(result.configs[0].tracesDataset?.id).toBe('trace-1');
        expect(result.configs[0].serviceMapDataset?.id).toBe('service-map-1');
        expect(result.configs[0].prometheusDataSource?.id).toBe('prom-1');
      });
    });

    describe('With dataViews resolution', () => {
      let mockDataServiceWithViews: any;
      let mockDataViews: any;

      beforeEach(() => {
        mockDataViews = {
          get: jest.fn(),
        };
        mockDataServiceWithViews = {
          dataViews: mockDataViews,
        };
      });

      it('should use dataViews.get to resolve dataset info', async () => {
        const mockResponse = {
          savedObjects: [
            {
              id: 'config-1',
              attributes: {
                correlationType: 'APM-Config-workspace-1',
                version: '1.0.0',
                entities: [
                  { tracesDataset: { id: 'references[0].id' } },
                  { serviceMapDataset: { id: 'references[1].id' } },
                  { prometheusDataSource: { id: 'references[2].id' } },
                ],
              },
              references: [
                { name: 'entities[0].index', type: 'index-pattern', id: 'trace-1' },
                { name: 'entities[1].index', type: 'index-pattern', id: 'service-map-1' },
                { name: 'entities[2].dataConnection', type: 'data-connection', id: 'prom-1' },
              ],
            },
          ],
        };

        mockSavedObjectsClient.find.mockResolvedValue(mockResponse);

        // Mock DataView responses with getDisplayName method
        mockDataViews.get
          .mockResolvedValueOnce({
            title: 'traces-index-*',
            getDisplayName: () => 'Traces Dataset',
            dataSourceRef: { id: 'opensearch-ds-1' },
          })
          .mockResolvedValueOnce({
            title: 'service-map-index-*',
            getDisplayName: () => 'Service Map Dataset',
            dataSourceRef: { id: 'opensearch-ds-2' },
          });

        mockSavedObjectsClient.get.mockResolvedValue({
          attributes: { connectionId: 'prometheus-prod' },
        });

        const result = await client.getBulkWithResolvedReferences(mockDataServiceWithViews);

        expect(mockDataViews.get).toHaveBeenCalledWith('trace-1');
        expect(mockDataViews.get).toHaveBeenCalledWith('service-map-1');

        expect(result.configs[0].tracesDataset).toEqual({
          id: 'trace-1',
          title: 'traces-index-*',
          name: 'Traces Dataset',
          datasourceId: 'opensearch-ds-1',
        });
        expect(result.configs[0].serviceMapDataset).toEqual({
          id: 'service-map-1',
          title: 'service-map-index-*',
          name: 'Service Map Dataset',
          datasourceId: 'opensearch-ds-2',
        });
        expect(result.configs[0].prometheusDataSource).toEqual({
          id: 'prom-1',
          title: 'prometheus-prod',
        });
      });

      it('should handle dataViews.get errors gracefully', async () => {
        const mockResponse = {
          savedObjects: [
            {
              id: 'config-1',
              attributes: {
                correlationType: 'APM-Config-workspace-1',
                version: '1.0.0',
                entities: [
                  { tracesDataset: { id: 'references[0].id' } },
                  { serviceMapDataset: { id: 'references[1].id' } },
                ],
              },
              references: [
                { name: 'entities[0].index', type: 'index-pattern', id: 'trace-1' },
                { name: 'entities[1].index', type: 'index-pattern', id: 'service-map-1' },
              ],
            },
          ],
        };

        mockSavedObjectsClient.find.mockResolvedValue(mockResponse);
        mockDataViews.get
          .mockRejectedValueOnce(new Error('Dataset not found'))
          .mockResolvedValueOnce({
            title: 'service-map-index-*',
            getDisplayName: () => 'Service Map',
            dataSourceRef: { id: 'ds-1' },
          });

        const result = await client.getBulkWithResolvedReferences(mockDataServiceWithViews);

        // First dataset failed, so uses id as fallback title
        expect(result.configs[0].tracesDataset).toEqual({
          id: 'trace-1',
          title: 'trace-1',
          name: undefined,
          datasourceId: undefined,
        });
        // Second dataset succeeded
        expect(result.configs[0].serviceMapDataset).toEqual({
          id: 'service-map-1',
          title: 'service-map-index-*',
          name: 'Service Map',
          datasourceId: 'ds-1',
        });
      });
    });

    describe('Failure Cases', () => {
      it('should handle find error', async () => {
        const mockError = new Error('Failed to find correlations');
        mockSavedObjectsClient.find.mockRejectedValue(mockError);

        await expect(client.getBulkWithResolvedReferences(mockDataService)).rejects.toThrow(
          'Failed to find correlations'
        );
      });

      it('should handle prometheus get error and return null', async () => {
        const mockResponse = {
          savedObjects: [
            {
              id: 'config-1',
              attributes: {
                correlationType: 'APM-Config-workspace-1',
                version: '1.0.0',
                entities: [{ prometheusDataSource: { id: 'references[0].id' } }],
              },
              references: [
                { name: 'entities[0].dataConnection', type: 'data-connection', id: 'prom-1' },
              ],
            },
          ],
        };

        mockSavedObjectsClient.find.mockResolvedValue(mockResponse);
        mockSavedObjectsClient.get.mockRejectedValue(new Error('Connection not found'));

        const result = await client.getBulkWithResolvedReferences(mockDataService);

        expect(result.configs[0].prometheusDataSource).toBeNull();
      });
    });
  });

  describe('delete()', () => {
    const mockUuid = '12345678-1234-4234-8234-123456789abc';

    describe('Success Cases', () => {
      it('should extract UUID and delete', async () => {
        mockSavedObjectsClient.delete.mockResolvedValue({});

        await client.delete({ objectId: `correlations:${mockUuid}` });

        // extractTypeAndUUID correctly extracts just the UUID from 'correlations:uuid' format
        expect(mockSavedObjectsClient.delete).toHaveBeenCalledWith('correlations', mockUuid);
      });

      it('should return delete response', async () => {
        const mockResponse = { success: true };
        mockSavedObjectsClient.delete.mockResolvedValue(mockResponse);

        const result = await client.delete({ objectId: `correlations:${mockUuid}` });

        expect(result).toEqual(mockResponse);
      });
    });

    describe('Failure Cases', () => {
      it('should handle delete error', async () => {
        const mockError = new Error('Failed to delete saved object');
        mockSavedObjectsClient.delete.mockRejectedValue(mockError);

        await expect(client.delete({ objectId: `correlations:${mockUuid}` })).rejects.toThrow(
          'Failed to delete saved object'
        );
      });
    });
  });

  describe('getInstance()', () => {
    beforeEach(() => {
      // Reset the singleton instance before each test
      (OSDSavedApmConfigClient as any).instance = undefined;
    });

    describe('Success Cases', () => {
      it('should return singleton instance', () => {
        const instance1 = OSDSavedApmConfigClient.getInstance();
        const instance2 = OSDSavedApmConfigClient.getInstance();

        expect(instance1).toBe(instance2);
        expect(instance1).toBeInstanceOf(OSDSavedApmConfigClient);
      });

      it('should reuse same instance on multiple calls', () => {
        const instance1 = OSDSavedApmConfigClient.getInstance();
        const instance2 = OSDSavedApmConfigClient.getInstance();
        const instance3 = OSDSavedApmConfigClient.getInstance();

        expect(instance1).toBe(instance2);
        expect(instance2).toBe(instance3);
        expect(utils.getOSDSavedObjectsClient).toHaveBeenCalledTimes(1);
      });
    });
  });
});
