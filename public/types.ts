/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreStart } from '../../../src/core/public';
import { SavedObjectsClient } from '../../../src/core/server';
import { DashboardStart } from '../../../src/plugins/dashboard/public';
import { DataPublicPluginSetup, DataPublicPluginStart } from '../../../src/plugins/data/public';
import { EmbeddableSetup, EmbeddableStart } from '../../../src/plugins/embeddable/public';
import { ManagementOverViewPluginSetup } from '../../../src/plugins/management_overview/public';
import { NavigationPublicPluginStart } from '../../../src/plugins/navigation/public';
import { UiActionsStart } from '../../../src/plugins/ui_actions/public';
import { VisualizationsSetup } from '../../../src/plugins/visualizations/public';

export interface AppPluginStartDependencies {
  navigation: NavigationPublicPluginStart;
  embeddable: EmbeddableStart;
  dashboard: DashboardStart;
  savedObjectsClient: SavedObjectsClient;
  data: DataPublicPluginStart;
}

type ContentRenderer = (content: unknown) => React.ReactElement;
type ActionExecutor = (params: Record<string, unknown>) => void;
export interface AssistantSetup {
  registerContentRenderer: (contentType: string, render: ContentRenderer) => void;
  registerActionExecutor: (actionType: string, execute: ActionExecutor) => void;
}

export interface SetupDependencies {
  embeddable: EmbeddableSetup;
  visualizations: VisualizationsSetup;
  data: DataPublicPluginSetup;
  uiActions: UiActionsStart;
  managementOverview?: ManagementOverViewPluginSetup;
  assistantDashboards?: AssistantSetup;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ObservabilitySetup {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ObservabilityStart {}
