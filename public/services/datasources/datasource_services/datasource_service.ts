/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Datasource } from 'public/plugins/datasources/datasource_plugin/datasource';
import { IDatasourceService } from './types/datasource_service';

export class DatasourceService implements IDatasourceService {
  private datasources: Record<string, Datasource> = {};
  private settingsByName: Record<string, Datasource> = {};
  private settingsByType: Record<string, Datasource> = {};

  constructor() {}

  init(settingsByName: Record<string, Datasource>) {}

  getList(filters: any) {}

  getInstance(dsRef: any) {}

  getSettings(dsRef: any) {}
}
