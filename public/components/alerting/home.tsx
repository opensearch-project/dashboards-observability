/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { HashRouter, Route } from 'react-router-dom';
import { coreRefs } from '../../framework/core_refs';
import { AlarmsPage } from './alarms_page';
import { AlarmsApiClient } from './services/alarms_client';

export const AlertingHome = () => {
  const http = coreRefs.http;
  const apiClient = useMemo(() => (http ? new AlarmsApiClient(http) : null), [http]);

  if (!apiClient) return null;

  return (
    <HashRouter>
      <Route render={() => <AlarmsPage apiClient={apiClient} />} />
    </HashRouter>
  );
};
