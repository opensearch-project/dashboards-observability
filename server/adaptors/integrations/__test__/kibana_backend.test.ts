/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IntegrationsKibanaBackend } from '../integrations_kibana_backend';
import { SavedObjectsClientContract } from '../../../../../../src/core/server/types';
import { IntegrationInstanceBuilder } from '../integrations_builder';
import { IntegrationsRepository } from '../integrations_repository';

describe('IntegrationsKibanaBackend', () => {
  let mockClient: SavedObjectsClientContract;
  let mockRepository: IntegrationsRepository;
  let backend: IntegrationsKibanaBackend;

  beforeEach(() => {
    // Create mock instances for each test
    mockClient = {
      find: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    } as any;
    mockRepository = {
      get: jest.fn(),
      getByName: jest.fn(),
    } as any;
    backend = new IntegrationsKibanaBackend(mockClient, mockRepository);
  });

  it('should get integration templates from the repository', async () => {
    const templates = [{ name: 'Template 1' }, { name: 'Template 2' }];
    (mockRepository.get as jest.Mock).mockResolvedValue(templates);

    const result = await backend.getIntegrationTemplates();

    expect(mockRepository.get).toHaveBeenCalled();
    expect(result).toEqual({ hits: templates });
  });

  it('should get integration instances from the client', async () => {
    const mockResult = {
      total: 2,
      saved_objects: [
        { attributes: { name: 'Instance 1' } },
        { attributes: { name: 'Instance 2' } },
      ],
    };
    (mockClient.find as jest.Mock).mockResolvedValue(mockResult);

    const result = await backend.getIntegrationInstances();

    expect(mockClient.find).toHaveBeenCalledWith({ type: 'integration-instance' });
    expect(result).toEqual({
      total: mockResult.total,
      hits: mockResult.saved_objects.map((x) => x.attributes),
    });
  });

  it('should load an integration instance', async () => {
    const templateName = 'Template 1';
    const template = { name: templateName };
    const instance = { name: 'Instance 1' };
    const builderMock = {
      build: jest.fn().mockResolvedValue(instance),
    };
    const mockCreate = jest.fn();
    (mockClient.create as jest.Mock).mockResolvedValue(mockCreate);
    (mockRepository.getByName as jest.Mock).mockResolvedValue(template);
    jest
      .spyOn(IntegrationInstanceBuilder.prototype, 'build')
      .mockImplementationOnce(builderMock.build);

    const result = await backend.loadIntegrationInstance(
      templateName,
      'Placeholder Nginx Integration'
    );

    expect(mockRepository.getByName).toHaveBeenCalledWith(templateName);
    expect(builderMock.build).toHaveBeenCalledWith(template, {
      name: 'Placeholder Nginx Integration',
      dataset: 'nginx',
      namespace: 'prod',
    });
    expect(mockClient.create).toHaveBeenCalledWith('integration-instance', instance);
    expect(result).toEqual(instance);
  });

  it('should delete an integration instance', async () => {
    const mockDelete = jest.fn();
    (mockClient.create as jest.Mock).mockResolvedValue(mockDelete);

    await backend.deleteIntegrationInstance('deletedId');
    expect(mockClient.delete).toHaveBeenCalledWith('integration-instance', 'deletedId');
  });

  it('should reject when loading an integration instance fails', async () => {
    const templateName = 'Template 1';
    const template = { name: templateName };
    const errorMessage = 'An error occurred during instance creation';
    const builderMock = {
      build: jest.fn().mockRejectedValue(new Error(errorMessage)),
    };
    (mockRepository.getByName as jest.Mock).mockResolvedValue(template);
    jest
      .spyOn(IntegrationInstanceBuilder.prototype, 'build')
      .mockImplementationOnce(builderMock.build);

    await expect(backend.loadIntegrationInstance(templateName, 'test')).rejects.toEqual({
      message: errorMessage,
      statusCode: 500,
    });

    expect(mockRepository.getByName).toHaveBeenCalledWith(templateName);
    expect(builderMock.build).toHaveBeenCalledWith(template, {
      name: 'test',
      dataset: 'nginx',
      namespace: 'prod',
    });
    expect(mockClient.create).not.toHaveBeenCalled();
  });

  test('should get a static asset from the template', async () => {
    const templateName = 'Template 1';
    const template = {
      name: templateName,
      statics: {
        assets: {
          'file.jpg': 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD',
        },
      },
    };
    (mockRepository.getByName as jest.Mock).mockResolvedValue(template);

    const result = await backend.getStatic(templateName, 'file.jpg');

    expect(mockRepository.getByName).toHaveBeenCalledWith(templateName);
    expect(result).toEqual(template.statics.assets['file.jpg']);
  });

  test('should reject when the static asset is not found', async () => {
    const templateName = 'Template 1';
    const template = {
      name: templateName,
      statics: {
        assets: {
          'file.jpg': 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD',
        },
      },
    };
    (mockRepository.getByName as jest.Mock).mockResolvedValue(template);

    await expect(backend.getStatic(templateName, 'file.png')).rejects.toEqual({
      message: 'Asset file.png not found',
      statusCode: 404,
    });

    expect(mockRepository.getByName).toHaveBeenCalledWith(templateName);
  });
});
