/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import DSLService from 'public/services/requests/dsl';
import {
  ApplicationStart,
  ChromeStart,
  CoreStart,
  HttpStart,
  IToasts,
  OverlayStart,
  SavedObjectsClientContract,
} from '../../../../src/core/public';
import { DashboardStart } from '../../../../src/plugins/dashboard/public';
import { DataSourcePluginStart } from '../../../../src/plugins/data_source/public';
import PPLService from '../services/requests/ppl';
import { NavigationPublicPluginStart } from '../../../../src/plugins/navigation/public';
import { ContentManagementPluginStart } from '../../../../src/plugins/content_management/public';

class CoreRefs {
  private static _instance: CoreRefs;

  public core?: CoreStart;
  public http?: HttpStart;
  public savedObjectsClient?: SavedObjectsClientContract;
  public pplService?: PPLService;
  public dslService?: DSLService;
  public toasts?: IToasts;
  public chrome?: ChromeStart;
  public application?: ApplicationStart;
  public queryAssistEnabled?: boolean;
  public summarizeEnabled?: boolean;
  public dashboard?: DashboardStart;
  public dashboardProviders?: unknown;
  public overlays?: OverlayStart;
  public dataSource?: DataSourcePluginStart;
  public navigation?: NavigationPublicPluginStart;
  public contentManagement?: ContentManagementPluginStart;
  private constructor() {
    // ...
  }

  public static get Instance() {
    // Do you need arguments? Make it a regular static method instead.
    return this._instance || (this._instance = new this());
  }
}

export const coreRefs = CoreRefs.Instance;
