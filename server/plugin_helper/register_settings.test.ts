/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { UiSettingsServiceSetup } from '../../../../../src/core/server/ui_settings';
import { registerObservabilityUISettings } from './register_settings';
import { APM_ENABLED_SETTING } from '../../common/constants/apm';
import {
  ALERT_MANAGER_MAX_DATASOURCES_SETTING,
  ALERT_MANAGER_MAX_DATASOURCES_DEFAULT,
  ALERT_MANAGER_DEFAULT_DATASOURCES_SETTING,
} from '../../common/constants/alerting_settings';

describe('registerObservabilityUISettings', () => {
  let mockUiSettings: jest.Mocked<UiSettingsServiceSetup>;

  beforeEach(() => {
    mockUiSettings = ({
      register: jest.fn(),
    } as unknown) as jest.Mocked<UiSettingsServiceSetup>;
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

  it('should have description mentioning Discover Traces requirement', () => {
    registerObservabilityUISettings(mockUiSettings);

    const calls = (mockUiSettings.register as jest.Mock).mock.calls;
    const apmSettingCall = calls.find((call) => call[0][APM_ENABLED_SETTING]);
    const description = apmSettingCall[0][APM_ENABLED_SETTING].description;

    expect(description).toContain('Discover Traces');
  });

  describe('Alert Manager settings', () => {
    // After the move to dynamic feature flags, registration is
    // unconditional — the alerting nav UI is gated by the dynamic
    // capability instead of yml. The settings always register so they're
    // available the moment the dynamic flag flips on.
    const findSetting = (key: string) => {
      registerObservabilityUISettings(mockUiSettings);
      const calls = (mockUiSettings.register as jest.Mock).mock.calls;
      const match = calls.find((call) => call[0][key]);
      return match?.[0][key];
    };

    it('registers alertManagerMaxDatasources with default value 5', () => {
      const setting = findSetting(ALERT_MANAGER_MAX_DATASOURCES_SETTING);
      expect(setting.value).toBe(ALERT_MANAGER_MAX_DATASOURCES_DEFAULT);
      expect(setting.value).toBe(5);
    });

    it('registers alertManagerSelectedDatasources with empty array default', () => {
      const setting = findSetting(ALERT_MANAGER_DEFAULT_DATASOURCES_SETTING);
      expect(setting.value).toEqual([]);
    });
  });
});
