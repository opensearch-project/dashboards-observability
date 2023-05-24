import { SavedObjectsClientContract } from '../../../../../src/core/server';

interface BuilderOptions {
  name: string;
  dataset: string;
  namespace: string;
  tags?: string[];
}

export class IntegrationInstanceBuilder {
  client: SavedObjectsClientContract;

  constructor(client: SavedObjectsClientContract) {
    this.client = client;
  }

  async build(
    template: IntegrationTemplate,
    options: BuilderOptions
  ): Promise<IntegrationInstance> {
    const result = this.validate(template)
      .then(() => this.post_assets(template.displayAssets))
      .then((refs) => this.build_instance(template, refs, options));
    return result;
  }

  async validate(_template: IntegrationTemplate): Promise<void> {
    return Promise.resolve();
  }

  async post_assets(_assets: DisplayAsset[]): Promise<AssetReference[]> {
    return Promise.resolve([]);
  }

  async build_instance(
    template: IntegrationTemplate,
    refs: AssetReference[],
    options: BuilderOptions
  ): Promise<IntegrationInstance> {
    return Promise.resolve({
      id: 'unknown',
      name: options.name,
      templateName: template.name,
      dataSource: {
        sourceType: template.integrationType,
        dataset: options.dataset,
        namespace: options.namespace,
      },
      tags: options.tags,
      creationDate: new Date().toISOString(),
      status: 'unknown',
      assets: refs,
    });
  }
}
