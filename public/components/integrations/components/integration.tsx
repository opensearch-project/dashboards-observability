/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import {
  EuiLoadingSpinner,
  EuiOverlayMask,
  EuiPage,
  EuiPageBody,
  EuiSpacer,
  EuiTab,
  EuiTabs,
} from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { IntegrationOverview } from './integration_overview_panel';
import { IntegrationDetails } from './integration_details_panel';
import { IntegrationFields } from './integration_fields_panel';
import { IntegrationAssets } from './integration_assets_panel';
import { AvailableIntegrationProps } from './integration_types';
import { INTEGRATIONS_BASE } from '../../../../common/constants/shared';
import { IntegrationScreenshots } from './integration_screenshots_panel';
import { useToast } from '../../../../public/components/common/toast';
import { coreRefs } from '../../../framework/core_refs';
import { IntegrationTemplate, addIntegrationRequest } from './create_integration_helpers';

export function Integration(props: AvailableIntegrationProps) {
  const http = coreRefs.http!;
  const { integrationTemplateId, chrome } = props;

  const { setToast } = useToast();
  const [integration, setIntegration] = useState({} as IntegrationTemplate);

  const [integrationMapping, setMapping] = useState(null);
  const [integrationAssets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    chrome.setBreadcrumbs([
      {
        text: 'Integrations',
        href: '#/',
      },
      {
        text: integrationTemplateId,
        href: `#/available/${integrationTemplateId}`,
      },
    ]);
    handleDataRequest();
  }, [integrationTemplateId]);

  async function handleDataRequest() {
    // TODO fill in ID request here
    http.get(`${INTEGRATIONS_BASE}/repository/${integrationTemplateId}`).then((exists) => {
      if (!exists.data) {
        window.location.hash = '#/available';
        setToast(`Template '${integrationTemplateId}' not found`, 'danger');
        return;
      }
      setIntegration(exists.data);
    });
  }

  useEffect(() => {
    if (Object.keys(integration).length === 0) {
      return;
    }
    http
      .get(`${INTEGRATIONS_BASE}/repository/${integration.name}/schema`)
      .then((parsedResponse) => {
        if (parsedResponse.statusCode && parsedResponse.statusCode !== 200) {
          throw new Error('Request for schema failed: ' + parsedResponse.message);
        }
        return parsedResponse.data.mappings[integration.type];
      })
      .then((mapping) => setMapping(mapping))
      .catch((err) => {
        console.error(err.message);
      });
  }, [integration]);

  useEffect(() => {
    if (Object.keys(integration).length === 0) {
      return;
    }
    http
      .get(`${INTEGRATIONS_BASE}/repository/${integration.name}/assets`)
      .then((parsedResponse) => {
        if (parsedResponse.statusCode && parsedResponse.statusCode !== 200) {
          throw new Error('Request for assets failed: ' + parsedResponse.message);
        }
        return parsedResponse.data;
      })
      .then((assets) => setAssets(assets))
      .catch((err) => {
        console.error(err.message);
      });
  }, [integration]);

  const tabs = [
    {
      id: 'assets',
      name: 'Asset List',
      disabled: false,
    },
    {
      id: 'fields',
      name: 'Integration Fields',
      disabled: false,
    },
  ];

  const [selectedTabId, setSelectedTabId] = useState('assets');

  const onSelectedTabChanged = (id: string) => {
    setSelectedTabId(id);
  };

  const renderTabs = () => {
    return tabs.map((tab, index) => (
      <EuiTab
        onClick={() => onSelectedTabChanged(tab.id)}
        isSelected={tab.id === selectedTabId}
        disabled={tab.disabled}
        key={index}
        data-test-subj={tab.id}
      >
        {tab.name}
      </EuiTab>
    ));
  };

  if (Object.keys(integration).length === 0) {
    return (
      <EuiOverlayMask>
        <EuiLoadingSpinner size="xl" />
      </EuiOverlayMask>
    );
  }
  return (
    <EuiPage>
      <EuiPageBody>
        <EuiSpacer size="xl" />
        {IntegrationOverview({
          integration,
          showFlyout: () => {
            window.location.hash = `#/available/${integration.name}/setup`;
          },
          setUpSample: async () => {
            setLoading(true);
            await addIntegrationRequest(
              true,
              integration.name,
              integrationTemplateId,
              integration,
              setToast
            );
            setLoading(false);
          },
          loading,
        })}
        <EuiSpacer />
        {IntegrationDetails({ integration })}
        <EuiSpacer />
        {IntegrationScreenshots({ integration, http })}
        <EuiSpacer />
        <EuiTabs display="condensed">{renderTabs()}</EuiTabs>
        <EuiSpacer size="s" />
        {selectedTabId === 'assets'
          ? IntegrationAssets({ integration, integrationAssets })
          : IntegrationFields({ integration, integrationMapping })}
        <EuiSpacer />
      </EuiPageBody>
    </EuiPage>
  );
}
