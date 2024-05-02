/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import path from 'path';
import JSON5 from 'json5';
import { CatalogDataAdaptor, IntegrationPart } from './catalog_data_adaptor';
import { tryParseNDJson } from './utils';

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
 * Used to read default Integrations shipped in the in-product catalog at `__data__`.
 */
export class FileSystemDataAdaptor implements CatalogDataAdaptor {
  isConfigLocalized = false;
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
    } catch (err) {
      return { ok: false, error: err };
    }
    // First try to parse as JSON, then NDJSON, then fail.
    try {
      const parsed = JSON5.parse(content);
      return { ok: true, value: parsed };
    } catch (err) {
      const parsed = await tryParseNDJson(content);
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
    } catch (err) {
      return { ok: false, error: err };
    }
  }

  async findIntegrations(dirname: string = '.'): Promise<Result<string[]>> {
    try {
      const integrations: string[] = [];
      await this.collectIntegrationsRecursive(dirname, integrations);
      return { ok: true, value: integrations };
    } catch (err) {
      return { ok: false, error: err };
    }
  }

  private async collectIntegrationsRecursive(
    dirname: string,
    integrations: string[]
  ): Promise<void> {
    const entries = await fs.readdir(path.join(this.directory, dirname));

    for (const entry of entries) {
      const fullPath = path.join(dirname, entry);
      const isDirectory = (await this.getDirectoryType(fullPath)) === 'integration';

      if (isDirectory) {
        integrations.push(fullPath);
      } else if ((await this.getDirectoryType(fullPath)) === 'repository') {
        await this.collectIntegrationsRecursive(fullPath, integrations);
      }
    }
  }

  async findIntegrationVersions(dirname: string = '.'): Promise<Result<string[]>> {
    let files;
    const integPath = path.join(this.directory, dirname);
    try {
      files = await fs.readdir(integPath);
    } catch (err) {
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

  join(filename: string): FileSystemDataAdaptor {
    return new FileSystemDataAdaptor(path.join(this.directory, filename));
  }
}
