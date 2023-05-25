import * as fs from 'fs';
import { IntegrationsAdaptor } from './integrations_adaptor';
import { SavedObjectsBulkCreateObject } from '../../../../../src/core/public';
import { SavedObjectsClientContract } from '../../../../../src/core/server/types';
import { readNDJsonObjects } from './utils';
import { IntegrationInstanceBuilder } from './integrations_builder';

let repository: IntegrationTemplate[] = [];

const store: IntegrationInstance[] = [];

const readRepository = async (): Promise<void> => {
  const buffer = await fs.promises.readFile(__dirname + '/__data__/repository.json', 'utf-8');
  try {
    repository = JSON.parse(buffer);
    return Promise.resolve();
  } catch (err: any) {
    return Promise.reject(err);
  }
};

export class IntegrationsKibanaBackend implements IntegrationsAdaptor {
  client: SavedObjectsClientContract;

  constructor(client: SavedObjectsClientContract) {
    this.client = client;
  }

  getIntegrationTemplates = async (
    _query?: IntegrationTemplateQuery
  ): Promise<IntegrationTemplateSearchResult> => {
    if (repository.length === 0) {
      await readRepository();
    }
    console.log(`Retrieving ${repository.length} templates from catalog`);
    return Promise.resolve({
      hits: repository,
    });
  };

  getAssets = (_templateName: string): Promise<SavedObjectsBulkCreateObject[]> => {
    const stream = fs.createReadStream(__dirname + '/__tests__/test.ndjson');
    const assets = readNDJsonObjects(stream).then(
      (objects) => objects as SavedObjectsBulkCreateObject[]
    );
    return assets;
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
    for (const template of repository) {
      if (template.name !== templateName) {
        continue;
      }
      try {
        const result = await new IntegrationInstanceBuilder(this.client).build(template, {
          name: 'Placeholder Nginx Integration',
          dataset: 'nginx',
          namespace: 'prod',
        });
        this.client.create('integration-instance', result);
        return Promise.resolve(result);
      } catch (err: any) {
        return Promise.reject({
          message: err.toString(),
          statusCode: 500,
        });
      }
    }
    return Promise.reject({
      message: `Template ${templateName} not found`,
      statusCode: 404,
    });
  };

  getStatic = async (templateName: string, path: string): Promise<StaticAsset> => {
    if (repository.length === 0) {
      await readRepository();
    }
    for (const item of repository) {
      if (item.name !== templateName) {
        continue;
      }
      const data = item.statics?.assets?.[path];
      if (data === undefined) {
        return Promise.reject({
          message: `Asset ${path} not found`,
          statusCode: 404,
        });
      }
      return Promise.resolve(data);
    }
    return Promise.reject({
      message: `Template ${templateName} not found`,
      statusCode: 404,
    });
  };
}
