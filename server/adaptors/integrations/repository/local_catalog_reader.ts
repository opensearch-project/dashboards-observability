/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A CatalogReader that reads from the local filesystem.
 * Used to read Integration information when the user uploads their own catalog.
 */
class LocalCatalogReader implements CatalogReader {
  directory: string;

  constructor(directory: string) {
    this.directory = directory;
  }

  async readFile(_dirname: string): Promise<string> {
    return '';
  }

  async readDir(_dirname: string): Promise<string[]> {
    return [];
  }

  async isDir(_dirname: string): Promise<boolean> {
    return false;
  }
}
