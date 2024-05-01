/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DataSource } from '../../../../../src/plugins/data/public';

interface DataSourceConfig {
  id: string;
  name: string;
  type: string;
  metadata: any;
}

export class ObservabilityDefaultDataSource extends DataSource<any, any, any, any, any> {
  constructor({ id, name, type, metadata }: DataSourceConfig) {
    super({ id, name, type, metadata });
  }

  async getDataSet() {
    return ['Default data source'];
  }

  async testConnection(): Promise<boolean> {
    return true;
  }

  async runQuery() {
    return null;
  }
}
