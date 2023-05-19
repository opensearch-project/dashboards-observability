import { promises as fs } from 'fs';
import { PlaceholderAdaptor } from './placeholder_adaptor';
import { SavedObjectsBulkCreateObject } from '../../../../../src/core/public';
import { SavedObjectsClientContract } from '../../../../../src/core/server/types';
import { readNDJsonObjects } from './utils';

let repository: IntegrationTemplate[] = [];

const store: IntegrationInstance[] = [
  {
    templateName: 'nginx',
    type: 'dashboard',
    dataset: 'prod',
    namespace: 'us_east',
    id: 'nginx-prod-us_east',
    version: '0.1.0',
    description: 'Nginx HTTP server collector for east cost prod systems',
    template:
      'https: //github.com/opensearch-project/observability/blob/2.x/integrations/nginx/config.json',
    creationDate: '2016-08-29T09: 12: 33.001Z',
    author: 'Ani',
    status: 'LOADED',
    dashboardUrl:
      "http://localhost:5601/nol/app/dashboards#/view/96847220-5261-44d0-89b4-65f3a659f13a?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-15m,to:now))&_a=(description:'Nginx%20dashboard%20with%20basic%20Observability%20on%20access%20%2F%20error%20logs',filters:!(),fullScreenMode:!f,options:(hidePanelTitles:!f,useMargins:!t),query:(language:kuery,query:''),timeRestore:!f,title:'%5BNGINX%20Core%20Logs%201.0%5D%20Overview',viewMode:view)",
    assets: [],
  },
];

const readRepository = async (): Promise<void> => {
  const buffer = await fs.readFile(__dirname + '/__data__/repository.json', 'utf-8');
  try {
    repository = JSON.parse(buffer);
    return Promise.resolve();
  } catch (err: any) {
    return Promise.reject(err);
  }
};

export class PlaceholderKibanaBackend implements PlaceholderAdaptor {
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
      integrations: repository,
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
        integrations: store,
      });
    }
    return Promise.resolve({
      integrations: [],
    });
  };
}
