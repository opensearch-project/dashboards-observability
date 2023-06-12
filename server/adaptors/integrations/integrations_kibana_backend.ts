/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { IntegrationsAdaptor } from './integrations_adaptor';
import { SavedObjectsClientContract } from '../../../../../src/core/server/types';
import { IntegrationInstanceBuilder } from './integrations_builder';
import { Repository } from './repository/repository';

export class IntegrationsKibanaBackend implements IntegrationsAdaptor {
  client: SavedObjectsClientContract;
  repository: Repository;

  constructor(client: SavedObjectsClientContract, repository?: Repository) {
    this.client = client;
    this.repository = repository ?? new Repository(path.join(__dirname, '__data__/repository'));
  }

  deleteIntegrationInstance = async (id: string): Promise<any> => {
    const children: any = await this.client.get('integration-instance', id);
    children.attributes.assets
      .map((i: any) => {
        return { id: i.assetId, type: i.assetType };
      })
      .forEach(async (element: any) => {
        await this.client.delete(element.type, element.id);
      });
    const result = await this.client.delete('integration-instance', id);
    return Promise.resolve(result);
  };

  getIntegrationTemplates = async (
    query?: IntegrationTemplateQuery
  ): Promise<IntegrationTemplateSearchResult> => {
    if (query?.name) {
      const integration = await this.repository.getIntegration(query.name);
      const config = await integration?.getConfig();
      return Promise.resolve({ hits: config ? [config] : [] });
    }
    const integrationList = await this.repository.getIntegrationList();
    const configList = await Promise.all(integrationList.map((x) => x.getConfig()));
    return Promise.resolve({ hits: configList.filter((x) => x !== null) as IntegrationTemplate[] });
  };

  getIntegrationInstances = async (
    _query?: IntegrationInstanceQuery
  ): Promise<IntegrationInstancesSearchResult> => {
    const result = await this.client.find({ type: 'integration-instance' });
    return Promise.resolve({
      total: result.total,
      hits: result.saved_objects?.map((x) => ({
        ...x.attributes!,
        id: x.id,
      })) as IntegrationInstanceResult[],
    });
  };

  getIntegrationInstance = async (
    _query?: IntegrationInstanceQuery
  ): Promise<IntegrationInstanceResult> => {
    const result = await this.client.get('integration-instance', `${_query!.id}`);
    return Promise.resolve(savedObjectToIntegrationInstance(result));
  };

  loadIntegrationInstance = async (
    templateName: string,
    name: string
  ): Promise<IntegrationInstance> => {
    const template = await await this.repository.getIntegration(templateName);
    try {
      const result = await new IntegrationInstanceBuilder(this.client).build(template!, {
        name,
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

  getStatic = async (templateName: string, staticPath: string): Promise<Buffer> => {
    const data = await (await this.repository.getIntegration(templateName))?.getStatic(staticPath);
    if (!data) {
      return Promise.reject({
        message: `Asset ${staticPath} not found`,
        statusCode: 404,
      });
    }
    return Promise.resolve(data);
  };
}

/*
 ** UTILITY FUNCTIONS
 */
const savedObjectToIntegrationInstance = (so: any): IntegrationInstanceResult => ({
  id: so.id,
  ...so.attributes,
});
