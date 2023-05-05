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
import { INTEGRATIONS_BASE, OBSERVABILITY_BASE } from '../../../../common/constants/shared';

export interface AppTableProps extends AppAnalyticsComponentDeps {
  loading: boolean;
  applications: ApplicationType[];
  fetchApplications: () => void;
  renameApplication: (newAppName: string, appId: string) => void;
  deleteApplication: (appList: string[], panelIdList: string[], toastMessage?: string) => void;
  clearStorage: () => void;
  moveToApp: (id: string, type: string) => void;
}

export interface AddedIntegrationsTableProps {
  loading: boolean;
  data: AddedIntegrationsList;
}

export interface AddedIntegrationsList {
  data: AddedIntegrationType[];
}

export interface AddedIntegrationType {
  dashboardUrl: string;
}

export function AddedIntegrationOverviewPage(props: AppTableProps) {
  const { chrome, parentBreadcrumbs, http } = props;

  const [data, setData] = useState<AddedIntegrationsList>({ data: [] });

  useEffect(() => {
    chrome.setBreadcrumbs([
      ...parentBreadcrumbs,
      {
        text: 'Placeholder',
        href: '#/placeholder',
      },
      {
        text: 'Added Integrations',
        href: '#/placeholder/added',
      }
    ]);
    handleDataRequest();
  }, []);

  async function handleDataRequest() {
    http.get(`${INTEGRATIONS_BASE}/store/list_added`).then((exists) => setData(exists));
  }

  return (
    <EuiPage>
      <EuiPageBody component="div">
        {IntegrationHeader()}
        {AddedIntegrationsTable({ data, loading: false })}
      </EuiPageBody>
    </EuiPage>
  );
}
