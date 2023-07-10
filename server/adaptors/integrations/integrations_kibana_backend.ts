/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { addRequestToMetric } from '../../../server/common/metrics/metrics_helper';
import { IntegrationsAdaptor } from './integrations_adaptor';
import { SavedObject, SavedObjectsClientContract } from '../../../../../src/core/server/types';
import { IntegrationInstanceBuilder } from './integrations_builder';
import { Repository } from './repository/repository';

export class IntegrationsKibanaBackend implements IntegrationsAdaptor {
  client: SavedObjectsClientContract;
  instanceBuilder: IntegrationInstanceBuilder;
  repository: Repository;

  constructor(client: SavedObjectsClientContract, repository?: Repository) {
    this.client = client;
    this.repository = repository ?? new Repository(path.join(__dirname, '__data__/repository'));
    this.instanceBuilder = new IntegrationInstanceBuilder(this.client);
  }

  deleteIntegrationInstance = async (id: string): Promise<string[]> => {
    let children: any;
    try {
      children = await this.client.get('integration-instance', id);
    } catch (err: any) {
      return err.output?.statusCode === 404 ? Promise.resolve([id]) : Promise.reject(err);
    }

    const toDelete = children.attributes.assets
      .filter((i: any) => i.assetId)
      .map((i: any) => {
        return { id: i.assetId, type: i.assetType };
      });
    toDelete.push({ id, type: 'integration-instance' });

    const result = Promise.all(
      toDelete.map(
        async (asset: { type: string; id: string }): Promise<string> => {
          try {
            await this.client.delete(asset.type, asset.id);
            return Promise.resolve(asset.id);
          } catch (err: any) {
            addRequestToMetric('integrations', 'delete', err);
            return err.output?.statusCode === 404 ? Promise.resolve(asset.id) : Promise.reject(err);
          }
        }
      )
    );
    addRequestToMetric('integrations', 'delete', 'count');
    return result;
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
    addRequestToMetric('integrations', 'get', 'count');
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
    query?: IntegrationInstanceQuery
  ): Promise<IntegrationInstanceResult> => {
    addRequestToMetric('integrations', 'get', 'count');
    const result = await this.client.get('integration-instance', `${query!.id}`);
    return Promise.resolve(this.buildInstanceResponse(result));
  };

  buildInstanceResponse = async (
    savedObj: SavedObject<unknown>
  ): Promise<IntegrationInstanceResult> => {
    const assets: AssetReference[] | undefined = (savedObj.attributes as any)?.assets;
    const status: string = assets ? await this.getAssetStatus(assets) : 'available';

    return {
      id: savedObj.id,
      status,
      ...(savedObj.attributes as any),
    };
  };

  getAssetStatus = async (assets: AssetReference[]): Promise<string> => {
    const statuses: Array<{ id: string; status: string }> = await Promise.all(
      assets.map(async (asset) => {
        try {
          await this.client.get(asset.assetType, asset.assetId);
          return { id: asset.assetId, status: 'available' };
        } catch (err: any) {
          const statusCode = err.output?.statusCode;
          if (statusCode && 400 <= statusCode && statusCode < 500) {
            return { id: asset.assetId, status: 'unavailable' };
          }
          console.error('Failed to get asset status', err);
          return { id: asset.assetId, status: 'unknown' };
        }
      })
    );

    const [available, unavailable, unknown] = [
      statuses.filter((x) => x.status === 'available').length,
      statuses.filter((x) => x.status === 'unavailable').length,
      statuses.filter((x) => x.status === 'unknown').length,
    ];
    if (unknown > 0) return 'unknown';
    if (unavailable > 0 && available > 0) return 'partially-available';
    if (unavailable > 0) return 'unavailable';
    return 'available';
  };

  loadIntegrationInstance = async (
    templateName: string,
    name: string,
    dataSource: string
  ): Promise<IntegrationInstance> => {
    const template = await this.repository.getIntegration(templateName);
    if (template === null) {
      return Promise.reject({
        message: `Template ${templateName} not found`,
        statusCode: 404,
      });
    }
    try {
      addRequestToMetric('integrations', 'create', 'count');
      const result = await this.instanceBuilder.build(template, {
        name,
        dataSource,
      });
      const test = await this.client.create('integration-instance', result);
      return Promise.resolve({ ...result, id: test.id });
    } catch (err: any) {
      addRequestToMetric('integrations', 'create', err);
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

  getSchemas = async (templateName: string): Promise<any> => {
    const integration = await this.repository.getIntegration(templateName);
    if (integration === null) {
      return Promise.reject({
        message: `Template ${templateName} not found`,
        statusCode: 404,
      });
    }
    return Promise.resolve(integration.getSchemas());
  };

  getAssets = async (templateName: string): Promise<{ savedObjects?: any }> => {
    const integration = await this.repository.getIntegration(templateName);
    if (integration === null) {
      return Promise.reject({
        message: `Template ${templateName} not found`,
        statusCode: 404,
      });
    }
    return Promise.resolve(integration.getAssets());
  };

  getSampleData = async (templateName: string): Promise<{ sampleData: object[] | null }> => {
    const integration = await this.repository.getIntegration(templateName);
    if (integration === null) {
      return Promise.reject({
        message: `Template ${templateName} not found`,
        statusCode: 404,
      });
    }
    return Promise.resolve(integration.getSampleData());
  };
}
