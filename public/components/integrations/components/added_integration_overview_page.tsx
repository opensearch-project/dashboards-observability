/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import { EuiPage, EuiPageBody } from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { HttpStart } from '../../../../../../src/core/public';
import { INTEGRATIONS_BASE } from '../../../../common/constants/shared';
import { AddedIntegrationsTable } from './added_integration_table';
import { IntegrationHeader } from './integration_header';
import { AddedIntegrationOverviewPageProps } from './integration_types';

export interface AddedIntegrationsTableProps {
  loading: boolean;
  data: AddedIntegrationsList;
  setData: React.Dispatch<React.SetStateAction<AddedIntegrationsList>>;
  http: HttpStart;
  dataSourceEnabled: boolean;
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
  references?: [];
}

export function AddedIntegrationOverviewPage(props: AddedIntegrationOverviewPageProps) {
  const { chrome, http, dataSourceEnabled } = props;

  const [data, setData] = useState<AddedIntegrationsList>({ hits: [] });

  useEffect(() => {
    chrome.setBreadcrumbs([
      {
        text: 'Integrations',
        href: '#/',
      },
    ]);
    handleDataRequest();
  }, []);

  async function handleDataRequest() {
    http.get(`${INTEGRATIONS_BASE}/store`).then((exists) => setData(exists.data));
  }

  return (
    <EuiPage>
      <EuiPageBody component="div">
        {IntegrationHeader()}
        {AddedIntegrationsTable({
          data,
          setData,
          loading: false,
          http,
          dataSourceEnabled,
        })}
      </EuiPageBody>
    </EuiPage>
  );
}
