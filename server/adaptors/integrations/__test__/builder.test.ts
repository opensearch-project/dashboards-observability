/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IntegrationInstanceBuilder } from '../integrations_builder';
import { SavedObjectsClientContract } from '../../../../../../src/core/server';

describe('IntegrationInstanceBuilder', () => {
  let mockClient: SavedObjectsClientContract;
  let builder: IntegrationInstanceBuilder;

  beforeEach(() => {
    // Create a mock instance for each test
    mockClient = {
      bulkCreate: jest.fn(),
    } as any;
    builder = new IntegrationInstanceBuilder(mockClient);
  });

  it('should build an integration instance', async () => {
    const displayAssets = [
      { body: '{"type":"dashboard","title":"Dashboard 1", "references": []}' },
      { body: '{"type":"visualization","title":"Visualization 1", "references": []}' },
    ];
    const template: IntegrationTemplate = {
      name: 'nginx',
      version: '1.0',
      integrationType: 'logs',
      license: 'Apache-2.0',
      components: [],
      displayAssets,
    };
    const options = {
      name: 'Instance 1',
      dataset: 'dataset',
      namespace: 'namespace',
      tags: ['tag1', 'tag2'],
    };
    const mockResponse = {
      saved_objects: [
        { type: 'dashboard', id: 'dashboard1', attributes: { title: 'hi' } },
        { type: 'visualization', id: 'visualization1', attributes: { title: 'hi' } },
      ],
    };
    const expectedInstance = {
      name: options.name,
      templateName: template.name,
      dataSource: {
        sourceType: template.integrationType,
        dataset: options.dataset,
        namespace: options.namespace,
      },
      tags: options.tags,
      creationDate: expect.any(String),
      status: 'unknown',
      assets: [
        {
          assetType: 'dashboard',
          assetId: 'dashboard1',
          status: 'available',
          isDefaultAsset: true,
          description: 'hi',
        },
        {
          assetType: 'visualization',
          assetId: 'visualization1',
          status: 'available',
          isDefaultAsset: false,
          description: 'hi',
        },
      ],
    };

    (mockClient.bulkCreate as jest.Mock).mockResolvedValue(mockResponse);

    const result = await builder.build(template, options);

    expect(mockClient.bulkCreate).toHaveBeenCalledWith(
      displayAssets.map((asset) => JSON.parse(asset.body))
    );
    expect(result).toEqual(expectedInstance);
  });

  it('should reject when posting assets fails', async () => {
    const displayAssets = [
      { body: '{"type":"dashboard","title":"Dashboard 1", "references":[]}' },
      { body: '{"type":"visualization","title":"Visualization 1", "references": []}' },
    ];
    const template: IntegrationTemplate = {
      name: 'nginx',
      version: '1.0',
      integrationType: 'logs',
      license: 'Apache-2.0',
      components: [],
      displayAssets,
    };
    const options = { name: 'Instance 1', dataset: 'dataset', namespace: 'namespace' };
    const errorMessage = 'An error occurred while posting assets';

    (mockClient.bulkCreate as jest.Mock).mockRejectedValue(new Error(errorMessage));

    await expect(builder.build(template, options)).rejects.toEqual(new Error(errorMessage));
    await expect(mockClient.bulkCreate).toHaveBeenCalledWith(
      displayAssets.map((asset) => JSON.parse(asset.body))
    );
  });

  it('should not reject validating a valid template', async () => {
    const template: IntegrationTemplate = {
      name: 'test-template',
      version: '1.0',
      integrationType: 'logs',
      license: 'Apache-2.0',
      components: [],
      displayAssets: [],
    };

    const result = await builder.validate(template);

    expect(result).toBeUndefined();
  });

  it('should reject an empty object', async () => {
    const template = {} as IntegrationTemplate;
    await expect(builder.validate(template)).rejects.toBeTruthy();
  });
});
