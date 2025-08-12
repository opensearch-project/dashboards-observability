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
  it('should not register notebook application and call add notebook into nav group when investigation plugin present', () => {
    const intializerContextMock = coreMock.createPluginInitializerContext();
    const coreSetup = coreMock.createSetup();
    const observabilityPlugin = new ObservabilityPlugin(intializerContextMock);
    coreSetup.chrome.navGroup.getNavGroupEnabled.mockReturnValue(true);
    observabilityPlugin.setup(coreSetup, ({
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
