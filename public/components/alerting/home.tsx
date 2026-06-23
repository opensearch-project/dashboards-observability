/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo } from 'react';
import { HashRouter, Route } from 'react-router-dom';
import { i18n } from '@osd/i18n';
import { coreRefs } from '../../framework/core_refs';
import {
  ALERT_MANAGER_DEFAULT_DATASOURCES_SETTING,
  ALERT_MANAGER_MAX_DATASOURCES_DEFAULT,
  ALERT_MANAGER_MAX_DATASOURCES_LIMIT,
  ALERT_MANAGER_MAX_DATASOURCES_SETTING,
} from '../../../common/constants/alerting_settings';
import { AlarmsPage } from './alarms_page';
import { useDatasources } from './hooks/use_datasources';

export const AlertingHome = () => {
  const { datasources, isLoading: datasourcesLoading } = useDatasources();

  const { defaultDatasources, maxDatasources } = useMemo(() => {
    const uiSettings = coreRefs.core?.uiSettings;
    const rawDefaults = uiSettings?.get<unknown[]>(ALERT_MANAGER_DEFAULT_DATASOURCES_SETTING, []);
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

  return (
    <HashRouter>
      <Route
        render={() => (
          <AlarmsPage
            datasources={datasources}
            datasourcesLoading={datasourcesLoading}
            defaultDatasources={defaultDatasources}
            maxDatasources={maxDatasources}
          />
        )}
      />
    </HashRouter>
  );
};
