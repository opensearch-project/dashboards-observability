/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import { NOTEBOOK_SAVED_OBJECT } from '../common/types/observability_saved_object_attributes';
import { coreMock } from '../../../src/core/server/mocks';
import { ObservabilityPlugin, ObservabilityPluginSetupDependencies } from './plugin';

describe('#setup', () => {
  it('should not register notebook saved object when investigation plugin present', () => {
    const intializerContextMock = coreMock.createPluginInitializerContext();
    const coreSetup = coreMock.createSetup();
    const observabilityPlugin = new ObservabilityPlugin(intializerContextMock);
    observabilityPlugin.setup(coreSetup, {
      investigationDashboards: {},
      dataSource: ({
        registerCustomApiSchema: jest.fn(),
      } as unknown) as ObservabilityPluginSetupDependencies,
    });
    expect(coreSetup.savedObjects.registerType).not.toBeCalledWith(
      expect.objectContaining({
        type: NOTEBOOK_SAVED_OBJECT,
      })
    );
  });
});
