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

  constructor(directory: string) {
    this.directory = directory;
  }

  // Use before any call to `fs`
  // Sanitizes filenames by default, manually prepend directories with a prefix if necessary
  _prepare(filename: string, prefix?: string): string {
    return path.join(this.directory, prefix ?? '.', sanitize(filename));
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
