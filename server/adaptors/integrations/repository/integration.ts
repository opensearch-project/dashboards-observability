/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { validateTemplate } from '../validators';
import { LocalCatalogReader } from './local_catalog_reader';

/**
 * Helper function to compare version numbers.
 * Assumes that the version numbers are valid, produces undefined behavior otherwise.
 *
 * @param a Left-hand number
 * @param b Right-hand number
 * @returns -1 if a > b, 1 if a < b, 0 otherwise.
 */
function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(Number.parseInt);
  const bParts = b.split('.').map(Number.parseInt);

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aValue = i < aParts.length ? aParts[i] : 0;
    const bValue = i < bParts.length ? bParts[i] : 0;

    if (aValue > bValue) {
      return -1; // a > b
    } else if (aValue < bValue) {
      return 1; // a < b
    }
  }

  return 0; // a == b
}

/**
 * The Integration class represents the data for Integration Templates.
 * It is backed by the repository file system.
 * It includes accessor methods for integration configs, as well as helpers for nested components.
 */
export class Integration {
  reader: CatalogReader;
  directory: string;
  name: string;

  constructor(directory: string, reader?: CatalogReader) {
    this.directory = directory;
    this.name = path.basename(directory);
    this.reader = reader ?? new LocalCatalogReader(directory);
  }

  /**
   * Like getConfig(), but thoroughly checks all nested integration dependencies for validity.
   *
   * @returns a Result indicating whether the integration is valid.
   */
  async deepCheck(): Promise<Result<IntegrationTemplate>> {
    const configResult = await this.getConfig();
    if (!configResult.ok) {
      return configResult;
    }

    try {
      const schemas = await this.getSchemas();
      if (!schemas.ok || Object.keys(schemas.value.mappings).length === 0) {
        return { ok: false, error: new Error('The integration has no schemas available') };
      }
      const assets = await this.getAssets();
      if (!assets.ok || Object.keys(assets).length === 0) {
        return { ok: false, error: new Error('An integration must have at least one asset') };
      }
    } catch (err: any) {
      return { ok: false, error: err };
    }

    return configResult;
  }

  /**
   * Get the latest version of the integration available.
   * This method relies on the fact that integration configs have their versions in their name.
   * Any files that don't match the config naming convention will be ignored.
   *
   * @returns A string with the latest version, or null if no versions are available.
   */
  async getLatestVersion(): Promise<string | null> {
    const files = await this.reader.readDir('');
    const versions: string[] = [];

    for (const file of files) {
      if (path.extname(file) === '.json' && file.startsWith(`${this.name}-`)) {
        const version = file.substring(this.name.length + 1, file.length - 5);
        if (!version.match(/^\d+(\.\d+)*$/)) {
          continue;
        }
        versions.push(version);
      }
    }

    versions.sort((a, b) => compareVersions(a, b));

    return versions.length > 0 ? versions[0] : null;
  }

