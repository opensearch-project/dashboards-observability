/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { v4 as uuidv4 } from 'uuid';
import { SavedObjectsBulkCreateObject } from '../../../../../src/core/public';
import { SavedObjectsClientContract } from '../../../../../src/core/server';
import { IntegrationReader } from './repository/integration_reader';
import { deepCheck } from './repository/utils';

interface BuilderOptions {
  name: string;
  indexPattern: string;
  dataSourceMDSId?: string;
  dataSourceMDSLabel?: string;
  workflows?: string[];
  dataSource?: string;
  tableName?: string;
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
    const assets1 = this.addMDSReference(
      remapped,
      options.dataSource,
      options.dataSourceMDSId,
      options.dataSourceMDSLabel
    );
    const withDataSource = this.remapDataSource(assets1, options.indexPattern);
    const withSubstitutedQueries = this.substituteQueries(
      withDataSource,
      options.dataSource,
      options.tableName
    );
    const refs = await this.postAssets(withSubstitutedQueries as SavedObjectsBulkCreateObject[]);
    const builtInstance = await this.buildInstance(integration, refs, options);
    return builtInstance;
  }

  substituteSavedSearch(
    assets: SavedObject[],
    dataSource?: string,
    tableName?: string
  ): SavedObject[] {
    if (!dataSource || !tableName) {
      return assets;
    }

    assets = assets.map((asset) => {
      if (asset.type === 'search') {
        const searchSourceMeta = asset.attributes.kibanaSavedObjectMeta.searchSourceJSON;
        let searchSource;

        try {
          searchSource = JSON.parse(searchSourceMeta);
        } catch (error) {
          console.error('Invalid JSON in searchSourceJSON:', error);
          return asset;
        }

        if (searchSource.query?.query && searchSource.query.language === 'SQL') {
          searchSource.query.query = searchSource.query.query.replaceAll('{table_name}', tableName);
        }

        if (searchSourceMeta.dataset.type === 's3glue') {
          asset.attributes.title = `${dataSource}.default.${tableName}`;
        }

        asset.attributes.kibanaSavedObjectMeta.searchSourceJSON = JSON.stringify(searchSource);
      }

      return asset;
    });

    return assets;
  }

  // If we have a data source or table specified, hunt for saved queries and update them with the
  // new DS/table.
  substituteQueries(assets: SavedObject[], dataSource?: string, tableName?: string): SavedObject[] {
    if (!dataSource) {
      return assets;
    }

    assets = assets.map((asset) => {
      if (asset.type === 'observability-search') {
        const savedQuery = ((asset.attributes as unknown) as {
          savedQuery: {
            // The actual SavedSearchAttributes type uses "dataSources", but when exporting it's
            // "data_sources". I'm not sure why the discrepancy exists but since that's the exported
            // format we need to define our own type here.
            data_sources: string;
            query: string;
            query_lang: string;
          };
        }).savedQuery;
        if (!savedQuery.data_sources) {
          return asset;
        }
        const dataSources = JSON.parse(savedQuery.data_sources) as Array<{
          name: string;
          type: string;
          label: string;
          value: string;
        }>;
        for (const ds of dataSources) {
          if (ds.type !== 's3glue') {
            continue; // Nothing to do
          }
          // TODO is there a distinction between these where we should only set one? They're all
          // equivalent in every export I've seen.
          ds.name = dataSource;
          ds.label = dataSource;
          ds.value = dataSource;
        }
        savedQuery.data_sources = JSON.stringify(dataSources);

        if (savedQuery.query_lang === 'SQL' && tableName) {
          savedQuery.query = savedQuery.query.replaceAll('{table_name}', tableName);
        }
      }
      return asset;
    });

    return assets;
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

  remapDataSource(assets: SavedObject[], dataSource: string | undefined): SavedObject[] {
    if (!dataSource) return assets;
    return assets.map((asset) => {
      if (asset.type === 'index-pattern') {
        asset.attributes.title = dataSource;
      }
      return asset;
    });
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

  addMDSReference(
    assets: SavedObject[],
    dataSource?: string,
    dataSourceMDSId?: string,
    dataSourceMDSLabel?: string
  ): SavedObject[] {
    if (!dataSource) {
      return assets;
    }
    return assets.map((asset) => {
      // Check if the asset type is 'index-pattern' or if the title contains 'Timeline' visualization
      if (
        asset?.type &&
        (asset.type === 'index-pattern' ||
          (asset.type === 'visualization' && asset.attributes.visState.type === 'timelion'))
      ) {
        const dataSourceIndex = asset.references.findIndex((ref) => ref.type === 'data-source');

        if (dataSourceIndex !== -1) {
          // If a data-source reference exists, update it
          asset.references[dataSourceIndex] = {
            id: dataSourceMDSId ?? '',
            name: dataSourceMDSLabel ?? 'Local cluster',
            type: 'data-source',
          };
        } else {
          // If no data-source reference exists, add a new one
          asset.references.push({
            id: dataSourceMDSId ?? '',
            name: dataSourceMDSLabel ?? 'Local cluster',
            type: 'data-source',
          });
        }
      }

      if (asset.type === 'search') {
        if (asset?.attributes?.kibanaSavedObjectMeta?.searchSourceJSON) {
          const searchSourceJSON = JSON.parse(
            asset.attributes.kibanaSavedObjectMeta.searchSourceJSON
          );

          if (searchSourceJSON?.query?.dataset?.dataSource) {
            searchSourceJSON.query.dataset.dataSource.id = dataSourceMDSId ?? '';
            searchSourceJSON.query.dataset.dataSource.name = dataSourceMDSLabel ?? 'Local cluster';
            searchSourceJSON.query.dataset.dataSource.type = 'data-source';
          }

          asset.attributes.kibanaSavedObjectMeta.searchSourceJSON = JSON.stringify(
            searchSourceJSON
          );
        }
      }

      return asset;
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
    const instance: IntegrationInstance = {
      name: options.name,
      templateName: config.value.name,
      dataSource: options.indexPattern,
      creationDate: new Date().toISOString(),
      assets: refs,
    };
    if (options.dataSourceMDSId) {
      instance.references = [
        {
          id: options.dataSourceMDSId || '',
          name: options.dataSourceMDSLabel || 'Local cluster',
          type: 'data-source',
        },
      ];
    }

    return Promise.resolve(instance);
  }
}
