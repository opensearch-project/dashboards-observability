/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import {
  EuiFlexItem,
  EuiOverlayMask,
  EuiPage,
  EuiPageBody,
  EuiSpacer,
  EuiSwitch,
} from '@elastic/eui';
import _ from 'lodash';
import React, { ReactElement, useEffect, useState } from 'react';
import { AppAnalyticsComponentDeps } from '../home';
import { ApplicationType } from '../../../../common/types/application_analytics';
import { IntegrationHeader } from './integration_header';
import { AvailableIntegrationsTable } from './available_integration_table';
import { AddedIntegrationsTable } from './added_integration_table';
import { AvailableIntegrationsCardView } from './available_integration_card_view';
import { OBSERVABILITY_BASE } from '../../../../common/constants/shared';
import { getAddIntegrationModal } from './add_integration_modal';

interface AppTableProps extends AppAnalyticsComponentDeps {
  loading: boolean;
  applications: ApplicationType[];
  fetchApplications: () => void;
  renameApplication: (newAppName: string, appId: string) => void;
  deleteApplication: (appList: string[], panelIdList: string[], toastMessage?: string) => void;
  clearStorage: () => void;
  moveToApp: (id: string, type: string) => void;
}

export interface AvailableIntegrationType {
  templateName: string;
  description: string;
  status: string;
  assetUrl?: string | undefined;
}

export interface AvailableIntegrationsTableProps {
  loading: boolean;
  data: AvailableIntegrationsList;
  records: number;
  showModal: () => void;
}

export interface AvailableIntegrationsList {
  data: AvailableIntegrationType[];
}

export interface AvailableIntegrationsCardViewProps {
  data: AvailableIntegrationsList;
  records: number;
  showModal: () => void;
}

export function AvailableIntegrationOverviewPage(props: AppTableProps) {
  const { chrome, parentBreadcrumbs, http } = props;

  const [isCardView, setCardView] = useState(true);
  const [data, setData] = useState<AvailableIntegrationsList>({ data: [] });

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalLayout, setModalLayout] = useState(<EuiOverlayMask />);

  const getModal = () => {
    setModalLayout(
      getAddIntegrationModal(
        () => {},
        () => {
          setIsModalVisible(false);
        },
        'Name',
        'Add Integration Options',
        'Cancel',
        'Create',
        'test'
      )
    );
    setIsModalVisible(true);
  };

  // const data: AvailableIntegrationType[] = [
  //   {
  //     name: 'nginx',
  //     description:
  //       'Open-source, high-performance HTTP server and reverse proxy, as well as an IMAP/POP3 proxy server',
  //     status: 'Available',
  //     assetUrl: 'https://www.shareicon.net/data/256x256/2017/06/28/888041_logo_512x512.png',
  //   },
  //   {
  //     name: 'nginx',
  //     description:
  //       'Open-source, high-performance HTTP server and reverse proxy, as well as an IMAP/POP3 proxy server',
  //     status: 'Available',
  //     assetUrl: 'https://www.shareicon.net/data/256x256/2017/06/28/888041_logo_512x512.png',
  //   },
  //   {
  //     name: 'nginx',
  //     description:
  //       'Open-source, high-performance HTTP server and reverse proxy, as well as an IMAP/POP3 proxy server',
  //     status: 'Available',
  //     assetUrl: 'https://www.shareicon.net/data/256x256/2017/06/28/888041_logo_512x512.png',
  //   },
  //   {
  //     name: 'nginx',
  //     description:
  //       'Open-source, high-performance HTTP server and reverse proxy, as well as an IMAP/POP3 proxy server',
  //     status: 'Available',
  //     assetUrl: 'https://www.shareicon.net/data/256x256/2017/06/28/888041_logo_512x512.png',
  //   },
  //   {
  //     name: 'nginx',
  //     description:
  //       'Open-source, high-performance HTTP server and reverse proxy, as well as an IMAP/POP3 proxy server',
  //     status: 'Available',
  //     assetUrl: 'https://www.shareicon.net/data/256x256/2017/06/28/888041_logo_512x512.png',
  //   },
  //   {
  //     name: 'nginx',
  //     description:
  //       'Open-source, high-performance HTTP server and reverse proxy, as well as an IMAP/POP3 proxy server',
  //     status: 'Available',
  //     assetUrl: 'https://www.shareicon.net/data/256x256/2017/06/28/888041_logo_512x512.png',
  //   },
  // ];

  useEffect(() => {
    chrome.setBreadcrumbs([
      ...parentBreadcrumbs,
      {
        text: 'Placeholder',
        href: '#/placeholder',
      },
    ]);
    handleDataRequest();
  }, []);

  async function handleDataRequest() {
    http.get(`${OBSERVABILITY_BASE}/repository`).then((exists) => setData(exists));
  }

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
          ? AvailableIntegrationsCardView({ data, records: 6, showModal: getModal })
          : AvailableIntegrationsTable({ loading: false, data, records: 6, showModal: getModal })}
      </EuiPageBody>
      {isModalVisible && modalLayout}
    </EuiPage>
  );
}
