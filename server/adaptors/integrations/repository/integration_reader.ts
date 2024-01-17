/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import semver from 'semver';
import { validateTemplate } from '../validators';
import { FileSystemCatalogDataAdaptor } from './fs_data_adaptor';
import { CatalogDataAdaptor, IntegrationPart } from './catalog_data_adaptor';
import { foldResults, pruneConfig } from './utils';

/**
 * The Integration class represents the data for Integration Templates.
 * It is backed by the repository file system.
 * It includes accessor methods for integration configs, as well as helpers for nested components.
 */
export class IntegrationReader {
  reader: CatalogDataAdaptor;
  directory: string;
  name: string;

  constructor(directory: string, reader?: CatalogDataAdaptor) {
    this.directory = directory;
    this.name = path.basename(directory);
    this.reader = reader ?? new FileSystemCatalogDataAdaptor(directory);
  }

  /**
   * Retrieve data from correct source regardless of if reader is config-localized or not.
   *
   * TODO refactor to assemble filename from `type` instead of requiring caller to format it.
   *
   * @param item An item which may have data in it.
   * @param fileParams Information about the file to read if the config is not localized.
   * @param format How to package the returned data.
   *               If 'json', return `object | object[]`. If 'binary', return `Buffer`.
   * @returns A result with the data, with a format based on the format field.
   */
  private async fetchDataOrReadFile(
    item: { data?: string },
    fileParams: { filename: string; type?: IntegrationPart },
    format: 'json'
  ): Promise<Result<object | object[]>>;
  private async fetchDataOrReadFile(
    item: { data?: string },
    fileParams: { filename: string; type?: IntegrationPart },
    format: 'binary'
  ): Promise<Result<Buffer>>;
  private async fetchDataOrReadFile(
    item: { data?: string },
    fileParams: { filename: string; type?: IntegrationPart },
    format: 'json' | 'binary'
  ): Promise<Result<object | object[] | Buffer>> {
    if (this.reader.isConfigLocalized) {
      if (!item.data) {
        return {
          ok: false,
          error: new Error(
            'The config for the provided reader is localized, but no data field is present. ' +
              JSON.stringify(item)
          ),
        };
      }
      try {
        if (format === 'json') {
          return { ok: true, value: JSON.parse(item.data) };
        } else {
          return { ok: true, value: Buffer.from(item.data, 'base64') };
        }
      } catch (error) {
        return { ok: false, error };
      }
    }

    if (format === 'json') {
      return this.reader.readFile(fileParams.filename, fileParams.type);
    } else {
      return this.reader.readFileRaw(fileParams.filename, fileParams.type);
    }
  }

  /**
   * Get the latest version of the integration available.
   * This method relies on the fact that integration configs have their versions in their name.
   * Any files that don't match the config naming convention will be ignored.
   *
   * @returns A string with the latest version, or null if no versions are available.
   */
  async getLatestVersion(): Promise<string | null> {
    const versions = await this.reader.findIntegrationVersions();
    if (!versions.ok) {
      return null;
    }
    if (versions.value.length === 0) {
      return null;
    }
    // Sort descending
    versions.value.sort(semver.rcompare);
    return versions.value[0];
  }

  // Get config without pruning or validation.
  private async getRawConfig(
    version?: string
  ): Promise<Result<IntegrationConfig | SerializedIntegration>> {
    if ((await this.reader.getDirectoryType()) !== 'integration') {
      return {
        ok: false,
        error: new Error(`${this.directory} is not a valid integration directory`),
      };
    }

    const maybeVersion: string | null = version ? version : await this.getLatestVersion();

    if (maybeVersion === null) {
      return {
        ok: false,
        error: new Error(`No valid config matching version ${version} is available`),
      };
    }

    const configFile = `${this.name}-${maybeVersion}.json`;

    // Even config-localized readers must support config-read.
    const config = await this.reader.readFile(configFile);
    if (!config.ok) {
      return config;
    }
    return validateTemplate(config.value);
  }

  /**
   * Get the configuration of the current integration.
   *
   * @param version The version of the config to retrieve.
   * @returns The config if a valid config matching the version is present, otherwise null.
   */
  async getConfig(version?: string): Promise<Result<IntegrationConfig>> {
    const maybeConfig = await this.getRawConfig(version);
    if (!maybeConfig.ok) {
      return maybeConfig;
    }
    return validateTemplate(pruneConfig(maybeConfig.value));
  }

