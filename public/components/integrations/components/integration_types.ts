/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ChromeStart,
  HttpStart,
  MountPoint,
  NotificationsStart,
  SavedObjectsStart,
} from '../../../../../../src/core/public';
import { DataSourceManagementPluginSetup } from '../../../../../../src/plugins/data_source_management/public';

export interface AvailableIntegrationOverviewPageProps {
  http: HttpStart;
  chrome: ChromeStart;
}

export interface AddedIntegrationOverviewPageProps {
  http: HttpStart;
  chrome: ChromeStart;
  dataSourceEnabled: boolean;
}

export interface AvailableIntegrationProps {
  http: HttpStart;
  chrome: ChromeStart;
}

export interface AddedIntegrationProps {
  http: HttpStart;
  chrome: ChromeStart;
  integrationInstanceId: string;
  notifications: NotificationsStart;
  dataSourceEnabled: boolean;
  dataSourceManagement: DataSourceManagementPluginSetup;
  savedObjectsMDSClient: SavedObjectsStart;
  setActionMenu: (menuMount: MountPoint | undefined) => void;
}

export interface AvailableIntegrationProps {
  http: HttpStart;
  chrome: ChromeStart;
  integrationTemplateId: string;
  notifications: NotificationsStart;
  dataSourceEnabled: boolean;
  dataSourceManagement: DataSourceManagementPluginSetup;
  savedObjectsMDSClient: SavedObjectsStart;
}
