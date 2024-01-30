/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IntegrationsManager } from '../integrations_manager';
import { SavedObject, SavedObjectsClientContract } from '../../../../../../src/core/server/types';
import { TemplateManager } from '../repository/repository';
import { IntegrationInstanceBuilder } from '../integrations_builder';
import { IntegrationReader } from '../repository/integration_reader';
import { SavedObjectsFindResponse } from '../../../../../../src/core/server';

describe('IntegrationsKibanaBackend', () => {
  let mockSavedObjectsClient: jest.Mocked<SavedObjectsClientContract>;
  let mockRepository: jest.Mocked<TemplateManager>;
  let backend: IntegrationsManager;

  beforeEach(() => {
    mockSavedObjectsClient = {
      get: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    } as any;
    mockRepository = {
      getIntegration: jest.fn(),
      getIntegrationList: jest.fn(),
    } as any;
    backend = new IntegrationsManager(mockSavedObjectsClient, mockRepository);
  });

  describe('deleteIntegrationInstance', () => {
    it('should delete the integration instance and associated assets', async () => {
      const instanceId = 'instance-id';
      const asset1Id = 'asset1-id';
      const asset2Id = 'asset2-id';

      const instanceData = {
        attributes: {
          assets: [
            { assetId: asset1Id, assetType: 'asset-type-1' },
            { assetId: asset2Id, assetType: 'asset-type-2' },
          ],
        },
      };

      mockSavedObjectsClient.get.mockResolvedValue(instanceData as SavedObject<unknown>);
      mockSavedObjectsClient.delete.mockResolvedValueOnce({});
      mockSavedObjectsClient.delete.mockResolvedValueOnce({});
      mockSavedObjectsClient.delete.mockResolvedValueOnce({});

      const result = await backend.deleteIntegrationInstance(instanceId);

      expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('integration-instance', instanceId);
      expect(mockSavedObjectsClient.delete).toHaveBeenCalledWith('asset-type-1', asset1Id);
      expect(mockSavedObjectsClient.delete).toHaveBeenCalledWith('asset-type-2', asset2Id);
      expect(mockSavedObjectsClient.delete).toHaveBeenCalledWith(
        'integration-instance',
        instanceId
      );
      expect(result).toEqual([asset1Id, asset2Id, instanceId]);
    });

    it('should handle a 404 error when getting the integration instance', async () => {
      const instanceId = 'instance-id';

      mockSavedObjectsClient.get.mockRejectedValue({ output: { statusCode: 404 } });

      const result = await backend.deleteIntegrationInstance(instanceId);

      expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('integration-instance', instanceId);
      expect(result).toEqual([instanceId]);
    });

    it('should handle a non-404 error when getting the integration instance', async () => {
      const instanceId = 'instance-id';
      const error = new Error('Internal Server Error');

      mockSavedObjectsClient.get.mockRejectedValue(error);

      await expect(backend.deleteIntegrationInstance(instanceId)).rejects.toThrow(error);
      expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('integration-instance', instanceId);
    });

    it('should handle a 404 error when deleting assets', async () => {
      const instanceId = 'instance-id';
      const asset1Id = 'asset1-id';
      const asset2Id = 'asset2-id';

      const instanceData = {
        attributes: {
          assets: [
            { assetId: asset1Id, assetType: 'asset-type-1' },
            { assetId: asset2Id, assetType: 'asset-type-2' },
          ],
        },
      };

      mockSavedObjectsClient.get.mockResolvedValue(instanceData as SavedObject<unknown>);
      mockSavedObjectsClient.delete.mockRejectedValueOnce({ output: { statusCode: 404 } });
      mockSavedObjectsClient.delete.mockRejectedValueOnce({ output: { statusCode: 404 } });
      mockSavedObjectsClient.delete.mockRejectedValueOnce({ output: { statusCode: 404 } });

      const result = await backend.deleteIntegrationInstance(instanceId);

      expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('integration-instance', instanceId);
      expect(mockSavedObjectsClient.delete).toHaveBeenCalledWith('asset-type-1', asset1Id);
      expect(mockSavedObjectsClient.delete).toHaveBeenCalledWith('asset-type-2', asset2Id);
      expect(mockSavedObjectsClient.delete).toHaveBeenCalledWith(
        'integration-instance',
        instanceId
      );
      expect(result).toEqual([asset1Id, asset2Id, instanceId]);
    });

    it('should handle a non-404 error when deleting assets', async () => {
      const instanceId = 'instance-id';
      const asset1Id = 'asset1-id';
      const asset2Id = 'asset2-id';

      const instanceData = {
        attributes: {
          assets: [
            { assetId: asset1Id, assetType: 'asset-type-1' },
            { assetId: asset2Id, assetType: 'asset-type-2' },
          ],
        },
      };

      const error = new Error('Internal Server Error');

      mockSavedObjectsClient.get.mockResolvedValue(instanceData as SavedObject<unknown>);
      mockSavedObjectsClient.delete.mockRejectedValueOnce({ output: { statusCode: 404 } });
      mockSavedObjectsClient.delete.mockRejectedValueOnce(error);

      await expect(backend.deleteIntegrationInstance(instanceId)).rejects.toThrow(error);
      expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('integration-instance', instanceId);
      expect(mockSavedObjectsClient.delete).toHaveBeenCalledWith('asset-type-1', asset1Id);
      expect(mockSavedObjectsClient.delete).toHaveBeenCalledWith('asset-type-2', asset2Id);
      expect(mockSavedObjectsClient.delete).toHaveBeenCalledWith(
        'integration-instance',
        instanceId
      );
    });
  });

  describe('getIntegrationTemplates', () => {
    it('should get integration templates by name', async () => {
      const query = { name: 'template1' };
      const integration = {
        getConfig: jest.fn().mockResolvedValue({ ok: true, value: { name: 'template1' } }),
      };
      mockRepository.getIntegration.mockResolvedValue(
        (integration as unknown) as IntegrationReader
      );

      const result = await backend.getIntegrationTemplates(query);

      expect(mockRepository.getIntegration).toHaveBeenCalledWith(query.name);
      expect(integration.getConfig).toHaveBeenCalled();
      expect(result).toEqual({ hits: [{ name: 'template1' }] });
    });

    it('should get all integration templates', async () => {
      const integrationList = [
        { getConfig: jest.fn().mockResolvedValue({ ok: true, value: { name: 'template1' } }) },
        { getConfig: jest.fn().mockResolvedValue({ ok: false, error: new Error() }) },
        { getConfig: jest.fn().mockResolvedValue({ ok: true, value: { name: 'template2' } }) },
      ];
      mockRepository.getIntegrationList.mockResolvedValue(
        (integrationList as unknown) as IntegrationReader[]
      );

      const result = await backend.getIntegrationTemplates();

      expect(mockRepository.getIntegrationList).toHaveBeenCalled();
      expect(integrationList[0].getConfig).toHaveBeenCalled();
      expect(integrationList[1].getConfig).toHaveBeenCalled();
      expect(integrationList[2].getConfig).toHaveBeenCalled();
      expect(result).toEqual({
        hits: [{ name: 'template1' }, { name: 'template2' }],
      });
    });
  });

  describe('getIntegrationInstances', () => {
    it('should get all integration instances', async () => {
      const savedObjects = [
        { id: 'instance1', attributes: { name: 'instance1' } },
        { id: 'instance2', attributes: { name: 'instance2' } },
      ];
      const findResult = { total: savedObjects.length, saved_objects: savedObjects };
      mockSavedObjectsClient.find.mockResolvedValue(
        (findResult as unknown) as SavedObjectsFindResponse
      );

      const result = await backend.getIntegrationInstances();

      expect(mockSavedObjectsClient.find).toHaveBeenCalledWith({ type: 'integration-instance' });
      expect(result).toEqual({
        total: findResult.total,
        hits: savedObjects.map((obj) => ({ id: obj.id, ...obj.attributes })),
      });
    });
  });

  describe('getIntegrationInstance', () => {
    it('should get integration instance by ID', async () => {
      const instanceId = 'instance1';
      const integrationInstance = { id: instanceId, attributes: { name: 'instance1' } };
      mockSavedObjectsClient.get.mockResolvedValue(integrationInstance as SavedObject<unknown>);

      const result = await backend.getIntegrationInstance({ id: instanceId });

      expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('integration-instance', instanceId);
      expect(result).toEqual({ id: instanceId, status: 'available', name: 'instance1' });
    });
  });

  describe('loadIntegrationInstance', () => {
    it('should load and create an integration instance', async () => {
      const templateName = 'template1';
      const name = 'instance1';
      const template = {
        getConfig: jest.fn().mockResolvedValue({ name: templateName }),
      };
      const instanceBuilder = {
        build: jest.fn().mockResolvedValue({ name, dataset: 'nginx', namespace: 'prod' }),
      };
      const createdInstance = { name, dataset: 'nginx', namespace: 'prod' };
      mockRepository.getIntegration.mockResolvedValue((template as unknown) as IntegrationReader);
      mockSavedObjectsClient.create.mockResolvedValue(({
        result: 'created',
      } as unknown) as SavedObject);
      backend.instanceBuilder = (instanceBuilder as unknown) as IntegrationInstanceBuilder;

      const result = await backend.loadIntegrationInstance(templateName, name, 'datasource');

      expect(mockRepository.getIntegration).toHaveBeenCalledWith(templateName);
      expect(instanceBuilder.build).toHaveBeenCalledWith(template, {
        name,
        dataSource: 'datasource',
      });
      expect(mockSavedObjectsClient.create).toHaveBeenCalledWith(
        'integration-instance',
        createdInstance
      );
      expect(result).toEqual(createdInstance);
    });

    it('should reject with a 404 if template is not found', async () => {
      const templateName = 'template1';
      mockRepository.getIntegration.mockResolvedValue(null);

      await expect(
        backend.loadIntegrationInstance(templateName, 'instance1', 'datasource')
      ).rejects.toHaveProperty('statusCode', 404);
    });

    it('should reject with an error status if building fails', async () => {
      const templateName = 'template1';
      const name = 'instance1';
      const template = {
        getConfig: jest.fn().mockResolvedValue({ name: templateName }),
      };
      const instanceBuilder = {
        build: jest.fn().mockRejectedValue(new Error('Failed to build instance')),
      };
      backend.instanceBuilder = (instanceBuilder as unknown) as IntegrationInstanceBuilder;
      mockRepository.getIntegration.mockResolvedValue((template as unknown) as IntegrationReader);

      await expect(
        backend.loadIntegrationInstance(templateName, name, 'datasource')
      ).rejects.toHaveProperty('statusCode');
    });
  });

  describe('getStatic', () => {
    it('should get static asset data', async () => {
      const templateName = 'template1';
      const staticPath = 'path/to/static';
      const assetData = Buffer.from('asset data');
      const integration = {
        getStatic: jest.fn().mockResolvedValue({ ok: true, value: assetData }),
      };
      mockRepository.getIntegration.mockResolvedValue(
        (integration as unknown) as IntegrationReader
      );

      const result = await backend.getStatic(templateName, staticPath);

      expect(mockRepository.getIntegration).toHaveBeenCalledWith(templateName);
      expect(integration.getStatic).toHaveBeenCalledWith(staticPath);
      expect(result).toEqual(assetData);
    });

    it('should reject with a 404 if integration is not found', async () => {
      const templateName = 'template1';
      const staticPath = 'path/to/static';
      mockRepository.getIntegration.mockResolvedValue(null);

      await expect(backend.getStatic(templateName, staticPath)).rejects.toHaveProperty(
        'statusCode',
        404
      );
    });

    it('should reject with a 404 if static data is not found', async () => {
      const templateName = 'template1';
      const staticPath = 'path/to/static';
      mockRepository.getIntegration.mockResolvedValue({
        getStatic: jest.fn().mockResolvedValue({
          ok: false,
          error: { message: 'Not found', code: 'ENOENT' },
        }),
      } as any);

      await expect(backend.getStatic(templateName, staticPath)).rejects.toHaveProperty(
        'statusCode',
        404
      );
    });
  });

  describe('getSchemas', () => {
    it('should get schema data', async () => {
      const templateName = 'template1';
      const schemaData = { mappings: { test: {} } };
      const integration = {
        getSchemas: jest.fn().mockResolvedValue({ ok: true, value: schemaData }),
      };
      mockRepository.getIntegration.mockResolvedValue(
        (integration as unknown) as IntegrationReader
      );

      const result = await backend.getSchemas(templateName);

      expect(mockRepository.getIntegration).toHaveBeenCalledWith(templateName);
      expect(integration.getSchemas).toHaveBeenCalled();
      expect(result).toEqual(schemaData);
    });

    it('should reject with a 404 if integration is not found', async () => {
      const templateName = 'template1';
      mockRepository.getIntegration.mockResolvedValue(null);

      await expect(backend.getSchemas(templateName)).rejects.toHaveProperty('statusCode', 404);
    });

    it('should reject with a 404 if schema data is not found', async () => {
      const templateName = 'template1';
      mockRepository.getIntegration.mockResolvedValue({
        getSchemas: jest.fn().mockResolvedValue({
          ok: false,
          error: { message: 'Not found', code: 'ENOENT' },
        }),
      } as any);

      await expect(backend.getSchemas(templateName)).rejects.toHaveProperty('statusCode', 404);
    });
  });

  describe('getAssets', () => {
    it('should get asset data', async () => {
      const templateName = 'template1';
      const assetData = { savedObjects: [{ test: true }] };
      const integration = {
        getAssets: jest.fn().mockResolvedValue({ ok: true, value: assetData }),
      };
      mockRepository.getIntegration.mockResolvedValue(
        (integration as unknown) as IntegrationReader
      );

      const result = await backend.getAssets(templateName);

      expect(mockRepository.getIntegration).toHaveBeenCalledWith(templateName);
      expect(integration.getAssets).toHaveBeenCalled();
      expect(result).toEqual(assetData);
    });

    it('should reject with a 404 if integration is not found', async () => {
      const templateName = 'template1';
      mockRepository.getIntegration.mockResolvedValue(null);

      await expect(backend.getAssets(templateName)).rejects.toHaveProperty('statusCode', 404);
    });

    it('should reject with a 404 if asset data is not found', async () => {
      const templateName = 'template1';
      mockRepository.getIntegration.mockResolvedValue({
        getAssets: jest.fn().mockResolvedValue({
          ok: false,
          error: { message: 'Not found', code: 'ENOENT' },
        }),
      } as any);

      await expect(backend.getAssets(templateName)).rejects.toHaveProperty('statusCode', 404);
    });
  });

  describe('getSampleData', () => {
    it('should get sample data', async () => {
      const templateName = 'template1';
      const sampleData = { sampleData: [{ test: true }] };
      const integration = {
        getSampleData: jest.fn().mockResolvedValue({ ok: true, value: sampleData }),
      };
      mockRepository.getIntegration.mockResolvedValue(
        (integration as unknown) as IntegrationReader
      );

      const result = await backend.getSampleData(templateName);

      expect(mockRepository.getIntegration).toHaveBeenCalledWith(templateName);
      expect(integration.getSampleData).toHaveBeenCalled();
      expect(result).toEqual(sampleData);
    });

    it('should reject with a 404 if integration is not found', async () => {
      const templateName = 'template1';
      mockRepository.getIntegration.mockResolvedValue(null);

      await expect(backend.getSampleData(templateName)).rejects.toHaveProperty('statusCode', 404);
    });

    it('should reject with a 404 if sample data is not found', async () => {
      const templateName = 'template1';
      mockRepository.getIntegration.mockResolvedValue({
        getSampleData: jest.fn().mockResolvedValue({
          ok: false,
          error: { message: 'Not found', code: 'ENOENT' },
        }),
      } as any);

      await expect(backend.getSampleData(templateName)).rejects.toHaveProperty('statusCode', 404);
    });
  });

  describe('getAssetStatus', () => {
    it('should return "available" if all assets are available', async () => {
      const assets = [
        { assetId: 'asset1', assetType: 'type1' },
        { assetId: 'asset2', assetType: 'type2' },
      ];

      const result = await backend.getAssetStatus(assets as AssetReference[]);

      expect(result).toBe('available');
      expect(mockSavedObjectsClient.get).toHaveBeenCalledTimes(2);
      expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('type1', 'asset1');
      expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('type2', 'asset2');
    });

    it('should return "unavailable" if every asset is unavailable', async () => {
      mockSavedObjectsClient.get = jest
        .fn()
        .mockRejectedValueOnce({ output: { statusCode: 404 } })
        .mockRejectedValueOnce({ output: { statusCode: 404 } })
        .mockRejectedValueOnce({ output: { statusCode: 404 } });

      const assets = [
        { assetId: 'asset1', assetType: 'type1' },
        { assetId: 'asset2', assetType: 'type2' },
        { assetId: 'asset3', assetType: 'type3' },
      ];

      const result = await backend.getAssetStatus(assets as AssetReference[]);

      expect(result).toBe('unavailable');
      expect(mockSavedObjectsClient.get).toHaveBeenCalledTimes(3);
      expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('type1', 'asset1');
      expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('type2', 'asset2');
      expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('type3', 'asset3');
    });

    it('should return "partially-available" if some assets are available and some are unavailable', async () => {
      mockSavedObjectsClient.get = jest
        .fn()
        .mockResolvedValueOnce({}) // Available
        .mockRejectedValueOnce({ output: { statusCode: 404 } }) // Unavailable
        .mockResolvedValueOnce({}); // Available

      const assets = [
        { assetId: 'asset1', assetType: 'type1' },
        { assetId: 'asset2', assetType: 'type2' },
        { assetId: 'asset3', assetType: 'type3' },
      ];

      const result = await backend.getAssetStatus(assets as AssetReference[]);

      expect(result).toBe('partially-available');
      expect(mockSavedObjectsClient.get).toHaveBeenCalledTimes(3);
      expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('type1', 'asset1');
      expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('type2', 'asset2');
      expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('type3', 'asset3');
    });

    it('should return "unknown" if at least one asset has an unknown status', async () => {
      mockSavedObjectsClient.get = jest
        .fn()
        .mockResolvedValueOnce({}) // Available
        .mockRejectedValueOnce({}) // Unknown
        .mockResolvedValueOnce({}); // Available

      const assets = [
        { assetId: 'asset1', assetType: 'type1' },
        { assetId: 'asset2', assetType: 'type2' },
        { assetId: 'asset3', assetType: 'type3' },
      ];

      const result = await backend.getAssetStatus(assets as AssetReference[]);

      expect(result).toBe('unknown');
      expect(mockSavedObjectsClient.get).toHaveBeenCalledTimes(3);
      expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('type1', 'asset1');
      expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('type2', 'asset2');
      expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('type3', 'asset3');
    });
  });
});
