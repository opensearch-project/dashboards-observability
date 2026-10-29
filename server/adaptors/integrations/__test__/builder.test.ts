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

const mockSavedObjectsClient: SavedObjectsClientContract = {
  bulkCreate: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
  find: jest.fn(),
  get: jest.fn(),
  update: jest.fn(),
} as unknown as SavedObjectsClientContract;

const sampleIntegration: IntegrationReader = {
  getAssets: jest.fn().mockResolvedValue(mockParsedAssets),
  getConfig: jest.fn().mockResolvedValue(TEST_INTEGRATION_CONFIG),
} as unknown as IntegrationReader;

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

    it('should build an integration instance with MDS reference', async () => {
      const options = {
        indexPattern: 'instance-datasource',
        name: 'instance-name',
        dataSourceMDSId: 'sampleMDSId',
        dataSourceMDSLabel: 'sample MDS',
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
        references: [
          {
            id: 'sampleMDSId',
            name: 'sample MDS',
            type: 'data-source',
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
      const addMDSReferenceSpy = jest.spyOn(builder, 'addMDSReference');
      const postAssetsSpy = jest.spyOn(builder, 'postAssets');

      (mockSavedObjectsClient.bulkCreate as jest.Mock).mockResolvedValue(postAssetsResponse);

      const instance = await builder.build(sampleIntegration, options);

      expect(sampleIntegration.getAssets).toHaveBeenCalled();
      expect(remapIDsSpy).toHaveBeenCalledWith(remappedAssets);
      expect(addMDSReferenceSpy).toHaveBeenCalledWith(
        remappedAssets,
        undefined,
        'sampleMDSId',
        'sample MDS'
      );
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

      await expect(builder.build(sampleIntegration, options)).rejects.toThrow('Mock error');
    });

    it('should reject with an error if getAssets rejects', async () => {
      const options = {
        indexPattern: 'instance-datasource',
        name: 'instance-name',
      };

      const errorMessage = 'Failed to get assets';
      jest
        .spyOn(mockUtils, 'deepCheck')
        .mockResolvedValue({ ok: true, value: {} as unknown as IntegrationConfig });
      sampleIntegration.getAssets = jest
        .fn()
        .mockResolvedValue({ ok: false, error: new Error(errorMessage) });

      await expect(builder.build(sampleIntegration, options)).rejects.toThrow(errorMessage);
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
        .mockResolvedValue({ ok: true, value: {} as unknown as IntegrationConfig });
      sampleIntegration.getAssets = jest.fn().mockResolvedValue({
        ok: true,
        value: [{ type: 'savedObjectBundle', data: remappedAssets }],
      });
      builder.postAssets = jest.fn().mockRejectedValue(new Error(errorMessage));

      await expect(builder.build(sampleIntegration, options)).rejects.toThrow(errorMessage);
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

    it('should remap links to installed assets inside JSON-encoded string attributes', () => {
      const visualization = JSON.stringify({
        params: {
          dataLinks: [
            {
              title: 'Open details',
              url: '/app/dashboards#/view/details-dashboard?_a=(query:(language:kuery))',
            },
          ],
        },
      });
      const assets = [
        {
          id: 'details-dashboard',
          type: 'dashboard',
          attributes: { title: 'Details' },
          references: [],
        },
        {
          id: 'summary-table',
          type: 'explore',
          attributes: { title: 'Summary', visualization },
          references: [{ name: 'link_0', type: 'dashboard', id: 'details-dashboard' }],
        },
      ];

      const [dashboard, explore] = builder.remapIDs(assets);

      const { url } = JSON.parse((explore.attributes as { visualization: string }).visualization)
        .params.dataLinks[0];
      expect(dashboard.id).not.toBe('details-dashboard');
      expect(url).toBe(`/app/dashboards#/view/${dashboard.id}?_a=(query:(language:kuery))`);
    });

    it('should remap links in nested and array string attributes', () => {
      const assets = [
        {
          id: 'overview',
          type: 'dashboard',
          attributes: { title: 'Overview' },
          references: [],
        },
        {
          id: 'saved-viz',
          type: 'visualization',
          attributes: {
            title: 'Links',
            visState: {
              params: {
                markdown: '[Overview](#/view/overview) [Edit](#/edit/saved-viz)',
              },
            },
            links: ['/app/dashboards#/view/overview'],
          },
          references: [
            { name: 'link_0', type: 'dashboard', id: 'overview' },
            { name: 'link_1', type: 'visualization', id: 'saved-viz' },
          ],
        },
      ];

      const [dashboard, visualization] = builder.remapIDs(assets);

      expect(visualization.attributes).toEqual({
        title: 'Links',
        visState: {
          params: {
            markdown: `[Overview](#/view/${dashboard.id}) [Edit](#/edit/${visualization.id})`,
          },
        },
        links: [`/app/dashboards#/view/${dashboard.id}`],
      });
    });

    it('should remap links to an asset that appears later in the bundle', () => {
      const assets = [
        {
          id: 'source',
          type: 'visualization',
          attributes: { title: 'Source', description: 'See #/view/target' },
          references: [{ name: 'link_0', type: 'dashboard', id: 'target' }],
        },
        {
          id: 'target',
          type: 'dashboard',
          attributes: { title: 'Target' },
          references: [],
        },
      ];

      const [source, target] = builder.remapIDs(assets);

      expect(source.attributes).toMatchObject({ description: `See #/view/${target.id}` });
    });

    it('should keep links to IDs outside the installed assets and partial ID matches', () => {
      const description =
        '#/view/external-dashboard #/view/main-dashboard-2 #/view/referenced-only ' +
        '/view/main-dashboard_old';
      const assets = [
        {
          id: 'main-dashboard',
          type: 'dashboard',
          attributes: { title: 'Main', description },
          references: [
            { name: 'link_0', type: 'dashboard', id: 'main-dashboard' },
            { name: 'panel_0', type: 'visualization', id: 'referenced-only' },
          ],
        },
      ];

      const [dashboard] = builder.remapIDs(assets);

      expect(dashboard.attributes).toEqual({ title: 'Main', description });
    });

    it('should keep links that are not declared as link references', () => {
      const description = '#/view/target #/edit/target';
      const assets = [
        {
          id: 'source',
          type: 'dashboard',
          attributes: { title: 'Source', description },
          references: [],
        },
        {
          id: 'linked-source',
          type: 'dashboard',
          attributes: { title: 'Linked source', description },
          references: [{ name: 'panel_0', type: 'dashboard', id: 'target' }],
        },
        {
          id: 'target',
          type: 'dashboard',
          attributes: { title: 'Target' },
          references: [],
        },
      ];

      const [source, linkedSource, target] = builder.remapIDs(assets);

      expect(target.id).not.toBe('target');
      expect(source.attributes).toEqual({ title: 'Source', description });
      expect(linkedSource.attributes).toEqual({ title: 'Linked source', description });
    });

    it('should keep link references and links to objects outside the installed assets', () => {
      const description = '#/view/existing-dashboard #/view/target';
      const assets = [
        {
          id: 'source',
          type: 'dashboard',
          attributes: { title: 'Source', description },
          references: [
            { name: 'link_0', type: 'dashboard', id: 'existing-dashboard' },
            { name: 'link_1', type: 'dashboard', id: 'target' },
          ],
        },
        {
          id: 'target',
          type: 'dashboard',
          attributes: { title: 'Target' },
          references: [],
        },
      ];

      const [source, target] = builder.remapIDs(assets);

      expect(source.attributes).toEqual({
        title: 'Source',
        description: `#/view/existing-dashboard #/view/${target.id}`,
      });
      expect(source.references).toEqual([
        { name: 'link_0', type: 'dashboard', id: 'existing-dashboard' },
        { name: 'link_1', type: 'dashboard', id: target.id },
      ]);
    });

    it('should remap links followed by punctuation', () => {
      const assets = [
        {
          id: 'source',
          type: 'dashboard',
          attributes: {
            title: 'Source',
            description: 'See #/view/target. Or #/view/target, #/view/target;x **#/view/target**',
          },
          references: [{ name: 'link_0', type: 'dashboard', id: 'target' }],
        },
        {
          id: 'target',
          type: 'dashboard',
          attributes: { title: 'Target' },
          references: [],
        },
      ];

      const [source, target] = builder.remapIDs(assets);

      expect(source.attributes).toMatchObject({
        description:
          `See #/view/${target.id}. Or #/view/${target.id}, ` +
          `#/view/${target.id};x **#/view/${target.id}**`,
      });
    });

    it('should remap links between dashboards that link to each other', () => {
      const dashboard = (id: string, links: string[], declaredLinks: string[]) => ({
        id,
        type: 'dashboard',
        attributes: {
          title: id,
          description: links.map((link) => `[${link}](#/view/${link})`).join(' '),
        },
        references: declaredLinks.map((link, n) => ({
          name: `link_${n}`,
          type: 'dashboard',
          id: link,
        })),
      });
      const assets = [
        dashboard('dash-a', ['dash-b', 'external-dashboard'], ['dash-b']),
        dashboard('dash-b', ['dash-c', 'dash-d'], ['dash-c', 'dash-d']),
        dashboard('dash-c', [], []),
        dashboard('dash-d', ['external-dashboard'], []),
      ];

      const [dashA, dashB, dashC, dashD] = builder.remapIDs(assets);

      const newIds = [dashA, dashB, dashC, dashD].map((asset) => asset.id);
      expect(new Set(newIds).size).toBe(4);
      newIds.forEach((id) => expect(['dash-a', 'dash-b', 'dash-c', 'dash-d']).not.toContain(id));
      expect(dashA.attributes).toEqual({
        title: 'dash-a',
        description: `[dash-b](#/view/${dashB.id}) [external-dashboard](#/view/external-dashboard)`,
      });
      expect(dashB.attributes).toEqual({
        title: 'dash-b',
        description: `[dash-c](#/view/${dashC.id}) [dash-d](#/view/${dashD.id})`,
      });
      expect(dashC.attributes).toEqual({ title: 'dash-c', description: '' });
      expect(dashD.attributes).toEqual({
        title: 'dash-d',
        description: '[external-dashboard](#/view/external-dashboard)',
      });
      expect(dashA.references.map((ref) => ref.id)).toEqual([dashB.id]);
      expect(dashB.references.map((ref) => ref.id)).toEqual([dashC.id, dashD.id]);
    });

    it('should keep installed asset IDs that are not part of a view or edit link', () => {
      const description =
        'Drill down from main-dashboard. /app/dashboards#/main-dashboard /list/main-dashboard';
      const optionsJSON = JSON.stringify({ targetDashboard: 'main-dashboard' });
      const assets = [
        {
          id: 'main-dashboard',
          type: 'dashboard',
          attributes: { title: 'main-dashboard', description: '' },
          references: [],
        },
        {
          id: 'overview',
          type: 'dashboard',
          attributes: { title: 'Overview', description, optionsJSON },
          references: [{ name: 'link_0', type: 'dashboard', id: 'main-dashboard' }],
        },
      ];

      const [mainDashboard, overview] = builder.remapIDs(assets);

      expect(mainDashboard.id).not.toBe('main-dashboard');
      expect(mainDashboard.attributes).toEqual({
        title: 'main-dashboard',
        description: '',
      });
      expect(overview.attributes).toEqual({
        title: 'Overview',
        description,
        optionsJSON,
      });
    });

    it('should leave non-string attributes unchanged', () => {
      const assets = [
        {
          id: 'dashboard',
          type: 'dashboard',
          attributes: {
            title: 'Dashboard',
            version: 1,
            timeRestore: false,
            refreshInterval: null,
          },
          references: [],
        },
      ];

      const [dashboard] = builder.remapIDs(assets);

      expect(dashboard.attributes).toEqual({
        title: 'Dashboard',
        version: 1,
        timeRestore: false,
        refreshInterval: null,
      });
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

      await expect(builder.postAssets(assets)).rejects.toThrow(errorMessage);
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
        integration as unknown as IntegrationReader,
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
        builder.buildInstance(integration as unknown as IntegrationReader, refs, options)
      ).rejects.toThrow();
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
