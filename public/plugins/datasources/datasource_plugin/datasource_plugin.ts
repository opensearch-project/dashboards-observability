/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DataExplorerPlugin, IPluginMeta } from '../../data_explorer/data_explorer_plugin';

export type IDatasourcePluginMeta = IPluginMeta;

export interface IDatasourcePluginComponents {
  QueryEditor: any;
}

export class DatasourcePlugin extends DataExplorerPlugin<IDatasourcePluginMeta> {
  components: IDatasourcePluginComponents | null = null;

  constructor() {
    super();
  }

  setQueryEditor(QueryEditor: any) {
    this.components.QueryEditor = QueryEditor;
  }
}
