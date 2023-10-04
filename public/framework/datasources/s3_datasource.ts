/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DataSource } from '../../../../../src/plugins/data/public';

interface DataSourceConfig {
  name: string;
  type: string;
  metadata: any;
}

export class S3DataSource extends DataSource<any, any, any, any, any> {
  constructor({ name, type, metadata }: DataSourceConfig) {
    super(name, type, metadata);
  }

  async getDataSet(dataSetParams?: any) {
    return [this.getName()];
  }

  async testConnection(): Promise<void> {
    throw new Error('This operation is not supported for this class.');
  }

  async runQuery(queryParams: any) {
    return null;
  }
}
