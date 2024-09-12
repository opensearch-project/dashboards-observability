/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { SavedObject, SavedObjectsClientContract } from '../../../../../src/core/server/types';
import { addRequestToMetric } from '../../common/metrics/metrics_helper';
import { IntegrationInstanceBuilder } from './integrations_builder';
import { FileSystemDataAdaptor } from './repository/fs_data_adaptor';
import { IndexDataAdaptor } from './repository/index_data_adaptor';
import { TemplateManager } from './repository/repository';

export class IntegrationsManager {
  client: SavedObjectsClientContract;
  instanceBuilder: IntegrationInstanceBuilder;
  repository: TemplateManager;

  constructor(client: SavedObjectsClientContract, repository?: TemplateManager) {
    this.client = client;
    this.repository =
      repository ??
      new TemplateManager([
        new IndexDataAdaptor(this.client),
        new FileSystemDataAdaptor(path.join(__dirname, '__data__/repository')),
      ]);
    this.instanceBuilder = new IntegrationInstanceBuilder(this.client);
  }

  deleteIntegrationInstance = async (id: string): Promise<string[]> => {
    let children: SavedObject<IntegrationInstance>;
    try {
      children = await this.client.get('integration-instance', id);
    } catch (err) {
      return err.output?.statusCode === 404 ? Promise.resolve([id]) : Promise.reject(err);
    }

    const toDelete = children.attributes.assets
      .filter((i: AssetReference) => i.assetId)
      .map((i: AssetReference) => {
        return { id: i.assetId, type: i.assetType };
      });
    toDelete.push({ id, type: 'integration-instance' });

    const result = Promise.all(
      toDelete.map(
        async (asset: { type: string; id: string }): Promise<string> => {
          try {
            await this.client.delete(asset.type, asset.id);
            return Promise.resolve(asset.id);
          } catch (err) {
            addRequestToMetric('integrations', 'delete', err);
            return err.output?.statusCode === 404 ? Promise.resolve(asset.id) : Promise.reject(err);
          }
        }
      )
    );
    addRequestToMetric('integrations', 'delete', 'count');
    return result;
  };

  // Internal; use getIntegrationTemplates.
  _getAllIntegrationTemplates = async (): Promise<IntegrationTemplateSearchResult> => {
    const integrationList = await this.repository.getIntegrationList();
    const configResults = await Promise.all(integrationList.map((x) => x.getConfig()));
    const configs = configResults.filter((cfg) => cfg.ok) as Array<{ value: IntegrationConfig }>;
    return Promise.resolve({ hits: configs.map((cfg) => cfg.value) });
  };

  // Internal; use getIntegrationTemplates.
  _getIntegrationTemplatesByName = async (
    name: string
  ): Promise<IntegrationTemplateSearchResult> => {
    const integration = await this.repository.getIntegration(name);
    const config = await integration?.getConfig();
    if (!config || !config.ok) {
      return Promise.resolve({ hits: [] });
    }
    return Promise.resolve({ hits: [config.value] });
  };

  getIntegrationTemplates = async (
    query?: IntegrationTemplateQuery
  ): Promise<IntegrationTemplateSearchResult> => {
    if (query?.name) {
      return this._getIntegrationTemplatesByName(query.name);
    }
    return this._getAllIntegrationTemplates();
  };

  getIntegrationInstances = async (
    _query?: IntegrationInstanceQuery
  ): Promise<IntegrationInstancesSearchResult> => {
    addRequestToMetric('integrations', 'get', 'count');
    const result = await this.client.find({ type: 'integration-instance', perPage: 1000 });
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
    const result = (await this.client.get('integration-instance', `${query!.id}`)) as SavedObject<
      IntegrationInstance
    >;
    return Promise.resolve(this.buildInstanceResponse(result));
  };

  buildInstanceResponse = async (
    savedObj: SavedObject<IntegrationInstance>
  ): Promise<IntegrationInstanceResult> => {
    const assets: AssetReference[] | undefined = savedObj.attributes.assets;
    const status: string = assets ? await this.getAssetStatus(assets) : 'available';

    return {
      id: savedObj.id,
      status,
      ...savedObj.attributes,
    };
  };

  getAssetStatus = async (assets: AssetReference[]): Promise<string> => {
    const statuses: Array<{ id: string; status: string }> = await Promise.all(
      assets.map(async (asset) => {
        try {
          await this.client.get(asset.assetType, asset.assetId);
          return { id: asset.assetId, status: 'available' };
        } catch (err) {
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
    indexPattern: string,
    dataSourceMDSId?: string,
    dataSourceMDSLabel?: string,
    workflows?: string[],
    dataSource?: string,
    tableName?: string
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
        indexPattern,
        dataSourceMDSId,
        dataSourceMDSLabel,
        workflows,
        dataSource,
        tableName,
      });
      const test = await this.client.create('integration-instance', result);
      return Promise.resolve({ ...result, id: test.id });
    } catch (err) {
      addRequestToMetric('integrations', 'create', err);
      return Promise.reject({
        message: err.message,
        statusCode: 500,
      });
    }
  };

  getStatic = async (templateName: string, staticPath: string): Promise<Buffer> => {
    const integration = await this.repository.getIntegration(templateName);
    if (integration === null) {
      return Promise.reject({
        message: `Template ${templateName} not found`,
        statusCode: 404,
      });
    }
    const data = await integration.getStatic(staticPath);
    if (data.ok) {
      return data.value;
    }
    const is404 = (data.error as { code?: string }).code === 'ENOENT';
    return Promise.reject({
      message: data.error.message,
      statusCode: is404 ? 404 : 500,
    });
  };

  getSchemas = async (templateName: string): Promise<{ mappings: { [key: string]: unknown } }> => {
    const integration = await this.repository.getIntegration(templateName);
    if (integration === null) {
      return Promise.reject({
        message: `Template ${templateName} not found`,
        statusCode: 404,
      });
    }
    const result = await integration.getSchemas();
    if (result.ok) {
      return result.value;
    }
    const is404 = (result.error as { code?: string }).code === 'ENOENT';
    return Promise.reject({
      message: result.error.message,
      statusCode: is404 ? 404 : 500,
    });
  };

  getAssets = async (templateName: string): Promise<ParsedIntegrationAsset[]> => {
    const integration = await this.repository.getIntegration(templateName);
    if (integration === null) {
      return Promise.reject({
        message: `Template ${templateName} not found`,
        statusCode: 404,
      });
    }
    const assets = await integration.getAssets();
    if (assets.ok) {
      return assets.value;
    }
    const is404 = (assets.error as { code?: string }).code === 'ENOENT';
    return Promise.reject({
      message: assets.error.message,
      statusCode: is404 ? 404 : 500,
    });
  };

  getSampleData = async (templateName: string): Promise<{ sampleData: object[] | null }> => {
    const integration = await this.repository.getIntegration(templateName);
    if (integration === null) {
      return Promise.reject({
        message: `Template ${templateName} not found`,
        statusCode: 404,
      });
    }
    const sampleData = await integration.getSampleData();
    if (sampleData.ok) {
      return sampleData.value;
    }
    const is404 = (sampleData.error as { code?: string }).code === 'ENOENT';
    return Promise.reject({
      message: sampleData.error.message,
      statusCode: is404 ? 404 : 500,
    });
  };
}
