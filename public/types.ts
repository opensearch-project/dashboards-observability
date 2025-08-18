/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectsClient } from '../../../src/core/server';
import { DashboardStart } from '../../../src/plugins/dashboard/public';
import { DataPublicPluginSetup, DataPublicPluginStart } from '../../../src/plugins/data/public';
import {
  DataSourcePluginSetup,
  DataSourcePluginStart,
} from '../../../src/plugins/data_source/public';
import { DataSourceManagementPluginSetup } from '../../../src/plugins/data_source_management/public';
import { EmbeddableSetup, EmbeddableStart } from '../../../src/plugins/embeddable/public';
import { ManagementOverViewPluginSetup } from '../../../src/plugins/management_overview/public';
import { NavigationPublicPluginStart } from '../../../src/plugins/navigation/public';
import { UiActionsStart } from '../../../src/plugins/ui_actions/public';
import { VisualizationsSetup } from '../../../src/plugins/visualizations/public';
import {
  LoadCachehookOutput,
  RenderAccelerationDetailsFlyoutParams,
  RenderAccelerationFlyoutParams,
  RenderAssociatedObjectsDetailsFlyoutParams,
} from '../common/types/data_connections';
import { CatalogCacheManager } from './framework/catalog_cache/cache_manager';
import { AssistantSetup } from './types';
import {
  ContentManagementPluginSetup,
  ContentManagementPluginStart,
} from '../../../src/plugins/content_management/public/types';

export interface AppPluginStartDependencies {
  navigation: NavigationPublicPluginStart;
  embeddable: EmbeddableStart;
  dashboard: DashboardStart;
  savedObjectsClient: SavedObjectsClient;
  data: DataPublicPluginStart;
  securityDashboards?: {};
  dataSource: DataSourcePluginStart;
  contentManagement?: ContentManagementPluginStart;
}

export interface SetupDependencies {
  embeddable: EmbeddableSetup;
  visualizations: VisualizationsSetup;
  data: DataPublicPluginSetup;
  uiActions: UiActionsStart;
  managementOverview?: ManagementOverViewPluginSetup;
  assistantDashboards?: AssistantSetup;
  dataSource: DataSourcePluginSetup;
  dataSourceManagement: DataSourceManagementPluginSetup;
  contentManagement?: ContentManagementPluginSetup;
  investigationDashboards?: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ObservabilitySetup {}

export interface ObservabilityStart {
  renderAccelerationDetailsFlyout: ({
    acceleration,
    dataSourceName,
    handleRefresh,
    dataSourceMDSId,
  }: RenderAccelerationDetailsFlyoutParams) => void;
  renderAssociatedObjectsDetailsFlyout: ({
    tableDetail,
    dataSourceName,
    handleRefresh,
  }: RenderAssociatedObjectsDetailsFlyoutParams) => void;
  renderCreateAccelerationFlyout: ({
    dataSource,
    dataSourceMDSId,
    databaseName,
    tableName,
    handleRefresh,
  }: RenderAccelerationFlyoutParams) => void;
  CatalogCacheManagerInstance: typeof CatalogCacheManager;
  useLoadDatabasesToCacheHook: () => LoadCachehookOutput;
  useLoadTablesToCacheHook: () => LoadCachehookOutput;
  useLoadTableColumnsToCacheHook: () => LoadCachehookOutput;
  useLoadAccelerationsToCacheHook: () => LoadCachehookOutput;
}

export type CatalogCacheManagerType = typeof CatalogCacheManager;
export type LoadCachehookOutputType = LoadCachehookOutput;

/**
 * Introduce a compile dependency on dashboards-assistant
 * as observerability need some types from the plugin.
 * It will gives an type error when dashboards-assistant is not installed so add a ts-ignore to suppress the error.
 */
// @ts-ignore
export type { AssistantSetup, IMessage, RenderProps } from '../../dashboards-assistant/public';
