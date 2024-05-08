/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DataSource } from '../../../../../src/plugins/data/public';

interface DataSourceConfig {
  name: string;
  type: string;
  metadata: any;
  id: string;
}

export class S3DataSource extends DataSource {
  constructor({ id, name, type, metadata }: DataSourceConfig) {
    super({ id, name, type, metadata });
  }

  async getDataSet() {
    return { dataSets: [this.getName()] };
  }

  async testConnection(): Promise<boolean> {
    return true;
  }

  async runQuery() {
    return { data: {} };
  }
}
