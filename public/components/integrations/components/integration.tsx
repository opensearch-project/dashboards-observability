/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import {
  EuiButton,
  EuiLoadingSpinner,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiOverlayMask,
  EuiPage,
  EuiPageBody,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiText,
} from '@elastic/eui';
import React, { ComponentType, useEffect, useState } from 'react';
import { DataSourceSelectorProps } from '../../../../../../src/plugins/data_source_management/public/components/data_source_selector/data_source_selector';
import { INTEGRATIONS_BASE } from '../../../../common/constants/shared';
import { dataSourceFilterFn } from '../../../../common/utils/shared';
import { useToast } from '../../../../public/components/common/toast';
import { coreRefs } from '../../../framework/core_refs';
import { addIntegrationRequest } from './create_integration_helpers';
import { IntegrationAssets } from './integration_assets_panel';
import { IntegrationDetails } from './integration_details_panel';
import { IntegrationFields } from './integration_fields_panel';
import { IntegrationOverview } from './integration_overview_panel';
import { IntegrationScreenshots } from './integration_screenshots_panel';
import { AvailableIntegrationProps } from './integration_types';

export function Integration(props: AvailableIntegrationProps) {
  const http = coreRefs.http!;
  const {
    integrationTemplateId,
    chrome,
    notifications,
    dataSourceEnabled,
    dataSourceManagement,
    savedObjectsMDSClient,
  } = props;

  const { setToast } = useToast();
  const [integration, setIntegration] = useState({} as IntegrationConfig);

  const [integrationMapping, setMapping] = useState(null);
  const [integrationAssets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const closeModal = () => setIsModalVisible(false);
  const showModal = () => setIsModalVisible(true);
  const [dataSourceMDSId, setDataSourceMDSId] = useState<string>('');
  const [dataSourceMDSLabel, setDataSourceMDSLabel] = useState<string>('');

  useEffect(() => {
    chrome.setBreadcrumbs([
      {
        text: 'Integrations',
        href: '#/',
      },
      {
        text: integration.displayName || integration.name || '...',
        href: `#/available/${integrationTemplateId}`,
      },
    ]);
    handleDataRequest();
  }, [integrationTemplateId, integration.name]);

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
      name: 'Schema Fields',
      disabled: false,
    },
  ];

  const [selectedTabId, setSelectedTabId] = useState('assets');

  const onSelectedTabChanged = (id: string) => {
    setSelectedTabId(id);
  };

  let DataSourceSelector:
    | ComponentType<DataSourceSelectorProps>
    | React.JSX.IntrinsicAttributes
    | null;
  if (dataSourceEnabled) {
    DataSourceSelector = dataSourceManagement.ui.DataSourceSelector;
  }

  const onSelectedDataSource = (e) => {
    const dataConnectionId = e[0] ? e[0].id : undefined;
    setDataSourceMDSId(dataConnectionId);
    const dataConnectionLabel = e[0] ? e[0].label : undefined;
    setDataSourceMDSLabel(dataConnectionLabel);
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

  let modal = <></>;

  if (isModalVisible) {
    modal = (
      <EuiModal onClose={closeModal}>
        <EuiModalHeader>
          <EuiModalHeaderTitle>
            <h1>Select Data Source</h1>
            <EuiText color="subdued">Select which data source to install sample data to</EuiText>
          </EuiModalHeaderTitle>
        </EuiModalHeader>

        <EuiModalBody>
          <DataSourceSelector
            savedObjectsClient={savedObjectsMDSClient.client}
            notifications={notifications}
            disabled={false}
            fullWidth={false}
            removePrepend={true}
            onSelectedDataSource={onSelectedDataSource}
            dataSourceFilter={dataSourceFilterFn}
          />
          <EuiSpacer />
        </EuiModalBody>

        <EuiModalFooter>
          <EuiButton onClick={closeModal}>Close</EuiButton>

          <EuiButton
            onClick={async () => {
              setLoading(true);
              await addIntegrationRequest({
                addSample: true,
                templateName: integration.name,
                integration,
                setToast,
                dataSourceMDSId,
                dataSourceMDSLabel,
              });
              setLoading(false);
              closeModal();
            }}
            isLoading={loading}
            fill
          >
            Add
          </EuiButton>
        </EuiModalFooter>
      </EuiModal>
    );
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
      <EuiPageBody>
        <IntegrationOverview
          integration={integration}
          showFlyout={() => {
            window.location.hash = `#/available/${integration.name}/setup`;
          }}
          setUpSample={async () => {
            if (dataSourceEnabled) {
              showModal();
            } else {
              setLoading(true);
              await addIntegrationRequest({
                addSample: true,
                templateName: integration.name,
                integration,
                setToast,
                dataSourceMDSId,
                dataSourceMDSLabel,
              });
              setLoading(false);
            }
          }}
          loading={loading}
        />
        {IntegrationDetails({ integration })}
        <EuiSpacer size="s" />
        {IntegrationScreenshots({ integration, http })}
        <EuiSpacer size="s" />
        <EuiTabs display="default" size="s">
          {renderTabs()}
        </EuiTabs>
        <EuiSpacer size="s" />
        {selectedTabId === 'assets'
          ? IntegrationAssets({ integration, integrationAssets })
          : IntegrationFields({ integration, integrationMapping })}
        <EuiSpacer size="s" />
      </EuiPageBody>
      {modal}
    </EuiPage>
  );
}
