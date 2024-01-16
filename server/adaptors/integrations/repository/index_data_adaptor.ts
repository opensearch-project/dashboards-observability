/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CatalogDataAdaptor, IntegrationPart } from './catalog_data_adaptor';

export class IndexDataAdaptor implements CatalogDataAdaptor {
  isConfigLocalized = true;
  directory: string;

  constructor(directory: string) {
    this.directory = directory;
  }

  async findIntegrationVersions(_dirname?: string | undefined): Promise<Result<string[], Error>> {
    return { ok: false, error: new Error('Not implemented') };
  }

  async readFile(_filename: string, _type?: IntegrationPart): Promise<Result<object[] | object>> {
    return { ok: false, error: new Error('Not implemented') };
  }

  async readFileRaw(_filename: string, _type?: IntegrationPart): Promise<Result<Buffer>> {
    return { ok: false, error: new Error('Not implemented') };
  }

  async findIntegrations(_dirname: string = '.'): Promise<Result<string[]>> {
    return { ok: false, error: new Error('Not implemented') };
  }

  async getDirectoryType(_dirname?: string): Promise<'integration' | 'repository' | 'unknown'> {
    return 'unknown';
  }

  join(filename: string): IndexDataAdaptor {
    return new IndexDataAdaptor(filename);
  }
}
