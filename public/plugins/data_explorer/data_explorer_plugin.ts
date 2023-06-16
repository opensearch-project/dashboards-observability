/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export type KeyValue<T = any> = Record<string, T>;

export enum PluginType {
  datasource = 'DATASOURCE',
}

export interface IPluginMeta {
  name: string;
  type: PluginType;
}

export abstract class DataExplorerPlugin<T extends IPluginMeta> {
  metadata: T; // plugin meta data
  hasError?: boolean; // if there's error when loading plugin

  constructor() {
    this.metadata = {} as T;
  }
}
