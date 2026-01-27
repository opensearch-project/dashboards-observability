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
import { AppPluginStartDependencies, SetupDependencies } from './types';
import { contentManagementPluginMocks } from '../../../src/plugins/content_management/public';
import { BehaviorSubject } from 'rxjs';
import { AppNavLinkStatus } from '../../../src/core/public';

describe('#setup', () => {
  it('should hide notebook entry when capabilities.investigation is enabled', async () => {
    const initializerContextMock = coreMock.createPluginInitializerContext();
    initializerContextMock.config.get = jest.fn().mockReturnValue({
      query_assist: {
        enabled: false,
      },
      summarize: {
        enabled: false,
      },
    });
    const coreSetupContract = coreMock.createSetup();
    let updater$ = new BehaviorSubject<() => {}>(() => ({}));
    const coreSetup = {
      ...coreSetupContract,
      application: {
        ...coreSetupContract.application,
        register: jest.fn((args) => {
          if (args.updater$) {
            updater$ = args.updater$;
          }
        }),
      },
    };
    const observabilityPlugin = new ObservabilityPlugin(initializerContextMock);
    coreSetup.chrome.navGroup.getNavGroupEnabled.mockReturnValue(true);
    coreSetup.uiSettings.get = jest.fn().mockReturnValue(true);
    await observabilityPlugin.setup(coreSetup, ({
      investigationDashboards: {},
      embeddable: embeddablePluginMock.createSetupContract(),
      visualizations: visualizationsPluginMock.createSetupContract(),
      data: dataPluginMock.createSetupContract(),
      uiActions: uiActionsPluginMock.createSetupContract(),
      dataSource: {},
      dataSourceManagement: undefined,
      contentManagement: contentManagementPluginMocks.createSetupContract(),
      dashboard: {
        registerDashboardProvider: jest.fn(),
      },
    } as unknown) as SetupDependencies);

    expect(coreSetup.application.register).toBeCalled();
    expect(coreSetup.chrome.navGroup.addNavLinksToGroup).toBeCalled();

    const coreStart = coreMock.createStart();

    observabilityPlugin.start(
      {
        ...coreStart,
        application: {
          ...coreStart.application,
          capabilities: {
            ...coreStart.application.capabilities,
            investigation: {
              enabled: true,
            },
          },
        },
      },
      ({
        data: dataPluginMock.createStartContract(),
      } as unknown) as AppPluginStartDependencies
    );

    expect(updater$.getValue()()).toEqual({
      navLinkStatus: AppNavLinkStatus.hidden,
    });
  });
});

