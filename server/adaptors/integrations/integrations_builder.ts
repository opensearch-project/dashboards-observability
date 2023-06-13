/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { v4 as uuidv4 } from 'uuid';
import { uuidRx } from 'public/components/custom_panels/redux/panel_slice';
import { SavedObjectsClientContract } from '../../../../../src/core/server';
import { Integration } from './repository/integration';
import { SavedObjectsBulkCreateObject } from '../../../../../src/core/public';

interface BuilderOptions {
  name: string;
  dataset: string;
  namespace: string;
  dataSource: string;
}

export const indexPatternsMap: { [key: string]: string[] } = {
  nginx: ['ss4o_logs-*-*'],
};

export class IntegrationInstanceBuilder {
  client: SavedObjectsClientContract;

  constructor(client: SavedObjectsClientContract) {
    this.client = client;
  }

  async build(integration: Integration, options: BuilderOptions): Promise<IntegrationInstance> {
    const instance = integration
      .deepCheck()
      .then((result) => {
        if (!result) {
          return Promise.reject(new Error('Integration is not valid'));
        }
      })
      .then(() => integration.getAssets())
      .then((assets) => this.remapIDs(assets.savedObjects!))
      .then((assets) => this.remapDataSource(assets, options.name, options.dataSource))
      .then((assets) => this.postAssets(assets))
      .then((refs) => this.buildInstance(integration, refs, options));
    return instance;
  }

  remapDataSource(assets: any[], templateName: string, dataSource: string | undefined): any[] {
    if (!dataSource) return assets;
    indexPatternsMap[templateName].forEach((element) => {
      assets.forEach((asset) => {
        if (asset.attributes.title === element) {
          asset.attributes.title = dataSource;
        }
      });
    });
    return assets;
  }

  remapIDs(assets: any[]): any[] {
    const toRemap = assets.filter((asset) => asset.id);
    const idMap = new Map<string, string>();
    return toRemap.map((item) => {
      if (!idMap.has(item.id)) {
        idMap.set(item.id, uuidv4());
      }
      item.id = idMap.get(item.id)!;
      for (let ref = 0; ref < item.references.length; ref++) {
        const refId = item.references[ref].id;
        if (!idMap.has(refId)) {
          idMap.set(refId, uuidv4());
        }
        item.references[ref].id = idMap.get(refId)!;
      }
      return item;
    });
  }

  async postAssets(assets: any[]): Promise<AssetReference[]> {
    try {
      const response = await this.client.bulkCreate(assets as SavedObjectsBulkCreateObject[]);
      const refs: AssetReference[] = response.saved_objects.map((obj: any) => {
        return {
          assetType: obj.type,
          assetId: obj.id,
          status: 'available', // Assuming a successfully created object is available
          isDefaultAsset: obj.type === 'dashboard', // Assuming for now that dashboards are default
          description: obj.attributes?.title,
        };
      });
      return Promise.resolve(refs);
    } catch (err: any) {
      return Promise.reject(err);
    }
  }

  async buildInstance(
    integration: Integration,
    refs: AssetReference[],
    options: BuilderOptions
  ): Promise<IntegrationInstance> {
    const config: IntegrationTemplate = (await integration.getConfig())!;
    return Promise.resolve({
      name: options.name,
      templateName: config.name,
      dataSource: {
        sourceType: config.type,
        dataset: options.dataset,
        namespace: options.namespace,
      },
      creationDate: new Date().toISOString(),
      assets: refs,
    });
  }
}
