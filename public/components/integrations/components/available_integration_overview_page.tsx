/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import {
  EuiFlexItem,
  EuiGlobalToastList,
  EuiOverlayMask,
  EuiPage,
  EuiPageBody,
  EuiSwitch,
} from '@elastic/eui';
import _ from 'lodash';
import React, { ReactChild, useEffect, useState } from 'react';
import { Toast } from '@elastic/eui/src/components/toast/global_toast_list';
import { IntegrationHeader } from './integration_header';
import { AvailableIntegrationsTable } from './available_integration_table';
import { AvailableIntegrationsCardView } from './available_integration_card_view';
import { INTEGRATIONS_BASE } from '../../../../common/constants/shared';
import { getAddIntegrationModal } from './add_integration_modal';
import { AvailableIntegrationOverviewPageProps } from './integration_types';

export interface AvailableIntegrationType {
  name: string;
  description: string;
  assetUrl?: string | undefined;
  version?: string | undefined;
  integrationType: string;
  statics: any;
  components: any[];
  displayAssets: any[];
}

export interface AvailableIntegrationsTableProps {
  loading: boolean;
  data: AvailableIntegrationsList;
  showModal: (input: string) => void;
}

export interface AvailableIntegrationsList {
  hits: AvailableIntegrationType[];
}

export interface AvailableIntegrationsCardViewProps {
  data: AvailableIntegrationsList;
  showModal: (input: string) => void;
}

export function AvailableIntegrationOverviewPage(props: AvailableIntegrationOverviewPageProps) {
  const { chrome, parentBreadcrumbs, http } = props;

  const [isCardView, setCardView] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [data, setData] = useState<AvailableIntegrationsList>({ hits: [] });

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalLayout, setModalLayout] = useState(<EuiOverlayMask />);

  const getModal = (name: string) => {
    setModalLayout(
      getAddIntegrationModal(
        () => {
          addIntegrationRequest(name);
          setIsModalVisible(false);
        },
        () => {
          setIsModalVisible(false);
        },
        'Name',
        'Namespace',
        'Tags (optional)',
        name,
        'prod',
        'Add Integration Options',
        'Cancel',
        'Add',
        'test'
      )
    );
    setIsModalVisible(true);
  };

  useEffect(() => {
    chrome.setBreadcrumbs([
      ...parentBreadcrumbs,
      {
        text: 'Integrations',
        href: '#/',
      },
    ]);
    handleDataRequest();
  }, []);

  async function handleDataRequest() {
    http.get(`${INTEGRATIONS_BASE}/repository`).then((exists) => setData(exists.data));
  }

  const setToast = (title: string, color = 'success', text?: ReactChild) => {
    if (!text) text = '';
    setToasts([...toasts, { id: new Date().toISOString(), title, text, color } as Toast]);
  };

  async function addIntegrationRequest(name: string) {
    console.log('name', name);
    http
      .post(`${INTEGRATIONS_BASE}/store`)
      .then((res) => {
        setToast(
          `${name} integration successfully added!`,
          'success',
          `View the added assets from ${name} in the Added Integrations list`
        );
      })
      .catch((err) =>
        setToast(
          'Failed to load integration. Check Added Integrations table for more details',
          'danger'
        )
      );
  }

  return (
    <EuiPage>
      <EuiGlobalToastList
        toasts={toasts}
        dismissToast={(removedToast) => {
          setToasts(toasts.filter((toast) => toast.id !== removedToast.id));
        }}
        toastLifeTimeMs={6000}
      />
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
          ? AvailableIntegrationsCardView({ data, showModal: getModal })
          : AvailableIntegrationsTable({ loading: false, data, showModal: getModal })}
      </EuiPageBody>
      {isModalVisible && modalLayout}
    </EuiPage>
  );
}
