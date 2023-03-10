/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import { EuiPage, EuiPageBody, EuiSpacer } from '@elastic/eui';
import _ from 'lodash';
import React, { ReactElement, useEffect, useState } from 'react';
import { AppAnalyticsComponentDeps } from '../home';
import { ApplicationType } from '../../../../common/types/application_analytics';
import { IntegrationHeader } from './integration_header';
import { AvailableIntegrationsTable } from './available_integration_table';
import { AddedIntegrationsTable } from './added_integration_table';

interface AppTableProps extends AppAnalyticsComponentDeps {
  loading: boolean;
  applications: ApplicationType[];
  fetchApplications: () => void;
  renameApplication: (newAppName: string, appId: string) => void;
  deleteApplication: (appList: string[], panelIdList: string[], toastMessage?: string) => void;
  clearStorage: () => void;
  moveToApp: (id: string, type: string) => void;
}

export function AvailableIntegrationOverviewPage(props: AppTableProps) {
  const { chrome, parentBreadcrumbs } = props;

  useEffect(() => {
    chrome.setBreadcrumbs([
      ...parentBreadcrumbs,
      {
        text: 'Placeholder',
        href: '#/placeholder',
      },
    ]);
  }, []);

  return (
    <EuiPage>
      <EuiPageBody component="div">
        {IntegrationHeader()}
        {AvailableIntegrationsTable({loading: false})}
      </EuiPageBody>
    </EuiPage>
  );
}
