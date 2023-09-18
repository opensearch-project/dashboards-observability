/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { IntegrationReader } from './integration';
import { FileSystemCatalogDataAdaptor } from './fs_data_adaptor';

export class RepositoryReader {
  reader: CatalogDataAdaptor;
  directory: string;

  constructor(directory: string, reader?: CatalogDataAdaptor) {
    this.directory = directory;
    this.reader = reader ?? new FileSystemCatalogDataAdaptor(directory);
  }

  async getIntegrationList(): Promise<IntegrationReader[]> {
    // TODO in the future, we want to support traversing nested directory structures.
    const folders = await this.reader.findIntegrations();
    if (!folders.ok) {
      console.error(`Error reading integration directories in: ${this.directory}`, folders.error);
      return [];
    }
    const integrations = await Promise.all(
      folders.value.map((i) => this.getIntegration(path.basename(i)))
    );
    return integrations.filter((x) => x !== null) as IntegrationReader[];
  }

  async getIntegration(name: string): Promise<IntegrationReader | null> {
    if ((await this.reader.getDirectoryType(name)) !== 'integration') {
      console.error(`Requested integration '${name}' does not exist`);
      return null;
    }
    const integ = new IntegrationReader(name, this.reader.join(name));
    const checkResult = await integ.getConfig();
    if (!checkResult.ok) {
      console.error(`Integration '${name}' is invalid:`, checkResult.error);
      return null;
    }
    return integ;
  }
}
