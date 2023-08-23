/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import path from 'path';
import sanitize from 'sanitize-filename';

/**
 * A CatalogReader that reads from the local filesystem.
 * Used to read Integration information when the user uploads their own catalog.
 */
export class LocalCatalogReader implements CatalogReader {
  directory: string;

  /**
   * Creates a new LocalCatalogReader instance.
   *
   * @param directory The base directory from which to read files. This is not sanitized.
   */
  constructor(directory: string) {
    this.directory = directory;
  }

  /**
   * Prepares a filename for use in filesystem operations by sanitizing and joining it with the base directory.
   * This method is intended to be used before any filesystem-related call.
   *
   * @param filename The name of the file to prepare.
   * @param subdir Optional. A subdirectory to prepend to the filename. Not sanitized.
   * @returns The prepared path for the file, including the base directory and optional prefix.
   */
  _prepare(filename: string, subdir?: string): string {
    return path.join(this.directory, subdir ?? '.', sanitize(filename));
  }

  async readFile(filename: string, type?: IntegrationPart): Promise<string> {
    return await fs.readFile(this._prepare(filename, type), { encoding: 'utf-8' });
  }

  async readFileRaw(filename: string, type?: IntegrationPart): Promise<Buffer> {
    return await fs.readFile(this._prepare(filename, type));
  }

  async readDir(dirname: string): Promise<string[]> {
    // TODO return empty list if not a directory
    return await fs.readdir(this._prepare(dirname));
  }

  async isDirectory(dirname: string): Promise<boolean> {
    return (await fs.lstat(this._prepare(dirname))).isDirectory();
  }

  join(filename: string): LocalCatalogReader {
    return new LocalCatalogReader(path.join(this.directory, filename));
  }
}
