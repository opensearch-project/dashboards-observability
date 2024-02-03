/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CatalogDataAdaptor, IntegrationPart } from './catalog_data_adaptor';
import { SavedObjectsClientContract } from '../../../../../../src/core/server/types';
import { JsonCatalogDataAdaptor } from './json_data_adaptor';

export class IndexDataAdaptor implements CatalogDataAdaptor {
  isConfigLocalized = true;
  directory?: string;
  client: SavedObjectsClientContract;

  constructor(client: SavedObjectsClientContract, directory?: string) {
    this.directory = directory;
    this.client = client;
  }

  async findIntegrationVersions(dirname?: string | undefined): Promise<Result<string[], Error>> {
    const integrationVersions = await this.client.find({
      type: 'integration-template',
      fields: ['name', 'version'],
      search: dirname ? `"${dirname}"` : undefined,
      searchFields: ['name'],
    });
    const adaptor = new JsonCatalogDataAdaptor(
      integrationVersions.saved_objects.map((obj) => obj.attributes as SerializedIntegration)
    );
    return await adaptor.findIntegrationVersions(dirname);
  }

  async readFile(filename: string, type?: IntegrationPart): Promise<Result<object[] | object>> {
    // Duplicates a lot of logic from the Json Adaptor version since we need to parse config
    // for an efficient network query anyways
    if (type !== undefined) {
      return {
        ok: false,
        error: new Error('JSON adaptor does not support subtypes (isConfigLocalized: true)'),
      };
    }

    const filenameParts = filename.match(/([\w]+)-(\d+(\.\d+)*)\.json/);
    if (!filenameParts) {
      return { ok: false, error: new Error(`Invalid Config filename: ${filename}`) };
    }

    const integrations = await this.client.find({
      type: 'integration-template',
      search: `"${filenameParts[1]}" + "${filenameParts[2]}"`,
      searchFields: ['name', 'version'],
    });
    if (integrations.total === 0) {
      return { ok: false, error: new Error('Config file not found: ' + filename) };
    }

    return { ok: true, value: integrations.saved_objects[0].attributes as object };
  }

  async readFileRaw(_filename: string, _type?: IntegrationPart): Promise<Result<Buffer>> {
    return {
      ok: false,
      error: new Error('JSON adaptor does not support raw files (isConfigLocalized: true)'),
    };
  }

  async findIntegrations(dirname: string = '.'): Promise<Result<string[]>> {
    const dir = dirname !== '.' ? dirname : this.directory;
    const integrations = await this.client.find({
      type: 'integration-template',
      fields: ['name'],
      search: dir ? `"${dir}"` : undefined,
      searchFields: ['name'],
    });
    const names = integrations.saved_objects.map(
      (obj) => (obj.attributes as SerializedIntegration).name
    );
    return {
      ok: true,
      value: [...new Set(names)],
    };
  }

  async getDirectoryType(dirname?: string): Promise<'integration' | 'repository' | 'unknown'> {
    const names = await this.findIntegrations(dirname ?? '.');
    if (!names.value || names.value.length === 0) {
      return 'unknown';
    }
    if (names.value.length === 1) {
      return 'integration';
    }
    return 'repository';
  }

  join(filename: string): IndexDataAdaptor {
    return new IndexDataAdaptor(this.client, filename);
  }
}
