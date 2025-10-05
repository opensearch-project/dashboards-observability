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
    observabilityPlugin.setup(coreSetup, ({
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
