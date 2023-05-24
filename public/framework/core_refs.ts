/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * The OpenSearch Contributors require contributions made to
 * this file be licensed under the Apache-2.0 license or a
 * compatible open source license.
 *
 * Any modifications Copyright OpenSearch Contributors. See
 * GitHub history for details.
 */

import { HttpStart, IToasts } from '../../../../src/core/public';
import { SavedObjectsClientContract } from '../../../../src/core/public';
import PPLService from '../services/requests/ppl';

class CoreRefs {
  private static _instance: CoreRefs;

  public http?: HttpStart;
  public savedObjectsClient?: SavedObjectsClientContract;
  public pplService?: PPLService;
  public toasts?: IToasts;
  private constructor() {
    // ...
  }

  public static get Instance() {
    // Do you need arguments? Make it a regular static method instead.
    return this._instance || (this._instance = new this());
  }
}

export const coreRefs = CoreRefs.Instance;
