/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { coreMock } from '../../../../src/core/public/mocks';
import { DEFAULT_APP_CATEGORIES, DEFAULT_NAV_GROUPS } from '../../../../src/core/utils';
import { registerAllPluginNavGroups } from './plugin_nav';

describe('registerAllPluginNavGroups', () => {
  let coreSetup: ReturnType<typeof coreMock.createSetup>;
  const applicationMonitoringCategory = {
    id: 'applicationMonitoring',
    label: 'Application Monitoring',
    order: 200,
  };

  beforeEach(() => {
    coreSetup = coreMock.createSetup();
    coreSetup.chrome.navGroup.getNavGroupEnabled.mockReturnValue(true);
    if (!coreSetup.chrome.getIsIconSideNavEnabled) {
      coreSetup.chrome.getIsIconSideNavEnabled = jest.fn();
    }
  });

  it('should call registerIconSideNavGroups when icon side nav is enabled', () => {
    (coreSetup.chrome.getIsIconSideNavEnabled as jest.Mock).mockReturnValue(true);

    registerAllPluginNavGroups(coreSetup as any, false, applicationMonitoringCategory);

    const calls = (coreSetup.chrome.navGroup.addNavLinksToGroup as jest.Mock).mock.calls;

    // Find the call that registers notebooks under observability
    const observabilityCalls = calls.filter(
      (call: any) => call[0] === DEFAULT_NAV_GROUPS.observability
    );
    const notebookObsCall = observabilityCalls.find((call: any) =>
      call[1].some(
        (link: any) =>
          link.id === 'observability-notebooks' &&
          link.category === DEFAULT_APP_CATEGORIES.observabilityTools
      )
    );
    expect(notebookObsCall).toBeDefined();
  });

  it('should call registerDefaultNavGroups when icon side nav is disabled', () => {
    (coreSetup.chrome.getIsIconSideNavEnabled as jest.Mock).mockReturnValue(false);

    registerAllPluginNavGroups(coreSetup as any, false, applicationMonitoringCategory);

    const calls = (coreSetup.chrome.navGroup.addNavLinksToGroup as jest.Mock).mock.calls;

    // Find the call that registers notebooks under observability with the default category
    const observabilityCalls = calls.filter(
      (call: any) => call[0] === DEFAULT_NAV_GROUPS.observability
    );
    const notebookDefaultCall = observabilityCalls.find((call: any) =>
      call[1].some(
        (link: any) =>
          link.id === 'observability-notebooks' &&
          link.category === DEFAULT_APP_CATEGORIES.visualizeAndReport
      )
    );
    expect(notebookDefaultCall).toBeDefined();

    // Default path should also register overview
    const overviewCall = observabilityCalls.find((call: any) =>
      call[1].some((link: any) => link.id === 'observability-overview')
    );
    expect(overviewCall).toBeDefined();
  });

  it('should register topology map with startCluster when APM enabled and icon side nav ON', () => {
    (coreSetup.chrome.getIsIconSideNavEnabled as jest.Mock).mockReturnValue(true);

    registerAllPluginNavGroups(coreSetup as any, true, applicationMonitoringCategory);

    const calls = (coreSetup.chrome.navGroup.addNavLinksToGroup as jest.Mock).mock.calls;

    const observabilityCalls = calls.filter(
      (call: any) => call[0] === DEFAULT_NAV_GROUPS.observability
    );
    const topologyMapCall = observabilityCalls.find((call: any) =>
      call[1].some(
        (link: any) => link.id === 'observability-apm-application-map' && link.startCluster === true
      )
    );
    expect(topologyMapCall).toBeDefined();
  });

  it('should register APM services with navServiceMap icon when icon side nav ON', () => {
    (coreSetup.chrome.getIsIconSideNavEnabled as jest.Mock).mockReturnValue(true);

    registerAllPluginNavGroups(coreSetup as any, true, applicationMonitoringCategory);

    const calls = (coreSetup.chrome.navGroup.addNavLinksToGroup as jest.Mock).mock.calls;

    const observabilityCalls = calls.filter(
      (call: any) => call[0] === DEFAULT_NAV_GROUPS.observability
    );
    const servicesCall = observabilityCalls.find((call: any) =>
      call[1].some(
        (link: any) =>
          link.id === 'observability-apm-services' && link.euiIconType === 'navServiceMap'
      )
    );
    expect(servicesCall).toBeDefined();
  });

  it('should register trace analytics items under traceAnalytics category when APM disabled and icon side nav ON', () => {
    (coreSetup.chrome.getIsIconSideNavEnabled as jest.Mock).mockReturnValue(true);

    registerAllPluginNavGroups(coreSetup as any, false, applicationMonitoringCategory);

    const calls = (coreSetup.chrome.navGroup.addNavLinksToGroup as jest.Mock).mock.calls;

    const observabilityCalls = calls.filter(
      (call: any) => call[0] === DEFAULT_NAV_GROUPS.observability
    );
    const traceAnalyticsCall = observabilityCalls.find((call: any) =>
      call[1].some(
        (link: any) =>
          link.id === 'observability-services-nav' &&
          link.category === DEFAULT_APP_CATEGORIES.traceAnalytics
      )
    );
    expect(traceAnalyticsCall).toBeDefined();

    const tracesLink = traceAnalyticsCall[1].find(
      (link: any) => link.id === 'observability-traces-nav'
    );
    expect(tracesLink).toBeDefined();
    expect(tracesLink.category).toBe(DEFAULT_APP_CATEGORIES.traceAnalytics);
    expect(tracesLink.euiIconType).toBe('apmApp');
  });

  it('should NOT register APM items when APM disabled and icon side nav ON', () => {
    (coreSetup.chrome.getIsIconSideNavEnabled as jest.Mock).mockReturnValue(true);

    registerAllPluginNavGroups(coreSetup as any, false, applicationMonitoringCategory);

    const calls = (coreSetup.chrome.navGroup.addNavLinksToGroup as jest.Mock).mock.calls;

    const observabilityCalls = calls.filter(
      (call: any) => call[0] === DEFAULT_NAV_GROUPS.observability
    );
    const apmCall = observabilityCalls.find((call: any) =>
      call[1].some((link: any) => link.id === 'observability-apm-services')
    );
    expect(apmCall).toBeUndefined();
  });

  it('should register trace analytics under investigate category when APM disabled and icon side nav OFF', () => {
    (coreSetup.chrome.getIsIconSideNavEnabled as jest.Mock).mockReturnValue(false);

    registerAllPluginNavGroups(coreSetup as any, false, applicationMonitoringCategory);

    const calls = (coreSetup.chrome.navGroup.addNavLinksToGroup as jest.Mock).mock.calls;

    const observabilityCalls = calls.filter(
      (call: any) => call[0] === DEFAULT_NAV_GROUPS.observability
    );
    const tracesCall = observabilityCalls.find((call: any) =>
      call[1].some(
        (link: any) =>
          link.id === 'observability-traces-nav' &&
          link.category === DEFAULT_APP_CATEGORIES.investigate
      )
    );
    expect(tracesCall).toBeDefined();

    const traceAnalyticsCall = observabilityCalls.find((call: any) =>
      call[1].some((link: any) => link.category === DEFAULT_APP_CATEGORIES.traceAnalytics)
    );
    expect(traceAnalyticsCall).toBeUndefined();
  });
});
