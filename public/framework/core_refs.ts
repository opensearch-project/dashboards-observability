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
  public dslService?: DSLService;
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

/**
 * Safely prepend the `basePath` from `coreRefs` to the given link.
 * If `coreRefs.http.basePath` exists (always true in normal operation), prepend it to the link.
 * If it doesn't exist (usually during unit testing), return the link as-is.
 *
 * @param link The link to prepend with `coreRefs.http.basePath`.
 * @returns The link with the prepended `basePath` if it exists, otherwise the unmodified link.
 */
export const basePathLink = (link: string): string => {
  if (coreRefs.http?.basePath) {
    return coreRefs.http.basePath.prepend(link);
  } else {
    return link;
  }
};
