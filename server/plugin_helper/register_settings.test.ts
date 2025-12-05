/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { UiSettingsServiceSetup } from '../../../../../src/core/server/ui_settings';
import { registerObservabilityUISettings } from './register_settings';
import { APM_ENABLED_SETTING } from '../../common/constants/apm';

describe('registerObservabilityUISettings', () => {
  let mockUiSettings: jest.Mocked<UiSettingsServiceSetup>;

  beforeEach(() => {
    mockUiSettings = {
      register: jest.fn(),
    } as any;
  });

  it('should register APM setting with default true', () => {
    registerObservabilityUISettings(mockUiSettings);

    const calls = (mockUiSettings.register as jest.Mock).mock.calls;
    const apmSettingCall = calls.find((call) => call[0][APM_ENABLED_SETTING]);

    expect(apmSettingCall).toBeDefined();
    expect(apmSettingCall[0][APM_ENABLED_SETTING]).toMatchObject({
      value: true,
      category: ['Observability'],
      requiresPageReload: true,
    });
  });

  it('should have description mentioning MDS requirement', () => {
    registerObservabilityUISettings(mockUiSettings);

    const calls = (mockUiSettings.register as jest.Mock).mock.calls;
    const apmSettingCall = calls.find((call) => call[0][APM_ENABLED_SETTING]);
    const description = apmSettingCall[0][APM_ENABLED_SETTING].description;

    expect(description).toContain('Multi Data Source');
  });
});
