/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  observabilityApplicationsID,
  observabilityIntegrationsID,
  observabilityMetricsID,
  observabilityNotebookID,
} from '../common/constants/shared';
import { CoreSetup } from '../../../src/core/public';
import { AppPluginStartDependencies } from './types';
import { DEFAULT_NAV_GROUPS, DEFAULT_APP_CATEGORIES } from '../../../src/core/public';

export function registerAllPluginNavGroups(core: CoreSetup<AppPluginStartDependencies>) {
  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.observability, [
    {
      id: observabilityApplicationsID,
      category: DEFAULT_APP_CATEGORIES.investigate,
      order: 100,
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

  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.observability, [
    {
      id: observabilityNotebookID,
      category: DEFAULT_APP_CATEGORIES.dashboardAndReport,
      order: 400,
    },
  ]);
  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS[`security-analytics`], [
    {
      id: observabilityNotebookID,
      category: DEFAULT_APP_CATEGORIES.dashboardAndReport,
      order: 400,
    },
  ]);
  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.analytics, [
    {
      id: observabilityNotebookID,
      category: DEFAULT_APP_CATEGORIES.dashboardAndReport,
      order: 400,
    },
  ]);

  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.observability, [
    {
      id: observabilityIntegrationsID,
      category: DEFAULT_APP_CATEGORIES.dashboardAndReport,
      order: 500,
    },
  ]);
  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS[`security-analytics`], [
    {
      id: observabilityIntegrationsID,
      category: DEFAULT_APP_CATEGORIES.dashboardAndReport,
      order: 500,
    },
  ]);
  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.analytics, [
    {
      id: observabilityIntegrationsID,
      category: DEFAULT_APP_CATEGORIES.dashboardAndReport,
      order: 500,
    },
  ]);

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
