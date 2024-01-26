/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ApplicationStart,
  ChromeStart,
  CoreStart,
  HttpStart,
  IToasts,
  SavedObjectsClientContract,
} from '../../../../src/core/public';
import { DashboardStart } from '../../../../src/plugins/dashboard/public';
import PPLService from '../services/requests/ppl';

class CoreRefs {
  private static _instance: CoreRefs;

  public core?: CoreStart;
  public http?: HttpStart;
  public savedObjectsClient?: SavedObjectsClientContract;
  public pplService?: PPLService;
  public toasts?: IToasts;
  public chrome?: ChromeStart;
  public application?: ApplicationStart;
  public queryAssistEnabled?: boolean;
  public summarizeEnabled?: boolean;
  public dashboard?: DashboardStart;
  public dashboardProviders?: unknown;
  private constructor() {
    // ...
  }

  public static get Instance() {
    // Do you need arguments? Make it a regular static method instead.
    return this._instance || (this._instance = new this());
  }
}

export const coreRefs = CoreRefs.Instance;
