/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ALERT_MANAGER_ENABLED_SETTING,
  ALERT_MANAGER_DEFAULT_DATASOURCES_SETTING,
  ALERT_MANAGER_MAX_DATASOURCES_SETTING,
  ALERT_MANAGER_MAX_DATASOURCES_LIMIT,
  ALERT_MANAGER_MAX_DATASOURCES_DEFAULT,
  ALERT_MANAGER_SELECTED_DS_STORAGE_KEY,
} from '../alerting_settings';

describe('alerting_settings constants', () => {
  it('exports expected setting keys', () => {
    expect(ALERT_MANAGER_ENABLED_SETTING).toBe('observability:alertManagerEnabled');
    expect(ALERT_MANAGER_DEFAULT_DATASOURCES_SETTING).toBe(
      'observability:alertManagerSelectedDatasources'
    );
    expect(ALERT_MANAGER_MAX_DATASOURCES_SETTING).toBe('observability:alertManagerMaxDatasources');
  });

  it('max-datasources default is 5 and limit is 20', () => {
    expect(ALERT_MANAGER_MAX_DATASOURCES_DEFAULT).toBe(5);
    expect(ALERT_MANAGER_MAX_DATASOURCES_LIMIT).toBe(20);
  });

  it('localStorage key is correct', () => {
    expect(ALERT_MANAGER_SELECTED_DS_STORAGE_KEY).toBe(
      'observability.alertManager.selectedDatasources'
    );
  });
});
