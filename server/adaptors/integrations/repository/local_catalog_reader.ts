/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import path from 'path';
import sanitize from 'sanitize-filename';
import { Integration } from './integration';

/**
 * A CatalogReader that reads from the local filesystem.
 * Used to read Integration information when the user uploads their own catalog.
 */
class LocalCatalogReader implements CatalogReader {
  directory: string;

  constructor(directory: string) {
    this.directory = directory;
  }

  // Use before any call to `fs`
  _prepare(filename: string): string {
    return path.join(this.directory, sanitize(filename));
  }

  async readFile(filename: string): Promise<string> {
    return await fs.readFile(this._prepare(filename), { encoding: 'utf-8' });
  }

  async readDir(dirname: string): Promise<string[]> {
    // TODO return empty list if not a directory
    return await fs.readdir(this._prepare(dirname));
  }

  async isDirectory(dirname: string): Promise<boolean> {
    return (await fs.lstat(this._prepare(dirname))).isDirectory();
  }

  async isRepository(dirname: string): Promise<boolean> {
    if (await this.isIntegration(dirname)) {
      return false;
    }
    // If there is at least one integration in a directory, it's a repository.
    for (const item of await this.readDir(dirname)) {
      if (await this.isIntegration(item)) {
        return true;
      }
    }
    return false;
  }

  async isIntegration(dirname: string): Promise<boolean> {
    if (!(await this.isDirectory(dirname))) {
      return false;
    }
    return new Integration(this._prepare(dirname)).check();
  }
}
