/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  IBasePath,
  IUiSettingsClient,
  NotificationsStart,
  ToastInput,
} from '../../../../src/core/public';

let uiSettings: IUiSettingsClient;
let notifications: NotificationsStart;
let basePath: IBasePath;

export const uiSettingsService = {
  init: (client: IUiSettingsClient, notificationsStart: NotificationsStart, path: IBasePath) => {
    uiSettings = client;
    notifications = notificationsStart;
    basePath = path;
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
  getBasePath: () => {
    return basePath;
  },
};
