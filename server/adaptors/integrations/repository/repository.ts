/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Integration } from './integration';

export class Repository {
  directory: string;

  constructor(directory: string) {
    this.directory = directory;
  }

  async getIntegrationList(): Promise<Integration[]> {
    try {
      const folders = await fs.readdir(this.directory);
      const integrations = Promise.all(
        folders.map(async (folder) => {
          const integPath = path.join(this.directory, folder);
          if (!(await fs.lstat(integPath)).isDirectory()) {
            return null;
          }
          const integ = new Integration(integPath);
          return (await integ.check()) ? integ : null;
        })
      );
      return (await integrations).filter((x) => x !== null) as Integration[];
    } catch (error) {
      console.error(`Error reading integration directories in: ${this.directory}`, error);
      return [];
    }
  }

  async getIntegration(name: string): Promise<Integration | null> {
    const integ = new Integration(path.join(this.directory, name));
    return (await integ.check()) ? integ : null;
  }
}
