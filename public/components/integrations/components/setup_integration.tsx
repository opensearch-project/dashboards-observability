/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiBottomBar,
  EuiButton,
  EuiComboBox,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiFormRow,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPageContentBody,
  EuiSelect,
  EuiSpacer,
  EuiTitle,
} from '@elastic/eui';
import React, { useState, useEffect } from 'react';
import { coreRefs } from '../../../framework/core_refs';
import {
  addIntegrationRequest,
  doExistingDataSourceValidation,
} from './create_integration_helpers';
import { useToast } from '../../../../public/components/common/toast';
import { INTEGRATIONS_BASE } from '../../../../common/constants/shared';

export interface IntegrationConfig {
  displayName: string;
  connectionType: string;
  connectionDataSource: string;
}

interface IntegrationConfigProps {
  config: IntegrationConfig;
  updateConfig: (updates: Partial<IntegrationConfig>) => void;
  integration: {
    name: string;
    type: string;
  };
}

// TODO support localization
const INTEGRATION_CONNECTION_DATA_SOURCE_TYPES: Map<
  string,
  {
    title: string;
    lower: string;
    help: string;
  }
> = new Map([
  [
    's3',
    {
      title: 'Table',
      lower: 'table',
      help: 'Select a table to pull the data from.',
    },
  ],
  [
    'index',
    {
      title: 'Index',
      lower: 'index',
      help: 'Select an index to pull the data from.',
    },
  ],
]);

const integrationConnectionSelectorItems = [
  {
    value: 's3',
    text: 'S3 Connection',
  },
  {
    value: 'index',
    text: 'OpenSearch Index',
  },
];

const integrationDataTableData = [
  {
    field: 'domain.bytes',
    sourceType: 'string',
    destType: 'integer',
    group: 'communication',
  },
  {
    field: 'http.url',
    sourceType: 'string',
    destType: 'keyword',
    group: 'http',
  },
  {
    field: 'destination.address',
    sourceType: 'string',
    destType: 'keyword',
    group: 'communication',
  },
  {
    field: 'netflow.error_rate',
    sourceType: 'string',
    destType: 'string',
    group: 'http',
  },
  {
    field: 'http.route',
    sourceType: 'string',
    destType: 'string',
    group: 'http',
  },
  {
    field: 'destination.packets',
    sourceType: 'integer',
    destType: 'integer',
    group: 'communication',
  },
];

const suggestDataSources = async (type: string): Promise<Array<{ label: string }>> => {
  const http = coreRefs.http!;
  try {
    if (type === 'index') {
      const result = await http.post('/api/console/proxy', {
        body: '{}',
        query: {
          path: '_data_stream/ss4o_*',
          method: 'GET',
        },
      });
      return (
        result.data_streams?.map((item: { name: string }) => {
          return { label: item.name };
        }) ?? []
      );
    } else if (type === 's3') {
      const result = (await http.get('/api/dataconnections')) as Array<{
        name: string;
        connector: string;
      }>;
      return (
        result
          ?.filter((item) => item.connector === 'S3GLUE')
          .map((item) => {
            return { label: item.name };
          }) ?? []
      );
    } else {
      console.error(`Unknown connection type: ${type}`);
      return [];
    }
  } catch (err: any) {
    console.error(err.message);
    return [];
  }
};

const findTemplate = async (integrationTemplateId: string) => {
  const http = coreRefs.http!;
  const result = await http.get(`${INTEGRATIONS_BASE}/repository/${integrationTemplateId}`);
  return result;
};

export function SetupIntegrationForm({
  config,
  updateConfig,
  integration,
}: IntegrationConfigProps) {
  const connectionType = INTEGRATION_CONNECTION_DATA_SOURCE_TYPES.get(config.connectionType)!;

  const [dataSourceSuggestions, setDataSourceSuggestions] = useState(
    [] as Array<{ label: string }>
  );
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(true);
  useEffect(() => {
    const updateDataSources = async () => {
      const data = await suggestDataSources(config.connectionType);
      setDataSourceSuggestions(data);
      setIsSuggestionsLoading(false);
    };

    setIsSuggestionsLoading(true);
    updateDataSources();
  }, [config.connectionType]);

  return (
    <EuiForm>
      <EuiTitle>
        <h1>Set Up Integration</h1>
      </EuiTitle>
      <EuiSpacer />
      <EuiTitle>
        <h2>Integration Details</h2>
      </EuiTitle>
      <EuiSpacer />
      <EuiFormRow label="Display Name">
        <EuiFieldText
          value={config.displayName}
          onChange={(event) => updateConfig({ displayName: event.target.value })}
        />
      </EuiFormRow>
      <EuiSpacer />
      <EuiTitle>
        <h2>Integration Connection</h2>
      </EuiTitle>
      <EuiSpacer />
      <EuiFormRow label="Data Source" helpText="Select a data source to connect to.">
        <EuiSelect
          options={integrationConnectionSelectorItems}
          value={config.connectionType}
          onChange={(event) =>
            updateConfig({ connectionType: event.target.value, connectionDataSource: '' })
          }
        />
      </EuiFormRow>
      <EuiFormRow label={connectionType.title} helpText={connectionType.help}>
        <EuiComboBox
          options={dataSourceSuggestions}
          isLoading={isSuggestionsLoading}
          onChange={(selected) => {
            if (selected.length === 0) {
              updateConfig({ connectionDataSource: '' });
            } else {
              updateConfig({ connectionDataSource: selected[0].label });
            }
          }}
          selectedOptions={[{ label: config.connectionDataSource }]}
          singleSelection={{ asPlainText: true }}
        />
      </EuiFormRow>
    </EuiForm>
  );
}

export function SetupBottomBar({
  config,
  integration,
}: {
  config: IntegrationConfig;
  integration: { name: string; type: string };
}) {
  const { setToast } = useToast();
  const [loading, setLoading] = useState(false);

  return (
    <EuiBottomBar>
      <EuiFlexGroup justifyContent="flexEnd">
        <EuiFlexItem grow={false}>
          <EuiButton
            color="secondary"
            iconType="cross"
            onClick={() => {
              // TODO evil hack because props aren't set up
              let hash = window.location.hash;
              hash = hash.trim();
              hash = hash.substring(0, hash.lastIndexOf('/setup'));
              window.location.hash = hash;
            }}
          >
            Discard
          </EuiButton>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton
            fill
            iconType="arrowRight"
            iconSide="right"
            isLoading={loading}
            onClick={async () => {
              setLoading(true);
              const template = await findTemplate(integration.name);
              await addIntegrationRequest(
                false,
                integration.name,
                config.displayName,
                template,
                setToast,
                config.displayName,
                config.connectionDataSource
              );
              setLoading(false);
            }}
          >
            Add Integration
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiBottomBar>
  );
}

export function SetupIntegrationPage({
  integration,
}: {
  integration: {
    name: string;
    type: string;
  };
}) {
  const [integConfig, setConfig] = useState({
    displayName: `${integration.name} Integration`,
    connectionType: 'index',
    connectionDataSource: '',
  } as IntegrationConfig);

  const updateConfig = (updates: Partial<IntegrationConfig>) =>
    setConfig(Object.assign({}, integConfig, updates));

  return (
    <EuiPage>
      <EuiPageBody>
        <EuiPageContent>
          <EuiPageContentBody>
            <SetupIntegrationForm
              config={integConfig}
              updateConfig={updateConfig}
              integration={integration}
            />
          </EuiPageContentBody>
        </EuiPageContent>
        <SetupBottomBar config={integConfig} integration={integration} />
      </EuiPageBody>
    </EuiPage>
  );
}
