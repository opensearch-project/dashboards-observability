/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectsClientContract } from '../../../../../../src/core/server';
import { TEST_INTEGRATION_CONFIG } from '../../../../test/constants';
import { IntegrationInstanceBuilder } from '../integrations_builder';
import { IntegrationReader } from '../repository/integration_reader';
import * as mockUtils from '../repository/utils';

jest.mock('../repository/utils', () => ({
  ...jest.requireActual('../repository/utils'),
  deepCheck: jest.fn(),
}));

const mockParsedAssets = [
  {
    type: 'savedObjectBundle',
    data: [
      {
        id: 'asset1',
        references: [{ id: 'ref1' }],
      },
      {
        id: 'asset2',
        references: [{ id: 'ref2' }],
      },
    ],
  },
];

const mockSavedObjectsClient: SavedObjectsClientContract = ({
  bulkCreate: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
  find: jest.fn(),
  get: jest.fn(),
  update: jest.fn(),
} as unknown) as SavedObjectsClientContract;

const sampleIntegration: IntegrationReader = ({
  getAssets: jest.fn().mockResolvedValue(mockParsedAssets),
  getConfig: jest.fn().mockResolvedValue(TEST_INTEGRATION_CONFIG),
} as unknown) as IntegrationReader;

describe('IntegrationInstanceBuilder', () => {
  let builder: IntegrationInstanceBuilder;

  beforeEach(() => {
    builder = new IntegrationInstanceBuilder(mockSavedObjectsClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('build', () => {
    it('should build an integration instance', async () => {
      const options = {
        indexPattern: 'instance-datasource',
        name: 'instance-name',
      };

      const remappedAssets = [
        {
          id: 'remapped-asset1',
          references: [{ id: 'remapped-ref1' }],
        },
        {
          id: 'remapped-asset2',
          references: [{ id: 'remapped-ref2' }],
        },
      ];
      const postAssetsResponse = {
        saved_objects: [
          { id: 'created-asset1', type: 'dashboard', attributes: { title: 'Dashboard 1' } },
          { id: 'created-asset2', type: 'visualization', attributes: { title: 'Visualization 1' } },
        ],
      };
      const expectedInstance = {
        name: 'instance-name',
        templateName: 'sample',
        dataSource: 'instance-datasource',
        creationDate: expect.any(String),
        assets: [
          {
            assetType: 'dashboard',
            assetId: 'created-asset1',
            status: 'available',
            isDefaultAsset: true,
            description: 'Dashboard 1',
          },
          {
            assetType: 'visualization',
            assetId: 'created-asset2',
            status: 'available',
            isDefaultAsset: false,
            description: 'Visualization 1',
          },
        ],
      };

      const mockTemplate: Partial<IntegrationConfig> = TEST_INTEGRATION_CONFIG;

      jest
        .spyOn(mockUtils, 'deepCheck')
        .mockResolvedValue({ ok: true, value: mockTemplate as IntegrationConfig });

      // Mock the implementation of the methods in the Integration class
      // sampleIntegration.deepCheck = jest.fn().mockResolvedValue({ ok: true, value: mockTemplate });
      sampleIntegration.getAssets = jest.fn().mockResolvedValue({
        ok: true,
        value: [{ type: 'savedObjectBundle', data: remappedAssets }],
      });
      sampleIntegration.getConfig = jest.fn().mockResolvedValue({ ok: true, value: mockTemplate });

      // Mock builder sub-methods
      const remapIDsSpy = jest.spyOn(builder, 'remapIDs');
      const postAssetsSpy = jest.spyOn(builder, 'postAssets');

      (mockSavedObjectsClient.bulkCreate as jest.Mock).mockResolvedValue(postAssetsResponse);

      const instance = await builder.build(sampleIntegration, options);

      expect(sampleIntegration.getAssets).toHaveBeenCalled();
      expect(remapIDsSpy).toHaveBeenCalledWith(remappedAssets);
      expect(postAssetsSpy).toHaveBeenCalledWith(remappedAssets);
      expect(instance).toEqual(expectedInstance);
    });

    it('should reject with an error if integration is not valid', async () => {
      const options = {
        indexPattern: 'instance-datasource',
        name: 'instance-name',
      };
      jest
        .spyOn(mockUtils, 'deepCheck')
        .mockResolvedValue({ ok: false, error: new Error('Mock error') });

      await expect(builder.build(sampleIntegration, options)).rejects.toThrowError('Mock error');
    });

    it('should reject with an error if getAssets rejects', async () => {
      const options = {
        indexPattern: 'instance-datasource',
        name: 'instance-name',
      };

      const errorMessage = 'Failed to get assets';
      jest
        .spyOn(mockUtils, 'deepCheck')
        .mockResolvedValue({ ok: true, value: ({} as unknown) as IntegrationConfig });
      sampleIntegration.getAssets = jest
        .fn()
        .mockResolvedValue({ ok: false, error: new Error(errorMessage) });

      await expect(builder.build(sampleIntegration, options)).rejects.toThrowError(errorMessage);
    });

    it('should reject with an error if postAssets throws an error', async () => {
      const options = {
        indexPattern: 'instance-datasource',
        name: 'instance-name',
      };
      const remappedAssets = [
        {
          id: 'remapped-asset1',
          references: [{ id: 'remapped-ref1' }],
        },
      ];
      const errorMessage = 'Failed to post assets';
      jest
        .spyOn(mockUtils, 'deepCheck')
        .mockResolvedValue({ ok: true, value: ({} as unknown) as IntegrationConfig });
      sampleIntegration.getAssets = jest.fn().mockResolvedValue({
        ok: true,
        value: [{ type: 'savedObjectBundle', data: remappedAssets }],
      });
      builder.postAssets = jest.fn().mockRejectedValue(new Error(errorMessage));

      await expect(builder.build(sampleIntegration, options)).rejects.toThrowError(errorMessage);
    });
  });

  describe('remapIDs', () => {
    it('should remap IDs and references in assets', () => {
      const assets = [
        {
          id: 'asset1',
          type: 'unknown',
          attributes: { title: 'asset1' },
          references: [{ id: 'ref1' }, { id: 'ref2' }],
        },
        {
          id: 'asset2',
          type: 'unknown',
          attributes: { title: 'asset1' },
          references: [{ id: 'ref1' }, { id: 'ref3' }],
        },
      ];
      const expectedRemappedAssets = [
        {
          id: expect.any(String),
          references: [{ id: expect.any(String) }, { id: expect.any(String) }],
        },
        {
          id: expect.any(String),
          references: [{ id: expect.any(String) }, { id: expect.any(String) }],
        },
      ];

      const remappedAssets = builder.remapIDs(assets);

      expect(remappedAssets).toMatchObject(expectedRemappedAssets);
    });
  });

  describe('postAssets', () => {
    it('should post assets and return asset references', async () => {
      const assets = [
        {
          id: 'asset1',
          type: 'dashboard',
          attributes: { title: 'Dashboard 1' },
        },
        {
          id: 'asset2',
          type: 'visualization',
          attributes: { title: 'Visualization 1' },
        },
      ];
      const expectedRefs = [
        {
          assetType: 'dashboard',
          assetId: 'created-asset1',
          status: 'available',
          isDefaultAsset: true,
          description: 'Dashboard 1',
        },
        {
          assetType: 'visualization',
          assetId: 'created-asset2',
          status: 'available',
          isDefaultAsset: false,
          description: 'Visualization 1',
        },
      ];
      const bulkCreateResponse = {
        saved_objects: [
          { id: 'created-asset1', type: 'dashboard', attributes: { title: 'Dashboard 1' } },
          { id: 'created-asset2', type: 'visualization', attributes: { title: 'Visualization 1' } },
        ],
      };

      (mockSavedObjectsClient.bulkCreate as jest.Mock).mockResolvedValue(bulkCreateResponse);

      const refs = await builder.postAssets(assets);

      expect(mockSavedObjectsClient.bulkCreate).toHaveBeenCalledWith(assets);
      expect(refs).toEqual(expectedRefs);
    });

    it('should reject with an error if bulkCreate throws an error', async () => {
      const assets = [
        {
          id: 'asset1',
          type: 'dashboard',
          attributes: { title: 'Dashboard 1' },
        },
      ];
      const errorMessage = 'Failed to create assets';
      (mockSavedObjectsClient.bulkCreate as jest.Mock).mockRejectedValue(new Error(errorMessage));

      await expect(builder.postAssets(assets)).rejects.toThrowError(errorMessage);
    });
  });

  describe('buildInstance', () => {
    it('should build an integration instance', async () => {
      const integration = {
        getConfig: jest.fn().mockResolvedValue({
          ok: true,
          value: {
            name: 'integration-template',
            type: 'integration-type',
          },
        }),
      };
      const refs = [
        {
          assetType: 'dashboard',
          assetId: 'created-asset1',
          status: 'available',
          isDefaultAsset: true,
          description: 'Dashboard 1',
        },
      ];
      const options = {
        indexPattern: 'instance-datasource',
        name: 'instance-name',
      };
      const expectedInstance = {
        name: 'instance-name',
        templateName: 'integration-template',
        dataSource: 'instance-datasource',
        tags: undefined,
        creationDate: expect.any(String),
        assets: refs,
      };

      const instance = await builder.buildInstance(
        (integration as unknown) as IntegrationReader,
        refs,
        options
      );

      expect(integration.getConfig).toHaveBeenCalled();
      expect(instance).toEqual(expectedInstance);
    });

    it('should reject with an error if getConfig returns null', async () => {
      const integration = {
        getConfig: jest.fn().mockResolvedValue(null),
      };
      const refs = [
        {
          assetType: 'dashboard',
          assetId: 'created-asset1',
          status: 'available',
          isDefaultAsset: true,
          description: 'Dashboard 1',
        },
      ];
      const options = {
        indexPattern: 'instance-datasource',
        name: 'instance-name',
      };

      await expect(
        builder.buildInstance((integration as unknown) as IntegrationReader, refs, options)
      ).rejects.toThrowError();
    });
  });
});

describe('getSavedObjectBundles', () => {
  let builder: IntegrationInstanceBuilder;

  beforeEach(() => {
    builder = new IntegrationInstanceBuilder(mockSavedObjectsClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should filter assets correctly without workflows and includeWorkflows', () => {
    const assets = [
      {
        type: 'savedObjectBundle' as const,
        data: [{ id: '1', type: 'type1', attributes: { title: 'Title 1' } }],
      },
      {
        type: 'savedObjectBundle' as const,
        data: [{ id: '2', type: 'type2', attributes: { title: 'Title 2' } }],
      },
      { type: 'query' as const, query: 'query', language: 'language' },
    ];
    const result = builder.getSavedObjectBundles(assets);
    expect(result.length).toBe(2);
  });

  it('should filter assets correctly with specified workflows', () => {
    const assets = [
      {
        type: 'savedObjectBundle' as const,
        workflows: ['workflow1'],
        data: [{ id: '1', type: 'type1', attributes: { title: 'Title 1' } }],
      },
      {
        type: 'savedObjectBundle' as const,
        workflows: ['workflow2'],
        data: [{ id: '2', type: 'type2', attributes: { title: 'Title 2' } }],
      },
      { type: 'query' as const, query: 'query', language: 'language' },
    ];
    const result = builder.getSavedObjectBundles(assets, ['workflow1']);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('1');
  });

  it('should filter assets correctly with no matching workflows', () => {
    const assets = [
      {
        type: 'savedObjectBundle' as const,
        workflows: ['workflow1'],
        data: [{ id: '1', type: 'type1', attributes: { title: 'Title 1' } }],
      },
      {
        type: 'savedObjectBundle' as const,
        workflows: ['workflow2'],
        data: [{ id: '2', type: 'type2', attributes: { title: 'Title 2' } }],
      },
      { type: 'query' as const, query: 'query', language: 'language' },
    ];
    const result = builder.getSavedObjectBundles(assets, ['workflow3']);
    expect(result.length).toBe(0);
  });

  it('should return an empty array if no savedObjectBundle assets are present', () => {
    const assets = [{ type: 'query' as const, query: 'query', language: 'language' }];
    const result = builder.getSavedObjectBundles(assets);
    expect(result.length).toBe(0);
  });
});
