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
  isConfigLocalized = true;
  integrationsList: SerializedIntegration[];

  /**
   * Creates a new FileSystemCatalogDataAdaptor instance.
   *
   * @param integrationsList The list of JSON-serialized integrations to use as a pseudo-directory.
   */
  constructor(integrationsList: SerializedIntegration[]) {
    this.integrationsList = integrationsList;
  }

  async findIntegrationVersions(dirname?: string | undefined): Promise<Result<string[], Error>> {
    const versions: string[] = [];
    for (const integration of this.integrationsList) {
      if (dirname && integration.name !== dirname) {
        continue;
      }
      versions.push(integration.version);
    }
    return { ok: true, value: versions };
  }

  async readFile(filename: string, type?: IntegrationPart): Promise<Result<object[] | object>> {
    if (type !== undefined) {
      return {
        ok: false,
        error: new Error('JSON adaptor does not support subtypes (isConfigLocalized: true)'),
      };
    }

    const filenameParts = filename.match(/([\w]+)-(\d+(\.\d+)*)\.json/);
    for (const integ of this.integrationsList) {
      if (integ.name === filenameParts?.[1] && integ.version === filenameParts?.[2]) {
        return { ok: true, value: integ };
      }
    }
    return { ok: false, error: new Error('Config file not found: ' + filename) };
  }

  async readFileRaw(_filename: string, _type?: IntegrationPart): Promise<Result<Buffer>> {
    return {
      ok: false,
      error: new Error('JSON adaptor does not support raw files (isConfigLocalized: true)'),
    };
  }

  async findIntegrations(dirname: string = '.'): Promise<Result<string[]>> {
    if (dirname !== '.') {
      return {
        ok: false,
        error: new Error('Finding integrations for custom dirs not supported for JSONreader'),
      };
    }
    const result: Set<string> = new Set([]);
    for (const integration of this.integrationsList) {
      result.add(integration.name);
    }
    return { ok: true, value: [...result] };
  }

  async getDirectoryType(dirname?: string): Promise<'integration' | 'repository' | 'unknown'> {
    // First, filter list by dirname if available
    const integrationsList = dirname
      ? this.integrationsList.filter((i) => i.name === dirname)
      : this.integrationsList;
    if (integrationsList.length === 0) {
      return 'unknown';
    }
    // The list is an integration iff all of its names match
    for (let i = 0; i < integrationsList.length - 1; i++) {
      if (integrationsList[i].name !== integrationsList[i + 1].name) {
        return 'repository';
      }
    }
    return 'integration';
  }

  join(filename: string): JsonCatalogDataAdaptor {
    // In other adaptors, joining moves from directories to integrations.
    // Since for JSON catalogs we use a flat structure, we just filter.
    return new JsonCatalogDataAdaptor(this.integrationsList.filter((i) => i.name === filename));
  }
}
