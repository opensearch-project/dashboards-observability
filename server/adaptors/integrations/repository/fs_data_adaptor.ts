/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import path from 'path';

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

function tryParseNDJson(content: string): object[] | null {
  try {
    const objects = [];
    for (const line of content.split('\n')) {
      if (line.trim() === '') {
        // Other OSD ndjson parsers skip whitespace lines
        continue;
      }
      objects.push(JSON.parse(line));
    }
    return objects;
  } catch (err: any) {
    return null;
  }
}

// Check if a location is a directory without an exception if location not found
const safeIsDirectory = async (maybeDirectory: string): Promise<boolean> => {
  try {
    return (await fs.lstat(maybeDirectory)).isDirectory();
  } catch (_err: unknown) {
    return false;
  }
};

/**
 * A CatalogDataAdaptor that reads from the local filesystem.
 * Used to read Integration information when the user uploads their own catalog.
 */
export class FileSystemCatalogDataAdaptor implements CatalogDataAdaptor {
  directory: string;

  /**
   * Creates a new FileSystemCatalogDataAdaptor instance.
   *
   * @param directory The base directory from which to read files. This is not sanitized.
   */
  constructor(directory: string) {
    this.directory = directory;
  }

  async readFile(filename: string, type?: IntegrationPart): Promise<Result<object[] | object>> {
    let content;
    try {
      content = await fs.readFile(path.join(this.directory, type ?? '.', filename), {
        encoding: 'utf-8',
      });
    } catch (err: any) {
      return { ok: false, error: err };
    }
    // First try to parse as JSON, then NDJSON, then fail.
    try {
      const parsed = JSON.parse(content);
      return { ok: true, value: parsed };
    } catch (err: any) {
      const parsed = tryParseNDJson(content);
      if (parsed) {
        return { ok: true, value: parsed };
      }
      return {
        ok: false,
        error: new Error('Unable to parse file as JSON or NDJson', { cause: err }),
      };
    }
  }

  async readFileRaw(filename: string, type?: IntegrationPart): Promise<Result<Buffer>> {
    try {
      const buffer = await fs.readFile(path.join(this.directory, type ?? '.', filename));
      return { ok: true, value: buffer };
    } catch (err: any) {
      return { ok: false, error: err };
    }
  }

  async findIntegrations(dirname: string = '.'): Promise<Result<string[]>> {
    try {
      const files = await fs.readdir(path.join(this.directory, dirname));
      return { ok: true, value: files };
    } catch (err: any) {
      return { ok: false, error: err };
    }
  }

  async findIntegrationVersions(dirname: string = '.'): Promise<Result<string[]>> {
    let files;
    const integPath = path.join(this.directory, dirname);
    try {
      files = await fs.readdir(integPath);
    } catch (err: any) {
      return { ok: false, error: err };
    }
    const versions: string[] = [];

    for (const file of files) {
      // TODO handle nested repositories -- assumes integrations are 1 level deep
      if (path.extname(file) === '.json' && file.startsWith(`${path.basename(integPath)}-`)) {
        const version = file.substring(path.basename(integPath).length + 1, file.length - 5);
        if (!version.match(/^\d+(\.\d+)*$/)) {
          continue;
        }
        versions.push(version);
      }
    }

    versions.sort((a, b) => compareVersions(a, b));
    return { ok: true, value: versions };
  }

  async getDirectoryType(dirname?: string): Promise<'integration' | 'repository' | 'unknown'> {
    const isDir = await safeIsDirectory(path.join(this.directory, dirname ?? '.'));
    if (!isDir) {
      return 'unknown';
    }
    // Sloppily just check for one mandatory integration directory to distinguish.
    // Improve if we need to distinguish a repository with an integration named "schemas".
    const hasSchemas = await safeIsDirectory(path.join(this.directory, dirname ?? '.', 'schemas'));
    return hasSchemas ? 'integration' : 'repository';
  }

  join(filename: string): FileSystemCatalogDataAdaptor {
    return new FileSystemCatalogDataAdaptor(path.join(this.directory, filename));
  }
}
