/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { v4 as uuidv4 } from 'uuid';
import { SavedObjectsClientContract } from '../../../../../src/core/server';
import { IntegrationReader } from './repository/integration_reader';
import { SavedObjectsBulkCreateObject } from '../../../../../src/core/public';
import { deepCheck } from './repository/utils';

interface BuilderOptions {
  name: string;
  dataSource: string;
  workflows?: string[];
}

interface SavedObject {
  id: string;
  type: string;
  attributes: { title: string };
  references: Array<{ id: string }>;
}

export class IntegrationInstanceBuilder {
  client: SavedObjectsClientContract;

  constructor(client: SavedObjectsClientContract) {
    this.client = client;
  }

  async build(
    integration: IntegrationReader,
    options: BuilderOptions
  ): Promise<IntegrationInstance> {
    const instance = await deepCheck(integration);
    if (!instance.ok) {
      return Promise.reject(instance.error);
    }
    const assets = await integration.getAssets();
    if (!assets.ok) {
      return Promise.reject(assets.error);
    }
    const remapped = this.remapIDs(this.getSavedObjectBundles(assets.value, options.workflows));
    const withDataSource = this.remapDataSource(remapped, options.dataSource);
    const refs = await this.postAssets(withDataSource);
    const builtInstance = await this.buildInstance(integration, refs, options);
    return builtInstance;
  }

  getSavedObjectBundles(
    assets: ParsedIntegrationAsset[],
    includeWorkflows?: string[]
  ): SavedObject[] {
    return assets
      .filter((asset) => {
        // At this stage we only care about installing bundles
        if (asset.type !== 'savedObjectBundle') {
          return false;
        }
        // If no workflows present: default to all workflows
        // Otherwise only install if workflow is present
        if (!asset.workflows || !includeWorkflows) {
          return true;
        }
        return includeWorkflows.some((w) => asset.workflows?.includes(w));
      })
      .map((asset) => (asset as { type: 'savedObjectBundle'; data: object[] }).data)
      .flat() as SavedObject[];
  }

  remapDataSource(
    assets: SavedObject[],
    dataSource: string | undefined
  ): Array<{ type: string; attributes: { title: string } }> {
    if (!dataSource) return assets;
    assets = assets.map((asset) => {
      if (asset.type === 'index-pattern') {
        asset.attributes.title = dataSource;
      }
      return asset;
    });
    return assets;
  }

  remapIDs(assets: SavedObject[]): SavedObject[] {
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

  async postAssets(assets: SavedObjectsBulkCreateObject[]): Promise<AssetReference[]> {
    try {
      const response = await this.client.bulkCreate(assets);
      const refs: AssetReference[] = (response.saved_objects as SavedObject[]).map(
        (obj: SavedObject) => {
          return {
            assetType: obj.type,
            assetId: obj.id,
            status: 'available', // Assuming a successfully created object is available
            isDefaultAsset: obj.type === 'dashboard', // Assuming for now that dashboards are default
            description: obj.attributes?.title,
          };
        }
      );
      return Promise.resolve(refs);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  async buildInstance(
    integration: IntegrationReader,
    refs: AssetReference[],
    options: BuilderOptions
  ): Promise<IntegrationInstance> {
    const config: Result<IntegrationConfig> = await integration.getConfig();
    if (!config.ok) {
      return Promise.reject(
        new Error('Attempted to create instance with invalid template', config.error)
      );
    }
    return Promise.resolve({
      name: options.name,
      templateName: config.value.name,
      dataSource: options.dataSource,
      creationDate: new Date().toISOString(),
      assets: refs,
    });
  }
}
