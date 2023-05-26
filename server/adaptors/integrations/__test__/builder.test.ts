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
      { body: '{"type":"dashboard","title":"Dashboard 1"}' },
      { body: '{"type":"visualization","title":"Visualization 1"}' },
    ];
    const template = {
      name: 'Template 1',
      integrationType: 'type',
      displayAssets,
    } as IntegrationTemplate;
    const options = {
      name: 'Instance 1',
      dataset: 'dataset',
      namespace: 'namespace',
      tags: ['tag1', 'tag2'],
    };
    const mockResponse = {
      saved_objects: [
        { type: 'dashboard', id: 'dashboard1' },
        { type: 'visualization', id: 'visualization1' },
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
      creationDate: expect.any(Date),
      status: 'unknown',
      assets: [
        {
          assetType: 'dashboard',
          assetId: 'dashboard1',
          status: 'available',
          isDefaultAsset: true,
        },
        {
          assetType: 'visualization',
          assetId: 'visualization1',
          status: 'available',
          isDefaultAsset: false,
        },
      ],
      addedBy: 'unknown',
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
      { body: '{"type":"dashboard","title":"Dashboard 1"}' },
      { body: '{"type":"visualization","title":"Visualization 1"}' },
    ];
    const template = {
      name: 'Template 1',
      integrationType: 'type',
      displayAssets,
    } as IntegrationTemplate;
    const options = { name: 'Instance 1', dataset: 'dataset', namespace: 'namespace' };
    const errorMessage = 'An error occurred while posting assets';

    (mockClient.bulkCreate as jest.Mock).mockRejectedValue(new Error(errorMessage));

    await expect(builder.build(template, options)).rejects.toEqual(new Error(errorMessage));
    await expect(mockClient.bulkCreate).toHaveBeenCalledWith(
      displayAssets.map((asset) => JSON.parse(asset.body))
    );
  });

  it('should not reject on validation a valid template', async () => {
    // Placeholder template for now -- fill in when validation is implemented
    const template = { name: 'Template 1' } as IntegrationTemplate;

    const result = await builder.validate(template);

    expect(result).toBeUndefined();
  });
});
