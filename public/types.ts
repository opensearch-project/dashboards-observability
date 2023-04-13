/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectsClient } from '../../../src/core/server';
import { DashboardStart } from '../../../src/plugins/dashboard/public';
import { DataPublicPluginSetup } from '../../../src/plugins/data/public';
import { EmbeddableSetup, EmbeddableStart } from '../../../src/plugins/embeddable/public';
import { NavigationPublicPluginStart } from '../../../src/plugins/navigation/public';
import { UiActionsStart } from '../../../src/plugins/ui_actions/public';
import { VisualizationsSetup } from '../../../src/plugins/visualizations/public';

export interface AppPluginStartDependencies {
  navigation: NavigationPublicPluginStart;
  embeddable: EmbeddableStart;
  dashboard: DashboardStart;
  savedObjectsClient: SavedObjectsClient;
}

export interface SetupDependencies {
  embeddable: EmbeddableSetup;
  visualizations: VisualizationsSetup;
  data: DataPublicPluginSetup;
  uiActions: UiActionsStart;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ObservabilitySetup {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ObservabilityStart {}
