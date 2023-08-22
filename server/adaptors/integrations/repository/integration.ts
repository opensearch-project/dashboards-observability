/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import path from 'path';
import { validateTemplate } from '../validators';

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
 * Helper function to check if the given path is a directory
 *
 * @param dirPath The directory to check.
 * @returns True if the path is a directory.
 */
async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * The Integration class represents the data for Integration Templates.
 * It is backed by the repository file system.
 * It includes accessor methods for integration configs, as well as helpers for nested components.
 */
export class Integration {
  directory: string;
  name: string;

  constructor(directory: string) {
    this.directory = directory;
    this.name = path.basename(directory);
  }

  /**
   * Check the integration for validity.
   * This is not a deep check, but a quick check to verify that the integration is a valid directory and has a config file.
   *
   * @returns true if the integration is valid.
   */
  async check(): Promise<boolean> {
    if (!(await isDirectory(this.directory))) {
      return false;
    }
    return (await this.getConfig()) !== null;
  }

  /**
   * Like check(), but thoroughly checks all nested integration dependencies.
   *
   * @returns true if the integration is valid.
   */
  async deepCheck(): Promise<boolean> {
    if (!(await this.check())) {
      console.error('check failed');
      return false;
    }

    try {
      // An integration must have at least one mapping
      const schemas = await this.getSchemas();
      if (Object.keys(schemas.mappings).length === 0) {
        return false;
      }
      // An integration must have at least one asset
      const assets = await this.getAssets();
      if (Object.keys(assets).length === 0) {
        return false;
      }
    } catch (err: any) {
      // Any loading errors are considered invalid
      console.error('Deep check failed for exception', err);
      return false;
    }

    return true;
  }

  /**
   * Get the latest version of the integration available.
   * This method relies on the fact that integration configs have their versions in their name.
   * Any files that don't match the config naming convention will be ignored.
   *
   * @returns A string with the latest version, or null if no versions are available.
   */
  async getLatestVersion(): Promise<string | null> {
    const files = await fs.readdir(this.directory);
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
  async getConfig(version?: string): Promise<IntegrationTemplate | null> {
    const maybeVersion: string | null = version ? version : await this.getLatestVersion();

    if (maybeVersion === null) {
      return null;
    }

    const configFile = `${this.name}-${maybeVersion}.json`;
    const configPath = path.join(this.directory, configFile);

    try {
      const config = await fs.readFile(configPath, { encoding: 'utf-8' });
      const possibleTemplate = JSON.parse(config);
      const template = validateTemplate(possibleTemplate);
      if (template.ok) {
        return template.value;
      }
      console.error(template.error);
      return null;
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        console.error(`Syntax errors in ${configFile}`, err);
        return null;
      }
      if (err instanceof Error && (err as { code?: string }).code === 'ENOENT') {
        console.error(`Attempted to retrieve non-existent config ${configFile}`);
        return null;
      }
      throw new Error('Could not load integration', { cause: err });
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
  ): Promise<{
    savedObjects?: object[];
  }> {
    const config = await this.getConfig(version);
    if (config === null) {
      return Promise.reject(new Error('Attempted to get assets of invalid config'));
    }
    const result: { savedObjects?: object[] } = {};
    if (config.assets.savedObjects) {
      const sobjPath = path.join(
        this.directory,
        'assets',
        `${config.assets.savedObjects.name}-${config.assets.savedObjects.version}.ndjson`
      );
      try {
        const ndjson = await fs.readFile(sobjPath, { encoding: 'utf-8' });
        const asJson = '[' + ndjson.trim().replace(/\n/g, ',') + ']';
        const parsed = JSON.parse(asJson);
        result.savedObjects = parsed;
      } catch (err: any) {
        console.error("Failed to load saved object assets, proceeding as if it's absent", err);
      }
    }
    return result;
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
  ): Promise<{
    sampleData: object[] | null;
  }> {
    const config = await this.getConfig(version);
    if (config === null) {
      return Promise.reject(new Error('Attempted to get assets of invalid config'));
    }
    const result: { sampleData: object[] | null } = { sampleData: null };
    if (config.sampleData) {
      const sobjPath = path.join(this.directory, 'data', config.sampleData?.path);
      try {
        const jsonContent = await fs.readFile(sobjPath, { encoding: 'utf-8' });
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
        result.sampleData = parsed;
      } catch (err: any) {
        console.error("Failed to load saved object assets, proceeding as if it's absent", err);
      }
    }
    return result;
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
  ): Promise<{
    mappings: { [key: string]: any };
  }> {
    const config = await this.getConfig(version);
    if (config === null) {
      return Promise.reject(new Error('Attempted to get assets of invalid config'));
    }
    const result: { mappings: { [key: string]: any } } = {
      mappings: {},
    };
    try {
      for (const component of config.components) {
        const schemaFile = `${component.name}-${component.version}.mapping.json`;
        const rawSchema = await fs.readFile(path.join(this.directory, 'schemas', schemaFile), {
          encoding: 'utf-8',
        });
        const parsedSchema = JSON.parse(rawSchema);
        result.mappings[component.name] = parsedSchema;
      }
    } catch (err: any) {
      // It's not clear that an invalid schema can be recovered from.
      // For integrations to function, we need schemas to be valid.
      console.error('Error loading schema', err);
      return Promise.reject(new Error('Could not load schema', { cause: err }));
    }
    return result;
  }

  /**
   * Retrieves the data for a static file associated with the integration.
   *
   * @param staticPath The path of the static to retrieve.
   * @returns A buffer with the static's data if present, otherwise null.
   */
  async getStatic(staticPath: string): Promise<Buffer | null> {
    const fullStaticPath = path.join(this.directory, 'static', staticPath);
    try {
      return await fs.readFile(fullStaticPath);
    } catch (err: any) {
      if (err instanceof Error && (err as { code?: string }).code === 'ENOENT') {
        console.error(`Static not found: ${staticPath}`);
        return null;
      }
      throw err;
    }
  }
}
