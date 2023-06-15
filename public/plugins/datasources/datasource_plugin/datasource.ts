/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export abstract class Datasource {
  readonly name: string;
  readonly type: string;
  readonly metadata: any;

  constructor(datasourceSettings: any) {
    this.name = datasourceSettings.name;
    this.type = datasourceSettings.type;
    this.metadata = datasourceSettings.metadata;
  }
}
