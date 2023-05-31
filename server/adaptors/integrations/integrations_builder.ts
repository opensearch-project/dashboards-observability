/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { v4 as uuidv4 } from 'uuid';
import { SavedObjectsClientContract } from '../../../../../src/core/server';

interface BuilderOptions {
  name: string;
  dataset: string;
  namespace: string;
  tags?: string[];
}

export class IntegrationInstanceBuilder {
  client: SavedObjectsClientContract;

  constructor(client: SavedObjectsClientContract) {
    this.client = client;
  }

  async build(
    template: IntegrationTemplate,
    options: BuilderOptions
  ): Promise<IntegrationInstance> {
    const result = this.validate(template)
      .then(() => this.post_assets(template.displayAssets))
      .then((refs) => this.build_instance(template, refs, options));
    return result;
  }

  async validate(_template: IntegrationTemplate): Promise<void> {
    // Assuming everything is valid for now
    return Promise.resolve();
  }

  async post_assets(assets: DisplayAsset[]): Promise<AssetReference[]> {
    try {
      const deserializedAssets = assets.map((asset) => JSON.parse(asset.body));
      const response = await this.client.bulkCreate(deserializedAssets);
      const refs: AssetReference[] = response.saved_objects.map((obj) => {
        return {
          assetType: obj.type,
          assetId: obj.id,
          status: 'available', // Assuming a successfully created object is available
          isDefaultAsset: obj.type === 'dashboard', // Assuming for now that dashboards are default
        };
      });
      return Promise.resolve(refs);
    } catch (err: any) {
      return Promise.reject(err);
    }
  }

  async build_instance(
    template: IntegrationTemplate,
    refs: AssetReference[],
    options: BuilderOptions
  ): Promise<IntegrationInstance> {
    return Promise.resolve({
      name: options.name,
      templateName: template.name,
      dataSource: {
        sourceType: template.integrationType,
        dataset: options.dataset,
        namespace: options.namespace,
      },
      tags: options.tags,
      creationDate: new Date(),
      status: 'unknown',
      assets: refs,
      addedBy: 'unknown',
    });
  }
}
