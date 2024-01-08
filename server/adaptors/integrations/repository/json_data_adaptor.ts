/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CatalogDataAdaptor, IntegrationPart } from './catalog_data_adaptor';

/**
 * Remove all fields from SerializedIntegration not present in IntegrationConfig
 *
 * @param rawConfig The raw config to prune
 * @returns A config with all data fields removed
 */
const pruneConfig = (rawConfig: SerializedIntegration): IntegrationConfig => {
  // Hacky workaround: we currently only need to prune 'data' fields, so just remove every 'data'.
  // Lots of risky conversion in this method, so scope it to here and rewrite if more granular
  // pruning is needed.
  const prunePart = <T>(part: T): T => {
    const result = {} as { [key: string]: unknown };
    for (const [key, value] of Object.entries(part as { [key: string]: unknown })) {
      if (key === 'data') {
        continue;
      } else if (Array.isArray(value)) {
        result[key] = value.map((item) => {
          if (item instanceof Object && item !== null) {
            return prunePart(item);
          }
          return item;
        });
      } else if (value instanceof Object && value !== null) {
        result[key] = prunePart(value as { [key: string]: unknown });
      } else {
        result[key] = value;
      }
    }
    return (result as unknown) as T;
  };

  return prunePart(rawConfig);
};

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
    switch (type) {
      case undefined:
        const name = filename.split('-')[0];
        const version = filename.match(/\d+(\.\d+)*/);
        for (const integ of this.integrationsList) {
          if (integ.name === name && integ.version === version?.[0]) {
            return { ok: true, value: pruneConfig(integ) };
          }
        }
        return { ok: false, error: new Error('Config file not found: ' + filename) };
      default:
        return { ok: false, error: new Error('Unsupported type: ' + type) };
    }
  }

  async readFileRaw(_filename: string, _type?: IntegrationPart): Promise<Result<Buffer>> {
    // TODO
    return { ok: false, error: new Error('Not Implemented') };
  }

  async findIntegrations(_dirname: string = '.'): Promise<Result<string[]>> {
    // TODO
    return { ok: false, error: new Error('Not Implemented') };
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
