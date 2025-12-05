/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { i18n } from '@osd/i18n';
import {
  CoreSetup,
  AppCategory,
  DEFAULT_NAV_GROUPS,
  DEFAULT_APP_CATEGORIES,
} from '../../../../src/core/public';
import {
  observabilityApplicationsID,
  observabilityGettingStartedID,
  observabilityIntegrationsID,
  observabilityMetricsID,
  observabilityNotebookID,
  observabilityOverviewID,
} from '../../common/constants/shared';
import {
  observabilityApmServicesID,
  observabilityApmApplicationMapID,
} from '../../common/constants/apm';
import { AppPluginStartDependencies, SetupDependencies } from '../types';

export function registerAllPluginNavGroups(
  core: CoreSetup<AppPluginStartDependencies>,
  setupDeps: SetupDependencies,
  dataSourceEnabled: boolean,
  apmEnabled: boolean
) {
  // Custom category for APM features
  const APPLICATION_MONITORING_CATEGORY: AppCategory = {
    id: 'applicationMonitoring',
    label: i18n.translate('observability.ui.applicationMonitoringNav.label', {
      defaultMessage: 'Application Monitoring',
    }),
    order: 800,
  };

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

  if (dataSourceEnabled && apmEnabled) {
    // APM Mode - register nav links for Services and Application Map
    core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.observability, [
      {
        id: observabilityApmServicesID,
        category: APPLICATION_MONITORING_CATEGORY, // Explicitly pass custom category
        showInAllNavGroup: true,
        order: 100,
      },
      {
        id: observabilityApmApplicationMapID,
        category: APPLICATION_MONITORING_CATEGORY, // Explicitly pass custom category
        showInAllNavGroup: true,
        order: 200,
      },
    ]);
  } else {
    // Trace Analytics Mode
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
}
