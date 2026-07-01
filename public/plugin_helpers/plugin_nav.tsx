/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

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
  observabilityAlertingID,
} from '../../common/constants/shared';
import {
  observabilityApmServicesID,
  observabilityApmApplicationMapID,
  observabilityApmSloID,
} from '../../common/constants/apm';
import { AppPluginStartDependencies } from '../types';
import { notebooksNavPopover } from './notebooks_nav_popover';
import {
  topologyMapNavPopover,
  servicesNavPopover,
  sloNavPopover,
  alertingNavPopover,
} from './apm_nav_popover';

function registerIconSideNavGroups(
  core: CoreSetup<AppPluginStartDependencies>,
  apmEnabled: boolean,
  alertManagerEnabled: boolean = false,
  sloEnabled: boolean = false
) {
  // Notebooks → Tools category
  core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.observability, [
    {
      id: observabilityNotebookID,
      category: DEFAULT_APP_CATEGORIES.observabilityTools,
      order: 400,
      euiIconType: 'notebookApp',
      navPopover: notebooksNavPopover,
    },
  ]);

  if (alertManagerEnabled) {
    core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.observability, [
      {
        id: observabilityAlertingID,
        category: undefined,
        showInAllNavGroup: true,
        order: 50,
        euiIconType: 'bell',
        navPopover: alertingNavPopover,
      },
    ]);
    core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.all, [
      {
        id: observabilityAlertingID,
        category: DEFAULT_APP_CATEGORIES.visualizeAndReport,
        order: 150,
      },
    ]);
  }
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

  if (apmEnabled) {
    core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.observability, [
      {
        id: observabilityApmServicesID,
        category: DEFAULT_APP_CATEGORIES.applicationPerformance,
        showInAllNavGroup: true,
        order: 200,
        euiIconType: 'navServiceMap',
        navPopover: servicesNavPopover,
      },
      {
        id: observabilityApmApplicationMapID,
        // Title comes from observabilityApmApplicationMapTitle ('Topology Map'),
        // so no per-link override is needed here.
        category: undefined,
        showInAllNavGroup: true,
        order: 400,
        euiIconType: 'navAiFlow',
        startCluster: true,
        navPopover: topologyMapNavPopover,
      },
      ...(sloEnabled
        ? [
            {
              id: observabilityApmSloID,
              category: DEFAULT_APP_CATEGORIES.applicationPerformance,
              showInAllNavGroup: true,
              order: 500,
              euiIconType: 'visGauge',
              navPopover: sloNavPopover,
            },
          ]
        : []),
    ]);
  } else {
    core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.observability, [
      {
        id: 'observability-services-nav',
        category: DEFAULT_APP_CATEGORIES.traceAnalytics,
        showInAllNavGroup: true,
        order: 100,
        euiIconType: 'navServiceMap',
      },
      {
        id: 'observability-traces-nav',
        category: DEFAULT_APP_CATEGORIES.traceAnalytics,
        showInAllNavGroup: true,
        order: 200,
        euiIconType: 'apmApp',
      },
    ]);
  }
}

function registerDefaultNavGroups(
  core: CoreSetup<AppPluginStartDependencies>,
  apmEnabled: boolean,
  applicationMonitoringCategory: AppCategory,
  alertManagerEnabled: boolean = false,
  sloEnabled: boolean = false
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

  if (alertManagerEnabled) {
    core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.observability, [
      {
        id: observabilityAlertingID,
        category: undefined,
        showInAllNavGroup: true,
        order: 30,
      },
    ]);
    // Also register in the global "all" nav group so the icon side nav picks
    // up the alerting app across workspaces — matches the pattern used by
    // `observabilityNotebookID` and `observabilityIntegrationsID` above.
    core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.all, [
      {
        id: observabilityAlertingID,
        category: undefined,
        order: 30,
      },
    ]);
  }

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

  if (apmEnabled) {
    core.chrome.navGroup.addNavLinksToGroup(DEFAULT_NAV_GROUPS.observability, [
      {
        id: observabilityApmServicesID,
        category: applicationMonitoringCategory,
        showInAllNavGroup: true,
        order: 100,
      },
      {
        id: observabilityApmApplicationMapID,
        category: applicationMonitoringCategory,
        showInAllNavGroup: true,
        order: 200,
      },
      ...(sloEnabled
        ? [
            {
              id: observabilityApmSloID,
              category: applicationMonitoringCategory,
              showInAllNavGroup: true,
              order: 300,
            },
          ]
        : []),
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
  } else {
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

export function registerAllPluginNavGroups(
  core: CoreSetup<AppPluginStartDependencies>,
  apmEnabled: boolean,
  applicationMonitoringCategory: AppCategory,
  alertManagerEnabled: boolean = false,
  sloEnabled: boolean = false
) {
  if (core.chrome.getIsIconSideNavEnabled()) {
    registerIconSideNavGroups(core, apmEnabled, alertManagerEnabled, sloEnabled);
  } else {
    registerDefaultNavGroups(
      core,
      apmEnabled,
      applicationMonitoringCategory,
      alertManagerEnabled,
      sloEnabled
    );
  }
}
