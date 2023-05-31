/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';

const DEFAULT_REPOSITORY_PATH: string = __dirname + '/__data__/repository.json';

export class IntegrationsRepository {
  _instance?: IntegrationsRepository;
  repositoryPath: string = DEFAULT_REPOSITORY_PATH;
  repository: IntegrationTemplate[] = [];
  initialized: boolean = false;

  constructor(path?: string) {
    if (this._instance !== undefined && this._instance.repositoryPath === path) {
      return this._instance;
    }
    this.repositoryPath = path || DEFAULT_REPOSITORY_PATH;
    this._instance = this;
  }

  async init(): Promise<void> {
    const buffer = await fs.promises.readFile(this.repositoryPath, 'utf-8');
    try {
      this.repository = JSON.parse(buffer);
      this.initialized = true;
      return Promise.resolve();
    } catch (err: any) {
      return Promise.reject(err);
    }
  }

  _clear() {
    this.repository = [];
    this.initialized = false;
  }

  async get(): Promise<IntegrationTemplate[]> {
    if (!this.initialized) {
      await this.init();
    }
    return Promise.resolve(this.repository);
  }

  async getByName(templateName: string): Promise<IntegrationTemplate> {
    if (!this.initialized) {
      await this.init();
    }
    const result = this.repository.find((template) => template.name === templateName);
    if (result === undefined) {
      return Promise.reject({
        message: `Integration template with name ${templateName} not found`,
        statusCode: 404,
      });
    }
    return Promise.resolve(result);
  }
}
