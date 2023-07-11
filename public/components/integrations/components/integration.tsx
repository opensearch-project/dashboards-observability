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
  EuiTab,
  EuiTabs,
} from '@elastic/eui';
import React, { ReactChild, useEffect, useState } from 'react';
import { last } from 'lodash';
import { IntegrationOverview } from './integration_overview_panel';
import { IntegrationDetails } from './integration_details_panel';
import { IntegrationFields } from './integration_fields_panel';
import { IntegrationAssets } from './integration_assets_panel';
import { AvailableIntegrationProps } from './integration_types';
import { INTEGRATIONS_BASE } from '../../../../common/constants/shared';
import { IntegrationScreenshots } from './integration_screenshots_panel';
import { AddIntegrationFlyout } from './add_integration_flyout';
import { useToast } from '../../../../public/components/common/toast';

export function Integration(props: AvailableIntegrationProps) {
  const { http, integrationTemplateId, chrome } = props;

  const [isFlyoutVisible, setIsFlyoutVisible] = useState(false);
  const { setToast } = useToast();
  const [integration, setIntegration] = useState({});

  const [integrationMapping, setMapping] = useState(null);
  const [integrationAssets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);

  const createMappings = async (
    componentName: string,
    payload: {
      template: { mappings: { _meta: { version: string } } };
      composed_of: string[];
      index_patterns: string[];
    },
    dataSourceName: string
  ): Promise<{ [key: string]: { properties: any } } | null> => {
    const version = payload.template.mappings._meta.version;
    if (componentName !== integration.type) {
      return fetch(
        `/api/console/proxy?path=_component_template/ss4o_${componentName}_${version}_template&method=POST`,
        {
          method: 'POST',
          headers: [
            ['osd-xsrf', 'true'],
            ['Content-Type', 'application/json'],
          ],
          body: JSON.stringify(payload),
        }
      )
        .then((response) => response.json())
        .catch((err: any) => {
          console.error(err);
          return err;
        });
    } else {
      payload.index_patterns = [dataSourceName];
      return fetch(
        `/api/console/proxy?path=_index_template/${componentName}_${version}&method=POST`,
        {
          method: 'POST',
          headers: [
            ['osd-xsrf', 'true'],
            ['Content-Type', 'application/json'],
          ],
          body: JSON.stringify(payload),
        }
      )
        .then((response) => response.json())
        .catch((err: any) => {
          console.error(err);
          return err;
        });
    }
  };

  const createDataSourceMappings = async (targetDataSource: string): Promise<any> => {
    const data = await fetch(
      `${INTEGRATIONS_BASE}/repository/${integrationTemplateId}/schema`
    ).then((response) => {
      return response.json();
    });
    let error = null;
    const mappings = data.data.mappings;
    mappings[integration.type].composed_of = mappings[integration.type].composed_of.map(
      (templateName: string) => {
        const version = mappings[templateName].template.mappings._meta.version;
        return `ss4o_${templateName}_${version}_template`;
      }
    );
    Object.entries(mappings).forEach(async ([key, mapping]) => {
      if (key === integration.type) {
        return;
      }
      await createMappings(key, mapping as any, targetDataSource);
    });
    await createMappings(integration.type, mappings[integration.type], targetDataSource);

    for (const [key, mapping] of Object.entries(data.data.mappings)) {
      const result = await createMappings(key, mapping as any, targetDataSource);

      if (result && result.error) {
        error = (result.error as any).reason;
      }
    }

    if (error !== null) {
      setToast('Failure creating index template', 'danger', error);
    } else {
      setToast(`Successfully created index template`);
    }
  };

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

  async function addIntegrationRequest(
    addSample: boolean,
    templateName: string,
    name?: string,
    dataSource?: string
  ) {
    setLoading(true);
    if (addSample) {
      createDataSourceMappings(`ss4o_${integration.type}-${integrationTemplateId}-*-sample`);
      name = `${integrationTemplateId}-sample`;
      dataSource = `ss4o_${integration.type}-${integrationTemplateId}-sample-sample`;
    }

    const response: boolean = await http
      .post(`${INTEGRATIONS_BASE}/store/${templateName}`, {
        body: JSON.stringify({ name, dataSource }),
      })
      .then((_res) => {
        setToast(`${name} integration successfully added!`, 'success');
        window.location.hash = `#/installed/${_res.data?.id}`;
        return true;
      })
      .catch((_err) => {
        setToast(
          'Failed to load integration. Check Added Integrations table for more details',
          'danger'
        );
        return false;
      });
    if (!addSample || !response) {
      setLoading(false);
      return;
    }
    const data: { sampleData: unknown[] } = await http
      .get(`${INTEGRATIONS_BASE}/repository/${templateName}/data`)
      .then((res) => res.data)
      .catch((err) => {
        console.error(err);
        setToast('The sample data could not be retrieved', 'danger');
        return { sampleData: [] };
      });
    const requestBody =
      data.sampleData
        .map((record) => `{"create": { "_index": "${dataSource}" } }\n${JSON.stringify(record)}`)
        .join('\n') + '\n';
    fetch(`/api/console/proxy?path=${dataSource}/_bulk&method=POST`, {
      method: 'POST',
      body: requestBody,
      headers: [
        ['osd-xsrf', 'true'],
        ['Content-Type', 'application/json; charset=utf-8'],
      ],
    })
      .catch((err) => {
        console.error(err);
        setToast('Failed to load sample data', 'danger');
      })
      .finally(() => {
        setLoading(false);
      });
  }

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

  const onSelectedTabChanged = (id) => {
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
            setIsFlyoutVisible(true);
          },
          setUpSample: () => {
            addIntegrationRequest(true, integrationTemplateId);
          },
          loading,
        })}
        <EuiSpacer />
        {IntegrationDetails({ integration })}
        <EuiSpacer />
        {IntegrationScreenshots({ integration })}
        <EuiSpacer />
        <EuiTabs display="condensed">{renderTabs()}</EuiTabs>
        <EuiSpacer size="s" />
        {selectedTabId === 'assets'
          ? IntegrationAssets({ integration, integrationAssets })
          : IntegrationFields({ integration, integrationMapping })}
        <EuiSpacer />
      </EuiPageBody>
      {isFlyoutVisible && (
        <AddIntegrationFlyout
          onClose={() => {
            setIsFlyoutVisible(false);
          }}
          onCreate={(name, dataSource) => {
            addIntegrationRequest(false, integrationTemplateId, name, dataSource);
          }}
          integrationName={integrationTemplateId}
          integrationType={integration.type}
          http={http}
        />
      )}
    </EuiPage>
  );
}
