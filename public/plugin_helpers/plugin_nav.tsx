/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  observabilityApplicationsID,
  observabilityGettingStartedID,
  observabilityIntegrationsID,
  observabilityMetricsID,
  observabilityNotebookID,
  observabilityOverviewID,
} from '../../common/constants/shared';
import { CoreSetup } from '../../../../src/core/public';
import { AppPluginStartDependencies, SetupDependencies } from '../types';
import { DEFAULT_NAV_GROUPS, DEFAULT_APP_CATEGORIES } from '../../../../src/core/public';

export function registerAllPluginNavGroups(
  core: CoreSetup<AppPluginStartDependencies>,
  setupDeps: SetupDependencies
) {
  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.observability, [
    {
      id: observabilityOverviewID,
      category: undefined,
      order: 10,
      showInAllNavGroup: true,
    },
  ]);

  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.observability, [
    {
      id: observabilityGettingStartedID,
      category: undefined,
      order: 20,
      showInAllNavGroup: true,
    },
  ]);

  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.observability, [
    {
      id: observabilityApplicationsID,
      category: DEFAULT_APP_CATEGORIES.investigate,
      order: 400,
      showInAllNavGroup: true,
    },
  ]);

  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.observability, [
    {
      id: observabilityIntegrationsID,
      category: DEFAULT_APP_CATEGORIES.visualizeAndReport,
      order: 500,
    },
  ]);

  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.all, [
    {
      id: observabilityIntegrationsID,
      category: DEFAULT_APP_CATEGORIES.visualizeAndReport,
      order: 500,
    },
  ]);

  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.observability, [
    {
      id: observabilityMetricsID,
      category: DEFAULT_APP_CATEGORIES.investigate,
      showInAllNavGroup: true,
      order: 200,
    },
  ]);

  if (!setupDeps.investigationDashboards) {
    core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.observability, [
      {
        id: observabilityNotebookID,
        category: DEFAULT_APP_CATEGORIES.visualizeAndReport,
        order: 400,
      },
    ]);
    core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS[`security-analytics`], [
      {
        id: observabilityNotebookID,
        category: DEFAULT_APP_CATEGORIES.visualizeAndReport,
        order: 400,
      },
    ]);
    core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.all, [
      {
        id: observabilityNotebookID,
        category: DEFAULT_APP_CATEGORIES.visualizeAndReport,
        order: 400,
      },
    ]);
  }

  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.observability, [
    {
      id: 'observability-traces-nav',
      category: DEFAULT_APP_CATEGORIES.investigate,
      showInAllNavGroup: true,
      order: 300,
    },
    {
      id: 'observability-services-nav',
      category: DEFAULT_APP_CATEGORIES.investigate,
      showInAllNavGroup: true,
      order: 100,
    },
  ]);
}
