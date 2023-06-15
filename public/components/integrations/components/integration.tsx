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
import { IntegrationScreenshots } from './integration_screenshots_panel';
import { AddIntegrationFlyout } from './add_integration_flyout';

export function Integration(props: AvailableIntegrationProps) {
  const { http, integrationTemplateId, chrome, parentBreadcrumbs } = props;

  const [isFlyoutVisible, setIsFlyoutVisible] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [integration, setIntegration] = useState({});

  const [integrationMapping, setMapping] = useState(null);
  const [integrationAssets, setAssets] = useState([]);

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
    http.get(`${INTEGRATIONS_BASE}/repository/${integrationTemplateId}`).then((exists) => {
      setIntegration(exists.data);
    });
  }

  useEffect(() => {
    if (Object.keys(integration).length === 0) {
      return;
    }
    fetch(`${INTEGRATIONS_BASE}/repository/${integration.name}/schema`)
      .then((response) => response.json())
      .then((parsedResponse) => {
        if (parsedResponse.statusCode && parsedResponse.statusCode !== 200) {
          throw new Error('Request for schema failed: ' + parsedResponse.message);
        }
        return parsedResponse.data.mappings[integration.type];
      })
      .then((mapping) => setMapping(mapping))
      .catch((err: any) => {
        console.error(err.message);
      });
  }, [integration]);

  useEffect(() => {
    if (Object.keys(integration).length === 0) {
      return;
    }
    fetch(`${INTEGRATIONS_BASE}/repository/${integration.name}/assets`)
      .then((response) => response.json())
      .then((parsedResponse) => {
        if (parsedResponse.statusCode && parsedResponse.statusCode !== 200) {
          throw new Error('Request for assets failed: ' + parsedResponse.message);
        }
        return parsedResponse.data;
      })
      .then((assets) => setAssets(assets))
      .catch((err: any) => {
        console.error(err.message);
      });
  }, [integration]);

  const setToast = (title: string, color = 'success', text?: ReactChild) => {
    if (!text) text = '';
    setToasts([...toasts, { id: new Date().toISOString(), title, text, color } as Toast]);
  };

  async function addIntegrationRequest(templateName: string, name: string, dataSource: string) {
    http
      .post(`${INTEGRATIONS_BASE}/store/dataSource/${templateName}`, {
        body: JSON.stringify({ name, dataSource }),
      })
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

  async function createCompliantDataSource(templateName: string, dataSource: string) {
    const basePath = http.basePath.get();
    http.post(`${INTEGRATIONS_BASE}/store/dataSource/${templateName}`, {
      body: JSON.stringify({ dataSource, basePath }),
    });
    // .then((res) => {
    //   setToast(
    //     `${name} integration successfully added!`,
    //     'success',
    //     `View the added assets from ${name} in the Added Integrations list`
    //   );
    // })
    // .catch((err) =>
    //   setToast(
    //     'Failed to load integration. Check Added Integrations table for more details',
    //     'danger'
    //   )
    // );
  }

  if (Object.keys(integration).length === 0) {
    return (
      <EuiOverlayMask>
        <EuiLoadingSpinner size="xl" />
      </EuiOverlayMask>
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
      <EuiPageBody>
        <EuiSpacer size="xl" />
        {IntegrationOverview({
          integration,
          showFlyout: () => {
            setIsFlyoutVisible(true);
          },
        })}
        <EuiSpacer />
        {IntegrationDetails({ integration })}
        <EuiSpacer />
        {IntegrationScreenshots({ integration })}
        <EuiSpacer />
        {IntegrationAssets({ integration, integrationAssets })}
        <EuiSpacer />
        {IntegrationFields({ integration, integrationMapping })}
        <EuiSpacer />
      </EuiPageBody>
      {isFlyoutVisible && (
        <AddIntegrationFlyout
          onClose={() => {
            setIsFlyoutVisible(false);
          }}
          onCreate={(name, dataSource) => {
            addIntegrationRequest(integrationTemplateId, name, dataSource);
          }}
          integrationName={integrationTemplateId}
          createCompliantDataSource={(datasource) => {
            createCompliantDataSource(integrationTemplateId, datasource);
          }}
          integrationType={integration.type}
        />
      )}
    </EuiPage>
  );
}
