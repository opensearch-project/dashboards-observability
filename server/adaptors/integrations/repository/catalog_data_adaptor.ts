/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

type IntegrationPart = 'assets' | 'data' | 'schemas' | 'static';

interface CatalogDataAdaptor {
  /**
   * Reads a Json or NDJson file from the data source.
   *
   * @param filename The name of the file to read.
   * @param type Optional. The type of integration part to read ('assets', 'data', 'schemas', or 'static').
   * @returns A Promise that resolves with the content of the file as a string.
   */
  readFile: (filename: string, type?: IntegrationPart) => Promise<Result<object | object[]>>;

  /**
   * Reads a file from the data source as raw binary data.
   *
   * @param filename The name of the file to read.
   * @param type Optional. The type of integration part to read ('assets', 'data', 'schemas', or 'static').
   * @returns A Promise that resolves with the content of the file as a Buffer.
   */
  readFileRaw: (filename: string, type?: IntegrationPart) => Promise<Result<Buffer>>;

  /**
   * Reads the contents of a repository directory from the data source to find integrations.
   *
   * @param dirname The name of the directory to read.
   * @returns A Promise that resolves with an array of filenames within the directory.
   */
  findIntegrations: (dirname?: string) => Promise<Result<string[]>>;

  /**
   * Reads the contents of an integration version to find available versions.
   *
   * @param dirname The name of the directory to read.
   * @returns A Promise that resolves with an array of filenames within the directory.
   */
  findIntegrationVersions: (dirname?: string) => Promise<Result<string[]>>;

  /**
   * Determine whether a directory is an integration, repository, or otherwise.
   *
   * @param dirname The path to check.
   * @returns A Promise that resolves with a boolean indicating whether the path is a directory or not.
   */
  getDirectoryType: (dirname?: string) => Promise<'integration' | 'repository' | 'unknown'>;

  /**
   * Creates a new CatalogDataAdaptor instance with the specified subdirectory appended to the current directory.
   * Useful for exploring nested data without needing to know the instance type.
   *
   * @param subdirectory The path to append to the current directory.
   * @returns A new CatalogDataAdaptor instance.
   */
  join: (subdirectory: string) => CatalogDataAdaptor;
}
