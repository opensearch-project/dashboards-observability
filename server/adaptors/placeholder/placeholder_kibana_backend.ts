import * as fs from 'fs';
import { PlaceholderAdaptor } from './placeholder_adaptor';
import { SavedObjectsBulkCreateObject } from '../../../../../src/core/public';
import { SavedObjectsClientContract } from '../../../../../src/core/server/types';
import { readNDJsonObjects } from './utils';

const catalog: IntegrationTemplate[] = [
  {
    templateName: 'nginx',
    version: '1.0.0',
    description: 'Nginx HTTP server collector',
    catalog: 'observability',
    assetUrl: 'https://cdn.iconscout.com/icon/free/png-256/nginx-3521604-2945048.png',
    displayAssets: [],
  },
];

const sampleIntegrations: IntegrationInstance[] = [
  {
    templateName: 'nginx',
    type: 'dashboard',
    dataset: 'prod',
    namespace: 'us_east',
    id: 'nginx-prod-us_east',
    version: '0.1.0',
    description: 'Nginx HTTP server collector for east cost prod systems',
    template:
      'https://github.com/opensearch-project/observability/blob/2.x/integrations/nginx/config.json',
    creationDate: '2016-08-29T09:12:33.001Z',
    author: 'Ani',
    status: 'LOADED',
    dashboardUrl:
      "http://localhost:5601/nol/app/dashboards#/view/96847220-5261-44d0-89b4-65f3a659f13a?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-15m,to:now))&_a=(description:'Nginx%20dashboard%20with%20basic%20Observability%20on%20access%20%2F%20error%20logs',filters:!(),fullScreenMode:!f,options:(hidePanelTitles:!f,useMargins:!t),query:(language:kuery,query:''),timeRestore:!f,title:'%5BNGINX%20Core%20Logs%201.0%5D%20Overview',viewMode:view)",
    assets: {},
  },
];

export class PlaceholderKibanaBackend implements PlaceholderAdaptor {
  client: SavedObjectsClientContract;

  constructor(client: SavedObjectsClientContract) {
    this.client = client;
  }

  getIntegrationTemplates = (
    _query?: IntegrationTemplateQuery
  ): Promise<IntegrationTemplateSearchResult> => {
    console.log(`Retrieving ${catalog.length} templates from catalog`);
    return Promise.resolve({
      integrations: catalog,
    });
  };

  getAssets = (_templateName: string): Promise<SavedObjectsBulkCreateObject[]> => {
    const stream = fs.createReadStream(__dirname + '/__tests__/test.ndjson');
    const assets = readNDJsonObjects(stream).then(
      (objects) => objects as SavedObjectsBulkCreateObject[]
    );
    return assets;
  };

  loadCatalog(): Promise<void> {
    const toCreate: SavedObjectsBulkCreateObject[] = catalog.map((template) => {
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
    console.log(sampleIntegrations);
    if (query?.added) {
      return Promise.resolve({
        integrations: sampleIntegrations,
      });
    }
    return Promise.resolve({
      integrations: [],
    });
  };
}
