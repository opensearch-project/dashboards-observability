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

  private async asJsonAdaptor(): Promise<JsonCatalogDataAdaptor> {
    const results = await this.client.find({ type: 'integration-template' });
    const filteredIntegrations: SerializedIntegration[] = results.saved_objects
      .map((obj) => obj.attributes as SerializedIntegration)
      .filter((obj) => this.directory === undefined || this.directory === obj.name);
    return new JsonCatalogDataAdaptor(filteredIntegrations);
  }

  async findIntegrationVersions(dirname?: string | undefined): Promise<Result<string[], Error>> {
    const adaptor = await this.asJsonAdaptor();
    return await adaptor.findIntegrationVersions(dirname);
  }

  async readFile(filename: string, type?: IntegrationPart): Promise<Result<object[] | object>> {
    const adaptor = await this.asJsonAdaptor();
    return await adaptor.readFile(filename, type);
  }

  async readFileRaw(filename: string, type?: IntegrationPart): Promise<Result<Buffer>> {
    const adaptor = await this.asJsonAdaptor();
    return await adaptor.readFileRaw(filename, type);
  }

  async findIntegrations(dirname: string = '.'): Promise<Result<string[]>> {
    const adaptor = await this.asJsonAdaptor();
    return await adaptor.findIntegrations(dirname);
  }

  async getDirectoryType(dirname?: string): Promise<'integration' | 'repository' | 'unknown'> {
    const adaptor = await this.asJsonAdaptor();
    return await adaptor.getDirectoryType(dirname);
  }

  join(filename: string): IndexDataAdaptor {
    return new IndexDataAdaptor(this.client, filename);
  }
}
