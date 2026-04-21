/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { HashRouter, Route } from 'react-router-dom';
import { CoreStart } from '../../../../../src/core/public';
import { AlarmsPage } from './alarms_page';
import { AlarmsApiClient } from './services/alarms_client';

interface AlertingHomeProps {
  CoreStartProp: CoreStart;
}

export const AlertingHome = ({ CoreStartProp }: AlertingHomeProps) => {
  const apiClient = useMemo(() => new AlarmsApiClient(CoreStartProp.http), [CoreStartProp.http]);

  return (
    <HashRouter>
      <Route render={() => <AlarmsPage apiClient={apiClient} />} />
    </HashRouter>
  );
};
