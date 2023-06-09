import * as fs from 'fs/promises';
import path from 'path';
import { ValidateFunction } from 'ajv';
import { templateValidator } from '../validators';

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
 * Helper function to log validation errors.
 * Relies on the `ajv` package for validation error logs..
 *
 * @param integration The name of the component that failed validation.
 * @param validator A failing ajv validator.
 */
function logValidationErrors(integration: string, validator: ValidateFunction<any>) {
  const errors = validator.errors?.map((e) => e.message);
  console.error(`Validation errors in ${integration}`, errors);
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

      if (!templateValidator(possibleTemplate)) {
        logValidationErrors(configFile, templateValidator);
        return null;
      }

      return possibleTemplate;
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
   * It's assumed that a valid version will be provided.
   * If the version is invalid, an error is thrown.
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
        const parsed = JSON.parse(`[${ndjson.replace('\n', ',')}]`);
        result.savedObjects = parsed;
      } catch (err: any) {
        console.error("Failed to load saved object assets, proceeding as if it's absent", err);
      }
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
    const fullStaticPath = path.join(this.directory, 'statics', staticPath);
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
