/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import { EuiPage, EuiPageBody } from '@elastic/eui';
import _ from 'lodash';
import React, { useEffect, useState } from 'react';
import { IntegrationHeader } from './integration_header';
import { AddedIntegrationsTable } from './added_integration_table';
import { INTEGRATIONS_BASE } from '../../../../common/constants/shared';
import { AddedIntegrationOverviewPageProps } from './integration_types';

export interface AddedIntegrationsTableProps {
  loading: boolean;
  data: AddedIntegrationsList;
}

export interface AddedIntegrationsList {
  hits: AddedIntegrationType[];
}

export interface AddedIntegrationType {
  name: string;
  templateName: string;
  dataSource: any;
  creationDate: string;
  status: string;
  assets: any[];
  addedBy: string;
  id: string;
}

export function AddedIntegrationOverviewPage(props: AddedIntegrationOverviewPageProps) {
  const { chrome, parentBreadcrumbs, http } = props;

  const [data, setData] = useState<AddedIntegrationsList>({ hits: [] });

  useEffect(() => {
    chrome.setBreadcrumbs([
      ...parentBreadcrumbs,
      {
        text: 'Integrations',
        href: '#/',
      },
      {
        text: 'Installed Integrations',
        href: '#/installed',
      },
    ]);
    handleDataRequest();
  }, []);

  async function handleDataRequest() {
    http.get(`${INTEGRATIONS_BASE}/store/list_added`).then((exists) => setData(exists.data));
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
