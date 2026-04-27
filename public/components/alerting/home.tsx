/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo } from 'react';
import { HashRouter, Route } from 'react-router-dom';
import { coreRefs } from '../../framework/core_refs';
import {
  ALERT_MANAGER_DEFAULT_DATASOURCES_SETTING,
  ALERT_MANAGER_MAX_DATASOURCES_DEFAULT,
  ALERT_MANAGER_MAX_DATASOURCES_LIMIT,
  ALERT_MANAGER_MAX_DATASOURCES_SETTING,
} from '../../../common/constants/alerting_settings';
import { AlarmsPage } from './alarms_page';
import { AlarmsApiClient } from './services/alarms_client';

export const AlertingHome = () => {
  const http = coreRefs.http;
  const apiClient = useMemo(() => (http ? new AlarmsApiClient(http) : null), [http]);

  // Show a "Beta" badge in the top chrome bar while the Alert Manager app is
  // mounted; clear it on unmount so it doesn't leak into other apps.
  useEffect(() => {
    const chrome = coreRefs.chrome;
    if (!chrome?.setBadge) return undefined;
    chrome.setBadge({
      text: 'Beta',
      tooltip:
        'Alert Manager is in beta. Features may change and some functionality is still evolving.',
      iconType: 'beaker',
    });
    return () => {
      chrome.setBadge?.(undefined);
    };
  }, []);

  const { defaultDatasources, maxDatasources } = useMemo(() => {
    const uiSettings = coreRefs.core?.uiSettings;
    const rawDefaults = uiSettings?.get(ALERT_MANAGER_DEFAULT_DATASOURCES_SETTING, []);
    const defaults = Array.isArray(rawDefaults)
      ? rawDefaults.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      : [];
    const rawMax = uiSettings?.get(
      ALERT_MANAGER_MAX_DATASOURCES_SETTING,
      ALERT_MANAGER_MAX_DATASOURCES_DEFAULT
    );
    const parsedMax =
      typeof rawMax === 'number' && Number.isFinite(rawMax)
        ? Math.floor(rawMax)
        : ALERT_MANAGER_MAX_DATASOURCES_DEFAULT;
    // Clamp to the same [1, LIMIT] range the server enforces, in case the stored
    // setting was written before the schema cap existed.
    const clamped = Math.max(1, Math.min(parsedMax, ALERT_MANAGER_MAX_DATASOURCES_LIMIT));
    return { defaultDatasources: defaults, maxDatasources: clamped };
  }, []);

  if (!apiClient) return null;

  return (
    <HashRouter>
      <Route
        render={() => (
          <AlarmsPage
            apiClient={apiClient}
            defaultDatasources={defaultDatasources}
            maxDatasources={maxDatasources}
          />
        )}
      />
    </HashRouter>
  );
};
