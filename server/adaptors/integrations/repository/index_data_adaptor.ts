/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CatalogDataAdaptor, IntegrationPart } from './catalog_data_adaptor';
import { SavedObjectsClientContract } from '../../../../../../src/core/server/types';

export class IndexDataAdaptor implements CatalogDataAdaptor {
  isConfigLocalized = true;
  directory: string;
  client: SavedObjectsClientContract;

  constructor(directory: string, client: SavedObjectsClientContract) {
    this.directory = directory;
    this.client = client;
  }

  async findIntegrationVersions(dirname?: string | undefined): Promise<Result<string[], Error>> {
    const results = await this.client.find({ type: 'integration-template' });
    const versions: string[] = [];
    for (const result of results.saved_objects) {
      const config = result.attributes as IntegrationConfig;
      if (dirname && config.name !== dirname) {
        continue;
      }
      versions.push(config.version);
    }
    return { ok: true, value: versions };
  }

  async readFile(_filename: string, _type?: IntegrationPart): Promise<Result<object[] | object>> {
    return { ok: false, error: new Error('Not implemented') };
  }

  async readFileRaw(_filename: string, _type?: IntegrationPart): Promise<Result<Buffer>> {
    return { ok: false, error: new Error('Not implemented') };
  }

  async findIntegrations(_dirname: string = '.'): Promise<Result<string[]>> {
    return { ok: false, error: new Error('Not implemented') };
  }

  async getDirectoryType(dirname?: string): Promise<'integration' | 'repository' | 'unknown'> {
    // Assume filter-zero-times is repo, once is integration, twice is invalid
    // Not sure how safe that assumption is
    if (this.directory && dirname) {
      return 'unknown';
    }
    if (this.directory || dirname) {
      return 'integration';
    }
    return 'repository';
  }

  join(filename: string): IndexDataAdaptor {
    return new IndexDataAdaptor(filename, this.client);
  }
}
