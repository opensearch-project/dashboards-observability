/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import { EuiOverlayMask, EuiPage, EuiPageBody, EuiSpacer, EuiTab, EuiTabs } from '@elastic/eui';
import _ from 'lodash';
import React, { useEffect, useState } from 'react';
import { StringRegexOptions } from 'joi';
import { IntegrationHeader } from './integration_header';
import { AvailableIntegrationsTable } from './available_integration_table';
import { AvailableIntegrationsCardView } from './available_integration_card_view';
import { INTEGRATIONS_BASE } from '../../../../common/constants/shared';
import { getAddIntegrationModal } from './add_integration_modal';
import { AvailableIntegrationOverviewPageProps } from './integration_types';
import { useToast } from '../../../../public/components/common/toast';

export interface AvailableIntegrationType {
  name: string;
  description: string;
  assetUrl?: string | undefined;
  version?: string | undefined;
  displayName?: string;
  integrationType: string;
  statics: any;
  components: any[];
  displayAssets: any[];
}

export interface AvailableIntegrationsTableProps {
  loading: boolean;
  data: AvailableIntegrationsList;
  showModal: (input: string) => void;
  isCardView: boolean;
  setCardView: (input: boolean) => void;
}

export interface AvailableIntegrationsList {
  hits: AvailableIntegrationType[];
}

export interface AvailableIntegrationsCardViewProps {
  data: AvailableIntegrationsList;
  showModal: (input: string) => void;
  isCardView: boolean;
  setCardView: (input: boolean) => void;
  query: string;
  setQuery: (input: string) => void;
}

export function AvailableIntegrationOverviewPage(props: AvailableIntegrationOverviewPageProps) {
  const { chrome, http } = props;

  const [query, setQuery] = useState('');
  const [isCardView, setCardView] = useState(true);
  const { setToast } = useToast();
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

  async function addIntegrationRequest(name: string) {
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
      <EuiPageBody component="div">
        {IntegrationHeader()}
        {isCardView
          ? AvailableIntegrationsCardView({
              data,
              showModal: getModal,
              isCardView,
              setCardView,
              query,
              setQuery,
            })
          : AvailableIntegrationsTable({
              loading: false,
              data,
              showModal: getModal,
              isCardView,
              setCardView,
            })}
      </EuiPageBody>
      {isModalVisible && modalLayout}
    </EuiPage>
  );
}
