/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { validateTemplate } from '../validators';
import { FileSystemCatalogDataAdaptor } from './fs_data_adaptor';
import { CatalogDataAdaptor } from './catalog_data_adaptor';

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
   * Like getConfig(), but thoroughly checks all nested integration dependencies for validity.
   *
   * @returns a Result indicating whether the integration is valid.
   */
  async deepCheck(): Promise<Result<IntegrationConfig>> {
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
    } catch (err) {
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
    const versions = await this.reader.findIntegrationVersions();
    if (!versions.ok) {
      console.error(versions.error);
      return null;
    }
    return versions.value.length > 0 ? versions.value[0] : null;
  }

  /**
   * Get the configuration of the current integration.
   *
   * @param version The version of the config to retrieve.
   * @returns The config if a valid config matching the version is present, otherwise null.
   */
  async getConfig(version?: string): Promise<Result<IntegrationConfig>> {
    if ((await this.reader.getDirectoryType()) !== 'integration') {
      return { ok: false, error: new Error(`${this.directory} is not a valid integration`) };
    }

    const maybeVersion: string | null = version ? version : await this.getLatestVersion();

    if (maybeVersion === null) {
      return {
        ok: false,
        error: new Error(`No valid config matching version ${version} is available`),
      };
    }

    const configFile = `${this.name}-${maybeVersion}.json`;

    const config = await this.reader.readFile(configFile);
    if (!config.ok) {
      return config;
    }
    return validateTemplate(config.value);
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
    const configResult = await this.getConfig(version);
    if (!configResult.ok) {
      return configResult;
    }
    const config = configResult.value;

    const resultValue: {
      savedObjects?: object[];
      queries?: Array<{ query: string; language: string }>;
    } = {};
    if (config.assets.savedObjects) {
      const sobjPath = `${config.assets.savedObjects.name}-${config.assets.savedObjects.version}.ndjson`;
      const assets = await this.reader.readFile(sobjPath, 'assets');
      if (!assets.ok) {
        return assets;
      }
      resultValue.savedObjects = assets.value as object[];
    }
    if (config.assets.queries) {
      resultValue.queries = [];
      const queries = await Promise.all(
        config.assets.queries.map(async (item) => {
          const queryPath = `${item.name}-${item.version}.${item.language}`;
          const query = await this.reader.readFileRaw(queryPath, 'assets');
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
      for (const query of queries) {
        if (!query.ok) {
          return query;
        }
        resultValue.queries.push(query.value);
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
      const jsonContent = await this.reader.readFile(config.sampleData.path, 'data');
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
    const configResult = await this.getConfig(version);
    if (!configResult.ok) {
      return configResult;
    }
    const config = configResult.value;

    const resultValue: { mappings: { [key: string]: object } } = {
      mappings: {},
    };
    for (const component of config.components) {
      const schemaFile = `${component.name}-${component.version}.mapping.json`;
      const schema = await this.reader.readFile(schemaFile, 'schemas');
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
    return await this.reader.readFileRaw(staticPath, 'static');
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
      if (!serializeResult.ok) {
        return serializeResult;
      }
      serialized.logo = serializeResult.value;
    }

    if (statics.darkModeLogo) {
      const serializeResult = await this.serializeStaticAsset(statics.darkModeLogo);
      if (!serializeResult.ok) {
        return serializeResult;
      }
      serialized.darkModeLogo = serializeResult.value;
    }

    const foldResults = (results: Array<Result<SerializedStaticAsset>>) =>
      results.reduce(
        (result, currentValue) => {
          if (!result.ok) {
            return result;
          }
          if (!currentValue.ok) {
            return currentValue;
          }
          result.value.push(currentValue.value);
          return result;
        },
        { ok: true, value: [] } as Result<SerializedStaticAsset[]>
      );

    if (statics.gallery) {
      const results = await Promise.all(
        statics.gallery.map((asset) => this.serializeStaticAsset(asset))
      );
      const foldedResult = foldResults(results);
      if (!foldedResult.ok) {
        return foldedResult;
      }
      serialized.gallery = foldedResult.value;
    }

    if (statics.darkModeGallery) {
      const results = await Promise.all(
        statics.darkModeGallery.map((asset) => this.serializeStaticAsset(asset))
      );
      const foldedResult = foldResults(results);
      if (!foldedResult.ok) {
        return foldedResult;
      }
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
   *
   * @param version The version of the integration to serialize.
   * @returns A large object which includes all of the integration's data.
   */
  async serialize(version?: string): Promise<Result<SerializedIntegration>> {
    const configResult = await this.getConfig(version);
    if (!configResult.ok) {
      return configResult;
    }
    const config: IntegrationConfig = configResult.value;

    // For every type of asset, serialize the asset within the config.
    if (config.statics) {
      const staticsResult = await this.serializeStatics(config.statics);
      if (!staticsResult.ok) {
        return staticsResult;
      }
      config.statics = staticsResult.value;
    }

    // Type cast safety: all serializable properties must have the 'data' field.
    return { ok: true, value: config as SerializedIntegration };
  }
}
