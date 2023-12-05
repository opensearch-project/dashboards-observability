/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import path from 'path';

/**
 * A CatalogDataAdaptor that reads from a provided list of JSON objects.
 * Used to read Integration information when the user uploads their own catalog.
 */
export class JsonCatalogDataAdaptor implements CatalogDataAdaptor {
  integrationsList: object[];

  /**
   * Creates a new FileSystemCatalogDataAdaptor instance.
   *
   * @param directory The base directory from which to read files. This is not sanitized.
   */
  constructor(integrationsList: object[]) {
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
    // TODO
    return 'unknown';
  }

  join(filename: string): JsonCatalogDataAdaptor {
    // Since the integration list is flat, joining is a no-op.
    return this;
  }
}
