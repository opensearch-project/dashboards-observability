/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  observabilityApplicationsID,
  observabilityIntegrationsID,
  observabilityLogsID,
  observabilityMetricsID,
  observabilityNotebookID,
  observabilityPanelsID,
  observabilityTracesID,
} from '../common/constants/shared';
import { CoreSetup } from '../../../src/core/public';
import { AppPluginStartDependencies } from './types';
import { DEFAULT_NAV_GROUPS, DEFAULT_APP_CATEGORIES } from '../../../src/core/public';

export function registerAllPluginNavGroups(core: CoreSetup<AppPluginStartDependencies>) {
  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.observability, [
    {
      id: observabilityApplicationsID,
      category: DEFAULT_APP_CATEGORIES.dashboardAndReport,
    },
  ]);

  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.observability, [
    {
      id: observabilityLogsID,
      category: DEFAULT_APP_CATEGORIES.investigate,
    },
  ]);
  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS[`security-analytics`], [
    {
      id: observabilityLogsID,
      category: DEFAULT_APP_CATEGORIES.investigate,
    },
  ]);
  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.analytics, [
    {
      id: observabilityLogsID,
      category: DEFAULT_APP_CATEGORIES.investigate,
    },
  ]);
  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.search, [
    {
      id: observabilityLogsID,
      category: DEFAULT_APP_CATEGORIES.analyzeSearch,
    },
  ]);

  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.observability, [
    {
      id: observabilityMetricsID,
      category: DEFAULT_APP_CATEGORIES.investigate,
    },
  ]);

  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.observability, [
    {
      id: observabilityTracesID,
      category: DEFAULT_APP_CATEGORIES.investigate,
    },
  ]);

  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.observability, [
    {
      id: observabilityNotebookID,
      category: DEFAULT_APP_CATEGORIES.dashboardAndReport,
    },
  ]);
  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS[`security-analytics`], [
    {
      id: observabilityNotebookID,
      category: DEFAULT_APP_CATEGORIES.dashboardAndReport,
    },
  ]);
  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.analytics, [
    {
      id: observabilityNotebookID,
      category: DEFAULT_APP_CATEGORIES.dashboardAndReport,
    },
  ]);

  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.observability, [
    {
      id: observabilityPanelsID,
      category: DEFAULT_APP_CATEGORIES.dashboardAndReport,
    },
  ]);
  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS[`security-analytics`], [
    {
      id: observabilityPanelsID,
      category: DEFAULT_APP_CATEGORIES.dashboardAndReport,
    },
  ]);
  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.analytics, [
    {
      id: observabilityPanelsID,
      category: DEFAULT_APP_CATEGORIES.dashboardAndReport,
    },
  ]);
  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.search, [
    {
      id: observabilityPanelsID,
      category: DEFAULT_APP_CATEGORIES.analyzeSearch,
    },
  ]);

  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.observability, [
    {
      id: observabilityIntegrationsID,
      category: DEFAULT_APP_CATEGORIES.dashboardAndReport,
    },
  ]);
  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS[`security-analytics`], [
    {
      id: observabilityIntegrationsID,
      category: DEFAULT_APP_CATEGORIES.dashboardAndReport,
    },
  ]);
  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.analytics, [
    {
      id: observabilityIntegrationsID,
      category: DEFAULT_APP_CATEGORIES.dashboardAndReport,
    },
  ]);
}
