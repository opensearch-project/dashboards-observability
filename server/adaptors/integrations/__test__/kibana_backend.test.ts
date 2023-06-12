/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IntegrationsKibanaBackend } from '../integrations_kibana_backend';
import { SavedObjectsClientContract } from '../../../../../../src/core/server/types';
import { Repository } from '../repository/repository';
import { IntegrationInstanceBuilder } from '../integrations_builder';

describe('IntegrationsKibanaBackend', () => {
  let mockSavedObjectsClient: SavedObjectsClientContract;
  let mockRepository: Repository;
  let backend: IntegrationsKibanaBackend;

  beforeEach(() => {
    mockSavedObjectsClient = {
      get: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    };
    mockRepository = {
      getIntegration: jest.fn(),
      getIntegrationList: jest.fn(),
    };
    backend = new IntegrationsKibanaBackend(mockSavedObjectsClient, mockRepository);
  });

  describe('deleteIntegrationInstance', () => {
    it('should delete integration instance and its assets', async () => {
      const instanceId = 'instance1';
      const integrationInstance = {
        attributes: {
          assets: [
            { assetType: 'dashboard', assetId: 'dashboard1' },
            { assetType: 'visualization', assetId: 'visualization1' },
          ],
        },
      };
      const deleteResult = { result: 'deleted' };
      mockSavedObjectsClient.get.mockResolvedValue(integrationInstance);
      mockSavedObjectsClient.delete.mockResolvedValue(deleteResult);

      const result = await backend.deleteIntegrationInstance(instanceId);

      expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('integration-instance', instanceId);
      expect(mockSavedObjectsClient.delete).toHaveBeenCalledWith('dashboard', 'dashboard1');
      expect(mockSavedObjectsClient.delete).toHaveBeenCalledWith('visualization', 'visualization1');
      expect(mockSavedObjectsClient.delete).toHaveBeenCalledWith(
        'integration-instance',
        instanceId
      );
      expect(result).toEqual(deleteResult);
    });
  });

  describe('getIntegrationTemplates', () => {
    it('should get integration templates by name', async () => {
      const query = { name: 'template1' };
      const integration = { getConfig: jest.fn().mockResolvedValue({ name: 'template1' }) };
      mockRepository.getIntegration.mockResolvedValue(integration);

      const result = await backend.getIntegrationTemplates(query);

      expect(mockRepository.getIntegration).toHaveBeenCalledWith(query.name);
      expect(integration.getConfig).toHaveBeenCalled();
      expect(result).toEqual({ hits: [await integration.getConfig()] });
    });

    it('should get all integration templates', async () => {
      const integrationList = [
        { getConfig: jest.fn().mockResolvedValue({ name: 'template1' }) },
        { getConfig: jest.fn().mockResolvedValue(null) },
        { getConfig: jest.fn().mockResolvedValue({ name: 'template2' }) },
      ];
      mockRepository.getIntegrationList.mockResolvedValue(integrationList);

      const result = await backend.getIntegrationTemplates();

      expect(mockRepository.getIntegrationList).toHaveBeenCalled();
      expect(integrationList[0].getConfig).toHaveBeenCalled();
      expect(integrationList[1].getConfig).toHaveBeenCalled();
      expect(integrationList[2].getConfig).toHaveBeenCalled();
      expect(result).toEqual({
        hits: [await integrationList[0].getConfig(), await integrationList[2].getConfig()],
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
      mockSavedObjectsClient.find.mockResolvedValue(findResult);

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
      mockSavedObjectsClient.get.mockResolvedValue(integrationInstance);

      const result = await backend.getIntegrationInstance({ id: instanceId });

      expect(mockSavedObjectsClient.get).toHaveBeenCalledWith('integration-instance', instanceId);
      expect(result).toEqual({ id: instanceId, status: 'unknown', name: 'instance1' });
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
      mockRepository.getIntegration.mockResolvedValue(template);
      mockSavedObjectsClient.create.mockResolvedValue({ result: 'created' });
      backend.instanceBuilder = (instanceBuilder as unknown) as IntegrationInstanceBuilder;

      const result = await backend.loadIntegrationInstance(templateName, name);

      expect(mockRepository.getIntegration).toHaveBeenCalledWith(templateName);
      expect(instanceBuilder.build).toHaveBeenCalledWith(template, {
        name,
        dataset: 'nginx',
        namespace: 'prod',
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
        backend.loadIntegrationInstance(templateName, 'instance1')
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
      mockRepository.getIntegration.mockResolvedValue(template);

      await expect(backend.loadIntegrationInstance(templateName, name)).rejects.toHaveProperty(
        'statusCode'
      );
    });
  });

  describe('getStatic', () => {
    it('should get static asset data', async () => {
      const templateName = 'template1';
      const staticPath = 'path/to/static';
      const assetData = Buffer.from('asset data');
      const integration = {
        getStatic: jest.fn().mockResolvedValue(assetData),
      };
      mockRepository.getIntegration.mockResolvedValue(integration);

      const result = await backend.getStatic(templateName, staticPath);

      expect(mockRepository.getIntegration).toHaveBeenCalledWith(templateName);
      expect(integration.getStatic).toHaveBeenCalledWith(staticPath);
      expect(result).toEqual(assetData);
    });

    it('should reject with a 404 if asset is not found', async () => {
      const templateName = 'template1';
      const staticPath = 'path/to/static';
      mockRepository.getIntegration.mockResolvedValue(null);

      await expect(backend.getStatic(templateName, staticPath)).rejects.toHaveProperty(
        'statusCode',
        404
      );
    });
  });
});
