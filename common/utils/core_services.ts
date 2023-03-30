/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  HttpStart,
  IUiSettingsClient,
  NotificationsStart,
  SavedObjectsClientContract,
  ToastInput,
} from '../../../../src/core/public';
import { createGetterSetter } from '../../../../src/plugins/opensearch_dashboards_utils/common';
import PPLService from '../../public/services/requests/ppl';
import { QueryManager } from '../query_manager';

let uiSettings: IUiSettingsClient;
let notifications: NotificationsStart;

export const uiSettingsService = {
  init: (client: IUiSettingsClient, notificationsStart: NotificationsStart) => {
    uiSettings = client;
    notifications = notificationsStart;
  },
  get: (key: string, defaultOverride?: any) => {
    return uiSettings?.get(key, defaultOverride) || '';
  },
  set: (key: string, value: any) => {
    return uiSettings?.set(key, value) || Promise.reject('uiSettings client not initialized.');
  },
  addToast: (toast: ToastInput) => {
    return notifications.toasts.add(toast);
  },
};

export const [getPPLService, setPPLService] = createGetterSetter<PPLService>('PPLService');
export const [getOSDHttp, setOSDHttp] = createGetterSetter<HttpStart>('http');
export const [getOSDSavedObjectsClient, setOSDSavedObjectsClient] = createGetterSetter<
  SavedObjectsClientContract
>('SavedObjectsClient');
export const [getQueryManager, setQueryManager] = createGetterSetter<QueryManager>('QueryManager');
