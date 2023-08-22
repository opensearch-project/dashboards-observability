/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { Integration } from './integration';
import { LocalCatalogReader } from './local_catalog_reader';

export class Repository {
  reader: CatalogReader;
  directory: string;

  constructor(directory: string, reader?: CatalogReader) {
    this.directory = directory;
    this.reader = reader ?? new LocalCatalogReader(directory);
  }

  async getIntegrationList(): Promise<Integration[]> {
    try {
      const folders = await this.reader.readDir(this.directory);
      const integrations = await Promise.all(folders.map((i) => this.getIntegration(i)));
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
    const integ = new Integration(path.join(this.directory, name), this.reader);
    const checkResult = await integ.getConfig();
    if (!checkResult.ok) {
      console.error(`Integration '${name}' is invalid:`, checkResult.error);
      return null;
    }
    return integ;
  }
}
