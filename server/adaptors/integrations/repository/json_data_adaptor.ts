/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CatalogDataAdaptor, IntegrationPart } from './catalog_data_adaptor';

/**
 * A CatalogDataAdaptor that reads from a provided list of JSON objects.
 * Used to read Integration information when the user uploads their own catalog.
 */
export class JsonCatalogDataAdaptor implements CatalogDataAdaptor {
  integrationsList: SerializedIntegration[];

  /**
   * Creates a new FileSystemCatalogDataAdaptor instance.
   *
   * @param directory The base directory from which to read files. This is not sanitized.
   */
  constructor(integrationsList: SerializedIntegration[]) {
    this.integrationsList = integrationsList;
  }

  async findIntegrationVersions(dirname?: string | undefined): Promise<Result<string[], Error>> {
    // TODO
    return { ok: false, error: new Error('Not Implemented') };
  }

  async readFile(filename: string, type?: IntegrationPart): Promise<Result<object[] | object>> {
    // TODO
    return { ok: false, error: new Error('Not Implemented') };
  }

  async readFileRaw(filename: string, type?: IntegrationPart): Promise<Result<Buffer>> {
    // TODO
    return { ok: false, error: new Error('Not Implemented') };
  }

  async findIntegrations(dirname: string = '.'): Promise<Result<string[]>> {
    // TODO
    return { ok: false, error: new Error('Not Implemented') };
  }

  private async collectIntegrationsRecursive(
    dirname: string,
    integrations: string[]
  ): Promise<void> {
    // TODO
    return;
  }

  async getDirectoryType(dirname?: string): Promise<'integration' | 'repository' | 'unknown'> {
    // First, filter list by dirname if available
    const integrationsList = dirname
      ? this.integrationsList.filter((i) => i.config.name === dirname)
      : this.integrationsList;
    if (integrationsList.length === 0) {
      return 'unknown';
    }
    // The list is an integration iff all of its names match
    for (let i = 0; i < integrationsList.length - 1; i++) {
      if (integrationsList[i].config.name !== integrationsList[i + 1].config.name) {
        return 'repository';
      }
    }
    return 'integration';
  }

  join(filename: string): JsonCatalogDataAdaptor {
    // In other adaptors, joining moves from directories to integrations.
    // Since for JSON adapting we use a flat structure, we just filter.
    return new JsonCatalogDataAdaptor(
      this.integrationsList.filter((i) => i.config.name === filename)
    );
  }
}