describe('#setup with APM enabled', () => {
  it('should register both APM applications when MDS and APM are enabled', async () => {
    const intializerContextMock = coreMock.createPluginInitializerContext();
    const coreSetup = coreMock.createSetup();
    const observabilityPlugin = new ObservabilityPlugin(intializerContextMock);

    coreSetup.chrome.navGroup.getNavGroupEnabled.mockReturnValue(true);
    coreSetup.uiSettings.get = jest.fn().mockReturnValue(true); // APM enabled

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
    coreSetup.uiSettings.get = jest.fn().mockReturnValue(false); // APM disabled

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

  it('should register both APM and Trace Analytics apps when APM setting enabled (visibility controlled by capability in start)', async () => {
    const intializerContextMock = coreMock.createPluginInitializerContext();
    const coreSetup = coreMock.createSetup();
    const observabilityPlugin = new ObservabilityPlugin(intializerContextMock);

    coreSetup.chrome.navGroup.getNavGroupEnabled.mockReturnValue(true);
    coreSetup.uiSettings.get = jest.fn().mockReturnValue(true); // APM enabled

    await observabilityPlugin.setup(coreSetup, ({
      embeddable: embeddablePluginMock.createSetupContract(),
      visualizations: visualizationsPluginMock.createSetupContract(),
      data: dataPluginMock.createSetupContract(),
      uiActions: uiActionsPluginMock.createSetupContract(),
      // dataSource: undefined, // MDS status no longer affects registration
      contentManagement: contentManagementPluginMocks.createSetupContract(),
      dashboard: { registerDashboardProvider: jest.fn() },
    } as unknown) as SetupDependencies);

    const registerCalls = (coreSetup.application.register as jest.Mock).mock.calls;
    // Both APM and Trace Analytics apps should be registered
    const tracesApp = registerCalls.find((call) => call[0].id === 'observability-traces-nav');
    expect(tracesApp).toBeDefined();

    const apmApp = registerCalls.find((call) => call[0].id === 'observability-apm-services');
    expect(apmApp).toBeDefined();
  });

  it('should hide APM apps when explore.discoverTracesEnabled is false in start()', async () => {
    const initializerContextMock = coreMock.createPluginInitializerContext();
    initializerContextMock.config.get = jest.fn().mockReturnValue({
      query_assist: { enabled: false },
      summarize: { enabled: false },
    });
    const coreSetup = coreMock.createSetup();
    let apmUpdater$ = new BehaviorSubject<() => {}>(() => ({}));
    coreSetup.application.register = jest.fn((args) => {
      if (args.id === 'observability-apm-services' && args.updater$) {
        apmUpdater$ = args.updater$;
      }
    });
    const observabilityPlugin = new ObservabilityPlugin(initializerContextMock);

    coreSetup.chrome.navGroup.getNavGroupEnabled.mockReturnValue(true);
    coreSetup.uiSettings.get = jest.fn().mockReturnValue(true); // APM enabled

    await observabilityPlugin.setup(coreSetup, ({
      embeddable: embeddablePluginMock.createSetupContract(),
      visualizations: visualizationsPluginMock.createSetupContract(),
      data: dataPluginMock.createSetupContract(),
      uiActions: uiActionsPluginMock.createSetupContract(),
      contentManagement: contentManagementPluginMocks.createSetupContract(),
      dashboard: { registerDashboardProvider: jest.fn() },
    } as unknown) as SetupDependencies);

    const coreStart = coreMock.createStart();
    const dataStartMock = dataPluginMock.createStartContract();
    // Mock registerDataSourceType to avoid "already registered" error
    dataStartMock.dataSources.dataSourceFactory.registerDataSourceType = jest.fn();
    observabilityPlugin.start(
      {
        ...coreStart,
        application: {
          ...coreStart.application,
          capabilities: {
            ...coreStart.application.capabilities,
            explore: {
              discoverTracesEnabled: false, // Traces capability disabled
            },
          },
        },
      },
      ({
        data: dataStartMock,
      } as unknown) as AppPluginStartDependencies
    );

    // APM apps should be hidden when discoverTracesEnabled is false
    expect(apmUpdater$.getValue()()).toEqual({
      navLinkStatus: AppNavLinkStatus.hidden,
    });
  });

  it('should hide Trace Analytics apps when explore.discoverTracesEnabled is true in start()', async () => {
    const initializerContextMock = coreMock.createPluginInitializerContext();
    initializerContextMock.config.get = jest.fn().mockReturnValue({
      query_assist: { enabled: false },
      summarize: { enabled: false },
    });
    const coreSetup = coreMock.createSetup();
    let traceAnalyticsUpdater$ = new BehaviorSubject<() => {}>(() => ({}));
    coreSetup.application.register = jest.fn((args) => {
      if (args.id === 'observability-traces-nav' && args.updater$) {
        traceAnalyticsUpdater$ = args.updater$;
      }
    });
    const observabilityPlugin = new ObservabilityPlugin(initializerContextMock);

    coreSetup.chrome.navGroup.getNavGroupEnabled.mockReturnValue(true);
    coreSetup.uiSettings.get = jest.fn().mockReturnValue(true); // APM enabled

    await observabilityPlugin.setup(coreSetup, ({
      embeddable: embeddablePluginMock.createSetupContract(),
      visualizations: visualizationsPluginMock.createSetupContract(),
      data: dataPluginMock.createSetupContract(),
      uiActions: uiActionsPluginMock.createSetupContract(),
      contentManagement: contentManagementPluginMocks.createSetupContract(),
      dashboard: { registerDashboardProvider: jest.fn() },
    } as unknown) as SetupDependencies);

    const coreStart = coreMock.createStart();
    const dataStartMock = dataPluginMock.createStartContract();
    // Mock registerDataSourceType to avoid "already registered" error
    dataStartMock.dataSources.dataSourceFactory.registerDataSourceType = jest.fn();
    observabilityPlugin.start(
      {
        ...coreStart,
        application: {
          ...coreStart.application,
          capabilities: {
            ...coreStart.application.capabilities,
            explore: {
              discoverTracesEnabled: true, // Traces capability enabled
            },
          },
        },
      },
      ({
        data: dataStartMock,
      } as unknown) as AppPluginStartDependencies
    );

    // Trace Analytics apps should be hidden when discoverTracesEnabled is true
    expect(traceAnalyticsUpdater$.getValue()()).toEqual({
      navLinkStatus: AppNavLinkStatus.hidden,
    });
  });
});