  private async getQueries(
    queriesList: Array<{ name: string; version: string; language: string; data?: string }>
  ): Promise<Result<Array<{ language: string; query: string }>>> {
    const queries = await Promise.all(
      queriesList.map(async (item) => {
        const query = await this.fetchDataOrReadFile(
          item,
          { filename: `${item.name}-${item.version}.${item.language}`, type: 'assets' },
          'binary'
        );
        if (!query.ok) {
          return query;
        }
        return {
          ok: true as const,
          value: {
            language: item.language,
            query: query.value.toString('utf8'),
          },
        };
      })
    );
    return foldResults(queries);
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
      queries?: Array<{
        query: string;
        language: string;
      }>;
    }>
  > {
    const configResult = await this.getRawConfig(version);
    if (!configResult.ok) {
      return configResult;
    }
    const config = configResult.value;

    const resultValue: {
      savedObjects?: object[];
      queries?: Array<{ query: string; language: string }>;
    } = {};
    if (config.assets.savedObjects) {
      const assets = await this.fetchDataOrReadFile(
        config.assets.savedObjects as { data?: string },
        {
          filename: `${config.assets.savedObjects.name}-${config.assets.savedObjects.version}.ndjson`,
          type: 'assets',
        },
        'json'
      );
      if (!assets.ok) {
        return assets;
      }
      resultValue.savedObjects = assets.value as object[];
    }
    if (config.assets.queries) {
      const queries = await this.getQueries(config.assets.queries);
      if (!queries.ok) {
        return queries;
      }
      resultValue.queries = queries.value;
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
    const configResult = await this.getRawConfig(version);
    if (!configResult.ok) {
      return configResult;
    }
    const config = configResult.value;

    const resultValue: { sampleData: object[] | null } = { sampleData: null };
    if (config.sampleData) {
      const jsonContent: Result<object | object[]> = await this.fetchDataOrReadFile(
        config.sampleData as { data?: string },
        { filename: config.sampleData.path, type: 'data' },
        'json'
      );
      if (!jsonContent.ok) {
        return jsonContent;
      }
      for (const value of jsonContent.value as object[]) {
        if (!('@timestamp' in value)) {
          continue;
        }
        // Randomly scatter timestamps across last 10 minutes
        // Assume for now that the ordering of events isn't important, can change to a sequence if needed
        // Also doesn't handle fields like `observedTimestamp` if present
        const newTime = new Date(
          Date.now() - Math.floor(Math.random() * 1000 * 60 * 10)
        ).toISOString();
        Object.assign(value, { '@timestamp': newTime });
        if ('observedTimestamp' in value) {
          Object.assign(value, { observedTimestamp: newTime });
        }
      }
      resultValue.sampleData = jsonContent.value as object[];
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
      mappings: { [key: string]: unknown };
    }>
  > {
    const configResult = await this.getRawConfig(version);
    if (!configResult.ok) {
      return configResult;
    }
    const config = configResult.value;

    const resultValue: { mappings: { [key: string]: object } } = {
      mappings: {},
    };
    for (const component of config.components) {
      const schemaFile = `${component.name}-${component.version}.mapping.json`;
      const schema = await this.fetchDataOrReadFile(
        component as { data?: string },
        { filename: schemaFile, type: 'schemas' },
        'json'
      );
      if (!schema.ok) {
        return schema;
      }
      resultValue.mappings[component.name] = schema.value;
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
    // Statics were originally designed to read straight from file system,
    // so we use direct access if possible.
    if (!this.reader.isConfigLocalized) {
      return await this.reader.readFileRaw(staticPath, 'static');
    }

    // Otherwise, we need to search for the right static, by checking each version.
    const versions = await this.reader.findIntegrationVersions();
    if (!versions.ok) {
      return versions;
    }
    for (const version of versions.value) {
      const config = await this.getRawConfig(version);
      if (!config.ok || !config.value.statics) {
        continue;
      }
      const statics = config.value.statics;
      if (statics.logo?.path === staticPath) {
        if (!('data' in statics.logo)) {
          return { ok: false, error: new Error('Localized config missing static data') };
        }
        return { ok: true, value: Buffer.from((statics.logo as { data: string }).data, 'base64') };
      }
      if (statics?.darkModeLogo?.path === staticPath) {
        if (!('data' in statics.darkModeLogo)) {
          return { ok: false, error: new Error('Localized config missing static data') };
        }
        return {
          ok: true,
          value: Buffer.from((statics.darkModeLogo as { data: string }).data, 'base64'),
        };
      }
      for (const iterStatic of [...(statics?.gallery ?? []), ...(statics?.darkModeGallery ?? [])]) {
        if (iterStatic.path === staticPath) {
          if (!('data' in iterStatic)) {
            return { ok: false, error: new Error('Localized config missing static data') };
          }
          return { ok: true, value: Buffer.from((iterStatic as { data: string }).data, 'base64') };
        }
      }
    }

    return {
      ok: false,
      error: new Error(`Static not found: ${staticPath}`, { code: 'ENOENT' } as ErrorOptions),
    };
  }

  private async serializeStaticAsset(asset: StaticAsset): Promise<Result<SerializedStaticAsset>> {
    const data = await this.getStatic(asset.path);
    if (!data.ok) {
      return data;
    }

    return {
      ok: true,
      value: {
        ...asset,
        data: data.value.toString('base64'),
      },
    };
  }

  private async serializeStatics(
    statics: IntegrationStatics
  ): Promise<Result<SerializedIntegrationStatics>> {
    const serialized: SerializedIntegrationStatics = {};

    if (statics.logo) {
      const serializeResult = await this.serializeStaticAsset(statics.logo);
      serialized.logo = serializeResult.value;
    }

    if (statics.darkModeLogo) {
      const serializeResult = await this.serializeStaticAsset(statics.darkModeLogo);
      serialized.darkModeLogo = serializeResult.value;
    }

    if (statics.gallery) {
      const results = await Promise.all(
        statics.gallery.map((asset) => this.serializeStaticAsset(asset))
      );
      const foldedResult = foldResults(results);
      serialized.gallery = foldedResult.value;
    }

    if (statics.darkModeGallery) {
      const results = await Promise.all(
        statics.darkModeGallery.map((asset) => this.serializeStaticAsset(asset))
      );
      const foldedResult = foldResults(results);
      serialized.darkModeGallery = foldedResult.value;
    }

    return {
      ok: true,
      value: serialized,
    };
  }

  /**
   * Serialize the referenced integration as a flat JSON object.
   * Useful for normalizing the format for sending to other locations.
   * This method implements the serialization scheme expected by `JsonCatalogDataAdaptor`.
   *
   * @param version The version of the integration to serialize.
   * @returns A large object which includes all of the integration's data.
   */
  async serialize(version?: string): Promise<Result<SerializedIntegration>> {
    const configResult = await this.getRawConfig(version);
    if (!configResult.ok) {
      return configResult;
    }

    // Type cast safety: all serializable properties must have the 'data' field.
    // The remainder of the method is populating all such fields.
    const config = configResult.value as SerializedIntegration;

    const componentResults = await Promise.all(
      config.components.map((component) =>
        this.fetchDataOrReadFile(
          component,
          { filename: `${component.name}-${component.version}.mapping.json`, type: 'schemas' },
          'json'
        )
      )
    );
    const componentsResult = foldResults(componentResults);
    if (!componentsResult.ok) {
      return componentsResult;
    }
    config.components = config.components.map((component, idx) => {
      return {
        ...component,
        data: JSON.stringify(componentsResult.value[idx]),
      };
    });

    if (config.assets.savedObjects) {
      const soMetadata = config.assets.savedObjects;
      const soResult = await this.fetchDataOrReadFile(
        config.assets.savedObjects,
        {
          filename: `${soMetadata.name}-${soMetadata.version}.ndjson`,
          type: 'assets',
        },
        'json'
      );
      if (!soResult.ok) {
        return soResult;
      }
      config.assets.savedObjects = { ...soMetadata, data: JSON.stringify(soResult.value) };
    }

    if (config.assets.queries) {
      const queryResults = await Promise.all(
        config.assets.queries.map((query) =>
          this.fetchDataOrReadFile(
            query,
            { filename: `${query.name}-${query.version}.${query.language}`, type: 'assets' },
            'binary'
          )
        )
      );
      const queriesResult = foldResults(queryResults);
      if (!queriesResult.ok) {
        return queriesResult;
      }
      config.assets.queries = config.assets.queries.map((query, idx) => {
        return {
          ...query,
          data: JSON.stringify(queriesResult.value[idx].toString('utf8')),
        };
      });
    }

    if (config.statics) {
      const staticsResult = await this.serializeStatics(config.statics);
      if (!staticsResult.ok) {
        return staticsResult;
      }
      config.statics = staticsResult.value;
    }

    if (config.sampleData) {
      const dataResult = await this.getSampleData(version);
      if (!dataResult.ok) {
        return dataResult;
      }
      config.sampleData = {
        ...config.sampleData,
        data: JSON.stringify(dataResult.value.sampleData),
      };
    }

    return { ok: true, value: config };
  }
}
