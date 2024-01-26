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
    return lists.flat();
  }

  private async getReaderIntegrationList(reader: CatalogDataAdaptor): Promise<IntegrationReader[]> {
    const folders = await reader.findIntegrations();
    if (!folders.ok) {
      console.error(`Error reading integrations in: ${reader}`, folders.error);
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
      console.error(`Requested integration '${integrationName}' does not exist`);
      return null;
    }
    const integ = new IntegrationReader(integrationName, reader.join(integrationName));
    const checkResult = await integ.getConfig();
    if (!checkResult.ok) {
      console.error(`Integration '${integrationName}' is invalid:`, checkResult.error);
      return null;
    }
    return integ;
  }
}
