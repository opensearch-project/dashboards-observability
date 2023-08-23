/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

type IntegrationPart = 'assets' | 'data' | 'schemas' | 'static';

interface CatalogReader {
  /**
   * Reads a file from the data source.
   *
   * @param filename The name of the file to read.
   * @param type Optional. The type of integration part to read ('assets', 'data', 'schemas', or 'static').
   * @returns A Promise that resolves with the content of the file as a string.
   */
  readFile: (filename: string, type?: IntegrationPart) => Promise<string>;

  /**
   * Reads a file from the data source as raw binary data.
   *
   * @param filename The name of the file to read.
   * @param type Optional. The type of integration part to read ('assets', 'data', 'schemas', or 'static').
   * @returns A Promise that resolves with the content of the file as a Buffer.
   */
  readFileRaw: (filename: string, type?: IntegrationPart) => Promise<Buffer>;

  /**
   * Reads the contents of a directory from the data source.
   *
   * @param dirname The name of the directory to read.
   * @returns A Promise that resolves with an array of filenames within the directory.
   */
  readDir: (dirname: string) => Promise<string[]>;

  /**
   * Checks if a given path on the data source is a directory.
   *
   * @param dirname The path to check.
   * @returns A Promise that resolves with a boolean indicating whether the path is a directory or not.
   */
  isDirectory: (dirname: string) => Promise<boolean>;

  /**
   * Creates a new CatalogReader instance with the specified subdirectory appended to the current directory.
   * Since CatalogReaders sanitize given paths by default,
   * this is useful for exploring nested data.
   *
   * @param subdirectory The path to append to the current directory.
   * @returns A new CatalogReader instance.
   */
  join: (subdirectory: string) => CatalogReader;
}
