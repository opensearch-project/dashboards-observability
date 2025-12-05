/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ObservabilityPlugin } from './plugin';
import { coreMock } from '../../../src/core/public/mocks';
import { embeddablePluginMock } from '../../../src/plugins/embeddable/public/mocks';
import { visualizationsPluginMock } from '../../../src/plugins/visualizations/public/mocks';
import { dataPluginMock } from '../../../src/plugins/data/public/mocks';
import { uiActionsPluginMock } from '../../../src/plugins/ui_actions/public/mocks';
import { SetupDependencies } from './types';
import { observabilityNotebookID } from '../common/constants/shared';
import { DEFAULT_NAV_GROUPS } from '../../../src/core/public';
import { contentManagementPluginMocks } from '../../../src/plugins/content_management/public';

describe('#setup', () => {
  it('should not register notebook application and call add notebook into nav group when investigation plugin present', async () => {
    const intializerContextMock = coreMock.createPluginInitializerContext();
    const coreSetup = coreMock.createSetup();
    const observabilityPlugin = new ObservabilityPlugin(intializerContextMock);
    coreSetup.chrome.navGroup.getNavGroupEnabled.mockReturnValue(true);
    coreSetup.uiSettings.getUserProvidedWithScope = jest.fn().mockResolvedValue(true);
    await observabilityPlugin.setup(coreSetup, ({
      investigationDashboards: {},
      embeddable: embeddablePluginMock.createSetupContract(),
      visualizations: visualizationsPluginMock.createSetupContract(),
      data: dataPluginMock.createSetupContract(),
      uiActions: uiActionsPluginMock.createSetupContract(),
      dataSource: undefined,
      dataSourceManagement: undefined,
      contentManagement: contentManagementPluginMocks.createSetupContract(),
      dashboard: {
        registerDashboardProvider: jest.fn(),
      },
    } as unknown) as SetupDependencies);

    expect(coreSetup.application.register).toBeCalled();
    expect(coreSetup.chrome.navGroup.addNavLinksToGroup).toBeCalled();

    expect(coreSetup.application.register).not.toBeCalledWith(
      expect.objectContaining({
        type: observabilityNotebookID,
      })
    );

    expect(coreSetup.chrome.navGroup.addNavLinksToGroup).not.toBeCalledWith(
      DEFAULT_NAV_GROUPS.observability,
      expect.objectContaining({
        type: observabilityNotebookID,
      })
    );

    expect(coreSetup.chrome.navGroup.addNavLinksToGroup).not.toBeCalledWith(
      DEFAULT_NAV_GROUPS['security-analytics'],
      expect.objectContaining({
        type: observabilityNotebookID,
      })
    );

    expect(coreSetup.chrome.navGroup.addNavLinksToGroup).not.toBeCalledWith(
      DEFAULT_NAV_GROUPS.all,
      expect.objectContaining({
        type: observabilityNotebookID,
      })
    );
  });
});

describe('#setup with APM enabled', () => {
  it('should register both APM applications when MDS and APM are enabled', async () => {
    const intializerContextMock = coreMock.createPluginInitializerContext();
    const coreSetup = coreMock.createSetup();
    const observabilityPlugin = new ObservabilityPlugin(intializerContextMock);

    coreSetup.chrome.navGroup.getNavGroupEnabled.mockReturnValue(true);
    coreSetup.uiSettings.getUserProvidedWithScope = jest.fn().mockResolvedValue(true);

    await observabilityPlugin.setup(coreSetup, ({
      embeddable: embeddablePluginMock.createSetupContract(),
      visualizations: visualizationsPluginMock.createSetupContract(),
      data: dataPluginMock.createSetupContract(),
      uiActions: uiActionsPluginMock.createSetupContract(),
      dataSource: { dataSource: {} }, // MDS enabled
      contentManagement: contentManagementPluginMocks.createSetupContract(),
      dashboard: { registerDashboardProvider: jest.fn() },
    } as unknown) as SetupDependencies);

    const registerCalls = (coreSetup.application.register as jest.Mock).mock.calls;

    // Verify Services app is registered
    const servicesApp = registerCalls.find((call) => call[0].id === 'observability-apm-services');
    expect(servicesApp).toBeDefined();
    expect(servicesApp[0].category.id).toBe('applicationMonitoring');

    // Verify Application Map app is registered
    const appMapApp = registerCalls.find(
      (call) => call[0].id === 'observability-apm-application-map'
    );
    expect(appMapApp).toBeDefined();
    expect(appMapApp[0].category.id).toBe('applicationMonitoring');
  });

  it('should register trace analytics when APM setting disabled', async () => {
    const intializerContextMock = coreMock.createPluginInitializerContext();
    const coreSetup = coreMock.createSetup();
    const observabilityPlugin = new ObservabilityPlugin(intializerContextMock);

    coreSetup.chrome.navGroup.getNavGroupEnabled.mockReturnValue(true);
    coreSetup.uiSettings.getUserProvidedWithScope = jest.fn().mockResolvedValue(false); // APM disabled

    await observabilityPlugin.setup(coreSetup, ({
      embeddable: embeddablePluginMock.createSetupContract(),
      visualizations: visualizationsPluginMock.createSetupContract(),
      data: dataPluginMock.createSetupContract(),
      uiActions: uiActionsPluginMock.createSetupContract(),
      dataSource: { dataSource: {} },
      contentManagement: contentManagementPluginMocks.createSetupContract(),
      dashboard: { registerDashboardProvider: jest.fn() },
    } as unknown) as SetupDependencies);

    const registerCalls = (coreSetup.application.register as jest.Mock).mock.calls;
    const tracesApp = registerCalls.find((call) => call[0].id === 'observability-traces-nav');
    expect(tracesApp).toBeDefined();
  });

  it('should register trace analytics when MDS disabled (even if APM setting enabled)', async () => {
    const intializerContextMock = coreMock.createPluginInitializerContext();
    const coreSetup = coreMock.createSetup();
    const observabilityPlugin = new ObservabilityPlugin(intializerContextMock);

    coreSetup.chrome.navGroup.getNavGroupEnabled.mockReturnValue(true);
    coreSetup.uiSettings.getUserProvidedWithScope = jest.fn().mockResolvedValue(true); // APM enabled

    await observabilityPlugin.setup(coreSetup, ({
      embeddable: embeddablePluginMock.createSetupContract(),
      visualizations: visualizationsPluginMock.createSetupContract(),
      data: dataPluginMock.createSetupContract(),
      uiActions: uiActionsPluginMock.createSetupContract(),
      // dataSource: undefined, // MDS disabled
      contentManagement: contentManagementPluginMocks.createSetupContract(),
      dashboard: { registerDashboardProvider: jest.fn() },
    } as unknown) as SetupDependencies);

    const registerCalls = (coreSetup.application.register as jest.Mock).mock.calls;
    // Should register trace analytics, NOT APM
    const tracesApp = registerCalls.find((call) => call[0].id === 'observability-traces-nav');
    expect(tracesApp).toBeDefined();

    const apmApp = registerCalls.find((call) => call[0].id === 'observability-apm-services');
    expect(apmApp).toBeUndefined();
  });
});
