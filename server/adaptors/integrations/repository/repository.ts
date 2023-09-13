/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { Integration } from './integration';
import { FileSystemCatalogDataAdaptor } from './fs_data_adaptor';

export class Repository {
  reader: CatalogDataAdaptor;
  directory: string;

  constructor(directory: string, reader?: CatalogDataAdaptor) {
    this.directory = directory;
    this.reader = reader ?? new FileSystemCatalogDataAdaptor(directory);
  }

  async getIntegrationList(): Promise<Integration[]> {
    try {
      // TODO in the future, we want to support traversing nested directory structures.
      const folders = await this.reader.readDir('');
      const integrations = await Promise.all(
        folders.map((i) => this.getIntegration(path.basename(i)))
      );
      return integrations.filter((x) => x !== null) as Integration[];
    } catch (error) {
      console.error(`Error reading integration directories in: ${this.directory}`, error);
      return [];
    }
  }

  async getIntegration(name: string): Promise<Integration | null> {
    if (!(await this.reader.isDirectory(name))) {
      console.error(`Requested integration '${name}' does not exist`);
      return null;
    }
    const integ = new Integration(name, this.reader.join(name));
    const checkResult = await integ.getConfig();
    if (!checkResult.ok) {
      console.error(`Integration '${name}' is invalid:`, checkResult.error);
      return null;
    }
    return integ;
  }
}
