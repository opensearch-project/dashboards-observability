/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { UiSettingsServiceSetup } from '../../../../../src/core/server/ui_settings';
import { registerObservabilityUISettings } from './register_settings';
import { APM_ENABLED_SETTING } from '../../common/constants/apm';
import {
  ALERT_MANAGER_ENABLED_SETTING,
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
    const findSetting = (key: string) => {
      registerObservabilityUISettings(mockUiSettings);
      const calls = (mockUiSettings.register as jest.Mock).mock.calls;
      const match = calls.find((call) => call[0][key]);
      return match?.[0][key];
    };

    it('registers alertManagerEnabled with value false, requiresPageReload, and Observability category', () => {
      const setting = findSetting(ALERT_MANAGER_ENABLED_SETTING);
      expect(setting).toMatchObject({
        value: false,
        requiresPageReload: true,
        category: ['Observability'],
      });
    });

    it('alertManagerEnabled description contains Experimental marker', () => {
      const setting = findSetting(ALERT_MANAGER_ENABLED_SETTING);
      expect(setting.description).toContain('<em>[Experimental]</em>');
    });

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
