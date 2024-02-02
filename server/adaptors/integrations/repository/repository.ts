/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IntegrationReader } from './integration_reader';
import { CatalogDataAdaptor } from './catalog_data_adaptor';

export class TemplateManager {
  readers: CatalogDataAdaptor[];

  constructor(readers: CatalogDataAdaptor[]) {
    this.readers = readers;
  }

  async getIntegrationList(): Promise<IntegrationReader[]> {
    const lists = await Promise.all(
      this.readers.map((reader) => this.getReaderIntegrationList(reader))
    );
    const flattened = lists.flat();

    // If there are collisions by name, prioritize earlier readers over later ones.
    const seen = new Set();
    return flattened.filter((item) => {
      if (seen.has(item.name)) {
        return false;
      }
      seen.add(item.name);
      return true;
    });
  }

  private async getReaderIntegrationList(reader: CatalogDataAdaptor): Promise<IntegrationReader[]> {
    const folders = await reader.findIntegrations();
    if (!folders.ok) {
      return [];
    }
    const integrations = await Promise.all(
      folders.value.map((integrationName) => this.getReaderIntegration(reader, integrationName))
    );
    return integrations.filter((x) => x !== null) as IntegrationReader[];
  }

  async getIntegration(integrationName: string): Promise<IntegrationReader | null> {
    const maybeIntegrations = await Promise.all(
      this.readers.map((reader) => this.getReaderIntegration(reader, integrationName))
    );
    for (const maybeIntegration of maybeIntegrations) {
      if (maybeIntegration !== null) {
        return maybeIntegration;
      }
    }
    return null;
  }

  private async getReaderIntegration(
    reader: CatalogDataAdaptor,
    integrationName: string
  ): Promise<IntegrationReader | null> {
    if ((await reader.getDirectoryType(integrationName)) !== 'integration') {
      return null;
    }
    const integ = new IntegrationReader(integrationName, reader.join(integrationName));
    const checkResult = await integ.getConfig();
    if (!checkResult.ok) {
      return null;
    }
    return integ;
  }
}
