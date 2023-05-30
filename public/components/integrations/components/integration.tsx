/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import {
  EuiGlobalToastList,
  EuiLoadingSpinner,
  EuiOverlayMask,
  EuiPage,
  EuiPageBody,
  EuiSpacer,
} from '@elastic/eui';
import React, { ReactChild, useEffect, useState } from 'react';
import { last } from 'lodash';
import { Toast } from '@elastic/eui/src/components/toast/global_toast_list';
import { IntegrationOverview } from './integration_overview_panel';
import { IntegrationDetails } from './integration_details_panel';
import { IntegrationFields } from './integration_fields_panel';
import { IntegrationAssets } from './integration_assets_panel';
import { getAddIntegrationModal } from './add_integration_modal';
import { AvailableIntegrationProps } from './integration_types';
import { INTEGRATIONS_BASE } from '../../../../common/constants/shared';

export function Integration(props: AvailableIntegrationProps) {
  const { http, integrationTemplateId, chrome, parentBreadcrumbs } = props;

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalLayout, setModalLayout] = useState(<EuiOverlayMask />);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [data, setData] = useState({
    data: null,
  });

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
      {
        text: integrationTemplateId,
        href: `${last(parentBreadcrumbs)!.href}integrations/${integrationTemplateId}`,
      },
    ]);
    handleDataRequest();
  }, [integrationTemplateId]);

  async function handleDataRequest() {
    // TODO fill in ID request here
    http.get(`${INTEGRATIONS_BASE}/repository/nginx`).then((exists) => {
      setData(exists.data);
    });
  }

  const setToast = (title: string, color = 'success', text?: ReactChild) => {
    if (!text) text = '';
    setToasts([...toasts, { id: new Date().toISOString(), title, text, color } as Toast]);
  };

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

  if (!data.data) {
    return <EuiLoadingSpinner />;
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
      <EuiPageBody>
        <EuiSpacer size="xl" />
        {IntegrationOverview({ data, getModal })}
        <EuiSpacer />
        {IntegrationDetails({ data })}
        <EuiSpacer />
        {IntegrationAssets({ data })}
        <EuiSpacer />
        {IntegrationFields({ data })}
        <EuiSpacer />
      </EuiPageBody>
      {isModalVisible && modalLayout}
    </EuiPage>
  );
}