  /**
   * Get the configuration of the current integration.
   *
   * @param version The version of the config to retrieve.
   * @returns The config if a valid config matching the version is present, otherwise null.
   */
  async getConfig(version?: string): Promise<Result<IntegrationTemplate>> {
    if (!(await this.reader.isDirectory(''))) {
      return { ok: false, error: new Error(`${this.directory} is not a valid directory`) };
    }

    const maybeVersion: string | null = version ? version : await this.getLatestVersion();

    if (maybeVersion === null) {
      return {
        ok: false,
        error: new Error(`No valid config matching version ${version} is available`),
      };
    }

    const configFile = `${this.name}-${maybeVersion}.json`;

    try {
      const config = await this.reader.readFile(configFile);
      const possibleTemplate = JSON.parse(config);
      return validateTemplate(possibleTemplate);
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        console.error(`Syntax errors in ${configFile}`, err);
      }
      if (err instanceof Error && (err as { code?: string }).code === 'ENOENT') {
        console.error(`Attempted to retrieve non-existent config ${configFile}`);
      }
      return { ok: false, error: err };
    }
  }

  /**
   * Retrieve assets associated with the integration.
   * This method greedily retrieves all assets.
   * If the version is invalid, an error is thrown.
   * If an asset is invalid, it will be skipped.
   *
   * @param version The version of the integration to retrieve assets for.
   * @returns An object containing the different types of assets.
   */
  async getAssets(
    version?: string
  ): Promise<
    Result<{
      savedObjects?: object[];
    }>
  > {
    const configResult = await this.getConfig(version);
    if (!configResult.ok) {
      return configResult;
    }
    const config = configResult.value;

    const resultValue: { savedObjects?: object[] } = {};
    if (config.assets.savedObjects) {
      const sobjPath = `${config.assets.savedObjects.name}-${config.assets.savedObjects.version}.ndjson`;
      try {
        const ndjson = await this.reader.readFile(sobjPath, 'assets');
        const asJson = '[' + ndjson.trim().replace(/\n/g, ',') + ']';
        const parsed = JSON.parse(asJson);
        resultValue.savedObjects = parsed;
      } catch (err: any) {
        return { ok: false, error: err };
      }
    }
    return { ok: true, value: resultValue };
  }

  /**
   * Retrieve sample data associated with the integration.
   * If the version is invalid, an error is thrown.
   * If the sample data is invalid, null will be returned
   *
   * @param version The version of the integration to retrieve assets for.
   * @returns An object containing a list of sample data with adjusted timestamps.
   */
  async getSampleData(
    version?: string
  ): Promise<
    Result<{
      sampleData: object[] | null;
    }>
  > {
    const configResult = await this.getConfig(version);
    if (!configResult.ok) {
      return configResult;
    }
    const config = configResult.value;

    const resultValue: { sampleData: object[] | null } = { sampleData: null };
    if (config.sampleData) {
      try {
        const jsonContent = await this.reader.readFile(config.sampleData.path, 'data');
        const parsed = JSON.parse(jsonContent) as object[];
        for (const value of parsed) {
          if (!('@timestamp' in value)) {
            continue;
          }
          // Randomly scatter timestamps across last 10 minutes
          // Assume for now that the ordering of events isn't important, can change to a sequence if needed
          // Also doesn't handle fields like `observedTimestamp` if present
          Object.assign(value, {
            '@timestamp': new Date(
              Date.now() - Math.floor(Math.random() * 1000 * 60 * 10)
            ).toISOString(),
          });
        }
        resultValue.sampleData = parsed;
      } catch (err: any) {
        return { ok: false, error: err };
      }
    }
    return { ok: true, value: resultValue };
  }

  /**
   * Retrieve schema data associated with the integration.
   * This method greedily retrieves all mappings and schemas.
   * It's assumed that a valid version will be provided.
   * If the version is invalid, an error is thrown.
   * If a schema is invalid, an error will be thrown.
   *
   * @param version The version of the integration to retrieve assets for.
   * @returns An object containing the different types of assets.
   */
  async getSchemas(
    version?: string
  ): Promise<
    Result<{
      mappings: { [key: string]: any };
    }>
  > {
    const configResult = await this.getConfig(version);
    if (!configResult.ok) {
      return configResult;
    }
    const config = configResult.value;

    const resultValue: { mappings: { [key: string]: object } } = {
      mappings: {},
    };
    try {
      for (const component of config.components) {
        const schemaFile = `${component.name}-${component.version}.mapping.json`;
        const rawSchema = await this.reader.readFile(schemaFile, 'schemas');
        const parsedSchema = JSON.parse(rawSchema);
        resultValue.mappings[component.name] = parsedSchema;
      }
    } catch (err: any) {
      return { ok: false, error: err };
    }
    return { ok: true, value: resultValue };
  }

  /**
   * Retrieves the data for a static file associated with the integration.
   *
   * @param staticPath The path of the static to retrieve.
   * @returns A buffer with the static's data if present, otherwise null.
   */
  async getStatic(staticPath: string): Promise<Result<Buffer>> {
    try {
      const buffer = await this.reader.readFileRaw(staticPath, 'static');
      return { ok: true, value: buffer };
    } catch (err: any) {
      return { ok: false, error: err };
    }
  }
}
