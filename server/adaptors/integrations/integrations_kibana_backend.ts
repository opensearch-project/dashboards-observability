import * as fs from 'fs';
import { IntegrationsAdaptor } from './integrations_adaptor';
import { SavedObjectsBulkCreateObject } from '../../../../../src/core/public';
import { SavedObjectsClientContract } from '../../../../../src/core/server/types';
import { readNDJsonObjects } from './utils';

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

  loadRepository(): Promise<void> {
    const toCreate: SavedObjectsBulkCreateObject[] = repository.map((template) => {
      return {
        type: 'integration-template',
        attributes: template,
      };
    });
    try {
      this.client.bulkCreate(toCreate);
      return Promise.resolve();
    } catch (err: any) {
      return Promise.reject(err);
    }
  }

  getIntegrationInstances = (
    query?: IntegrationInstanceQuery
  ): Promise<IntegrationInstanceSearchResult> => {
    console.log(store);
    if (query?.added) {
      return Promise.resolve({
        hits: store,
      });
    }
    return Promise.resolve({
      hits: [],
    });
  };
}
