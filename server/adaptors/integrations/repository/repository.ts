/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { IntegrationReader } from './integration_reader';
import { FileSystemCatalogDataAdaptor } from './fs_data_adaptor';
import { CatalogDataAdaptor } from './catalog_data_adaptor';

export class TemplateManager {
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
      folders.value.map((i) =>
        this.getIntegration(path.relative(this.directory, path.join(this.directory, i)))
      )
    );
    return integrations.filter((x) => x !== null) as IntegrationReader[];
  }

  async getIntegration(integPath: string): Promise<IntegrationReader | null> {
    if ((await this.reader.getDirectoryType(integPath)) !== 'integration') {
      console.error(`Requested integration '${integPath}' does not exist`);
      return null;
    }
    const integ = new IntegrationReader(integPath, this.reader.join(integPath));
    const checkResult = await integ.getConfig();
    if (!checkResult.ok) {
      console.error(`Integration '${integPath}' is invalid:`, checkResult.error);
      return null;
    }
    return integ;
  }
}
