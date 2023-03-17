/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import { EuiFlexItem, EuiPage, EuiPageBody, EuiSpacer, EuiSwitch } from '@elastic/eui';
import _ from 'lodash';
import React, { ReactElement, useEffect, useState } from 'react';
import { AppAnalyticsComponentDeps } from '../home';
import { ApplicationType } from '../../../../common/types/application_analytics';
import { IntegrationHeader } from './integration_header';
import { AvailableIntegrationsTable } from './available_integration_table';
import { AddedIntegrationsTable } from './added_integration_table';
import { AvailableIntegrationsCardView } from './available_integration_card_view';

interface AppTableProps extends AppAnalyticsComponentDeps {
  loading: boolean;
  applications: ApplicationType[];
  fetchApplications: () => void;
  renameApplication: (newAppName: string, appId: string) => void;
  deleteApplication: (appList: string[], panelIdList: string[], toastMessage?: string) => void;
  clearStorage: () => void;
  moveToApp: (id: string, type: string) => void;
}

interface AvailableIntegrationType {
  name: string;
  description: string;
  status: string;
  assetUrl?: string | undefined;
}

export interface AvailableIntegrationsTableProps {
  loading: boolean;
  data: AvailableIntegrationType[];
}

export interface AvailableIntegrationsCardViewProps {
  data: AvailableIntegrationType[];
}

export function AvailableIntegrationOverviewPage(props: AppTableProps) {
  const { chrome, parentBreadcrumbs } = props;

  const [isCardView, setCardView] = useState(true);

  const data: AvailableIntegrationType[] = [
    {
      name: 'nginx',
      description:
        'Open-source, high-performance HTTP server and reverse proxy, as well as an IMAP/POP3 proxy server',
      status: 'Available',
      assetUrl: 'https://www.shareicon.net/data/256x256/2017/06/28/888041_logo_512x512.png',
    },
    {
      name: 'nginx',
      description:
        'Open-source, high-performance HTTP server and reverse proxy, as well as an IMAP/POP3 proxy server',
      status: 'Available',
      assetUrl: 'https://www.shareicon.net/data/256x256/2017/06/28/888041_logo_512x512.png',
    },
    {
      name: 'nginx',
      description:
        'Open-source, high-performance HTTP server and reverse proxy, as well as an IMAP/POP3 proxy server',
      status: 'Available',
      assetUrl: 'https://www.shareicon.net/data/256x256/2017/06/28/888041_logo_512x512.png',
    },
    {
      name: 'nginx',
      description:
        'Open-source, high-performance HTTP server and reverse proxy, as well as an IMAP/POP3 proxy server',
      status: 'Available',
      assetUrl: 'https://www.shareicon.net/data/256x256/2017/06/28/888041_logo_512x512.png',
    },
    {
      name: 'nginx',
      description:
        'Open-source, high-performance HTTP server and reverse proxy, as well as an IMAP/POP3 proxy server',
      status: 'Available',
      assetUrl: 'https://www.shareicon.net/data/256x256/2017/06/28/888041_logo_512x512.png',
    },
    {
      name: 'nginx',
      description:
        'Open-source, high-performance HTTP server and reverse proxy, as well as an IMAP/POP3 proxy server',
      status: 'Available',
      assetUrl: 'https://www.shareicon.net/data/256x256/2017/06/28/888041_logo_512x512.png',
    },
  ];

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
        <EuiFlexItem grow={false} style={{ marginBottom: 20 }}>
          <EuiSwitch
            label="Card View"
            checked={isCardView}
            onChange={() => {
              setCardView(!isCardView);
            }}
          />
        </EuiFlexItem>
        {isCardView
          ? AvailableIntegrationsCardView({ data })
          : AvailableIntegrationsTable({ loading: false, data })}
      </EuiPageBody>
    </EuiPage>
  );
}
