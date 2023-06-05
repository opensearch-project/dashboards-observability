/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IntegrationsAdaptor } from './integrations_adaptor';
import { SavedObjectsClientContract } from '../../../../../src/core/server/types';
import { IntegrationInstanceBuilder } from './integrations_builder';
import { IntegrationsRepository } from './integrations_repository';
import { SimpleSavedObject } from '../../../../../src/core/public';

export class IntegrationsKibanaBackend implements IntegrationsAdaptor {
  client: SavedObjectsClientContract;
  repository: IntegrationsRepository;

  constructor(client: SavedObjectsClientContract, repository?: IntegrationsRepository) {
    this.client = client;
    this.repository = repository ?? new IntegrationsRepository();
  }
  deleteIntegrationInstance = async (id: string): Promise<any> => {
    const children: any = await this.client.get('integration-instance', id);
    children.attributes.assets
      .map((i) => {
        return { id: i.assetId, type: i.assetType };
      })
      .forEach(async (element) => {
        await this.client.delete(element.type, element.id);
      });
    const result = await this.client.delete('integration-instance', id);
    return Promise.resolve(result);
  };

  getIntegrationTemplates = async (
    query?: IntegrationTemplateQuery
  ): Promise<IntegrationTemplateSearchResult> => {
    if (query?.name) {
      const result = await this.repository.getByName(query.name);
      return Promise.resolve({ hits: [result] });
    }
    const result = await this.repository.get();
    console.log(`Retrieving ${result.length} templates from catalog`);
    return Promise.resolve({
      hits: result,
    });
  };

  getIntegrationInstances = async (
    _query?: IntegrationInstanceQuery
  ): Promise<IntegrationInstancesSearchResult> => {
    const result = await this.client.find({ type: 'integration-instance' });
    console.log(result);
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
    console.log(`id:${_query!.id}`);
    const result = await this.client.get('integration-instance', `${_query!.id}`);
    console.log(savedObjectToIntegrationInstance(result));
    return Promise.resolve(savedObjectToIntegrationInstance(result));
  };

  loadIntegrationInstance = async (
    templateName: string,
    name: string
  ): Promise<IntegrationInstance> => {
    const template = await this.repository.getByName(templateName);
    try {
      const result = await new IntegrationInstanceBuilder(this.client).build(template, {
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

/*
 ** UTILITY FUNCTIONS
 */
const savedObjectToIntegrationInstance = (so: any): IntegrationInstanceResult => ({
  id: so.id,
  ...so.attributes,
});
