import { IntegrationsAdaptor } from './integrations_adaptor';
import { SavedObjectsClientContract } from '../../../../../src/core/server/types';
import { IntegrationInstanceBuilder } from './integrations_builder';
import { IntegrationsRepository } from './integrations_repository';

export class IntegrationsKibanaBackend implements IntegrationsAdaptor {
  client: SavedObjectsClientContract;
  repository: IntegrationsRepository;

  constructor(client: SavedObjectsClientContract, repository?: IntegrationsRepository) {
    this.client = client;
    this.repository = repository ?? new IntegrationsRepository();
  }

  getIntegrationTemplates = async (
    _query?: IntegrationTemplateQuery
  ): Promise<IntegrationTemplateSearchResult> => {
    const repo = await this.repository.get();
    console.log(`Retrieving ${repo.length} templates from catalog`);
    return Promise.resolve({
      hits: repo,
    });
  };

  getIntegrationInstances = async (
    _query?: IntegrationInstanceQuery
  ): Promise<IntegrationInstanceSearchResult> => {
    const result = await this.client.find({ type: 'integration-instance' });
    return Promise.resolve({
      total: result.total,
      hits: result.saved_objects.map((x) => x.attributes) as IntegrationInstance[],
    });
  };

  loadIntegrationInstance = async (templateName: string): Promise<IntegrationInstance> => {
    const template = await this.repository.getByName(templateName);
    try {
      const result = await new IntegrationInstanceBuilder(this.client).build(template, {
        name: 'Placeholder Nginx Integration',
        dataset: 'nginx',
        namespace: 'prod',
      });
      await this.client.create('integration-instance', result);
      return Promise.resolve(result);
    } catch (err: any) {
      return Promise.reject({
        message: err.message,
        statusCode: 500,
      });
    }
  };

  getStatic = async (templateName: string, path: string): Promise<StaticAsset> => {
    const template = await this.repository.getByName(templateName);
    const data = template.statics?.assets?.[path];
    if (data === undefined) {
      return Promise.reject({
        message: `Asset ${path} not found`,
        statusCode: 404,
      });
    }
    return Promise.resolve(data);
  };
}
