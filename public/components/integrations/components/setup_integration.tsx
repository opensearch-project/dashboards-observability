/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Eui from '@elastic/eui';
import React, { useState, useEffect } from 'react';
import { string } from 'joi';
import { coreRefs } from '../../../framework/core_refs';

interface IntegrationConfig {
  displayName: string;
  connectionType: string;
  connectionDataSource: string;
}

interface IntegrationConfigProps {
  config: IntegrationConfig;
  updateConfig: (updates: Partial<IntegrationConfig>) => void;
}

const INTEGRATION_DATA_TABLE_COLUMNS = [
  {
    field: 'field',
    name: 'Field',
  },
  {
    field: 'sourceType',
    name: 'Source Data Type',
  },
  {
    field: 'destType',
    name: 'Destination Data Type',
  },
  {
    field: 'group',
    name: 'Mapping Group',
  },
];

// TODO support localization
const INTEGRATION_CONNECTION_DATA_SOURCE_TYPES: Map<string, string> = new Map([
  ['s3', 'table'],
  ['index', 'index'],
]);

const integrationConnectionSelectorItems = [
  {
    value: 's3',
    text: 'S3 Connection',
    dataSourceName: ['table', 'tables'],
  },
  {
    value: 'index',
    text: 'OpenSearch Index',
    dataSourceName: ['index', 'indexes'],
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
      const result = (await http.post('/api/console/proxy', {
        body: '{}',
        query: {
          path: '_plugins/_query/_datasources',
          method: 'GET',
        },
      })) as Array<{ name: string; connector: string }>;
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

export function IntegrationDataModal({ close }: { close: () => void }): React.JSX.Element {
  return (
    <Eui.EuiModal onClose={close}>
      <Eui.EuiModalHeader>
        <h2>Data Table</h2>
      </Eui.EuiModalHeader>
      <Eui.EuiModalBody>
        <Eui.EuiBasicTable
          items={integrationDataTableData}
          columns={INTEGRATION_DATA_TABLE_COLUMNS}
        />
        <Eui.EuiSpacer />
        <Eui.EuiButton onClick={close} size="s">
          Close
        </Eui.EuiButton>
      </Eui.EuiModalBody>
    </Eui.EuiModal>
  );
}

export function SetupIntegrationForm({ config, updateConfig }: IntegrationConfigProps) {
  const connectionType =
    INTEGRATION_CONNECTION_DATA_SOURCE_TYPES.get(config.connectionType) ?? 'index';
  const indefiniteArticle = 'aeiou'.includes(connectionType.charAt(0)) ? 'an' : 'a';
  const capitalizedConnectionType =
    connectionType.charAt(0).toUpperCase() + connectionType.slice(1);

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
    <Eui.EuiForm>
      <Eui.EuiTitle>
        <h1>Set Up Integration</h1>
      </Eui.EuiTitle>
      <Eui.EuiSpacer />
      <Eui.EuiTitle>
        <h2>Integration Details</h2>
      </Eui.EuiTitle>
      <Eui.EuiSpacer />
      <Eui.EuiFormRow label="Display Name">
        <Eui.EuiFieldText
          value={config.displayName}
          onChange={(event) => updateConfig({ displayName: event.target.value })}
        />
      </Eui.EuiFormRow>
      <Eui.EuiSpacer />
      <Eui.EuiTitle>
        <h2>Integration Connection</h2>
      </Eui.EuiTitle>
      <Eui.EuiSpacer />
      <Eui.EuiFormRow label="Data Source" helpText="Select a data source to connect to.">
        <Eui.EuiSelect
          options={integrationConnectionSelectorItems}
          value={config.connectionType}
          onChange={(event) =>
            updateConfig({ connectionType: event.target.value, connectionDataSource: '' })
          }
        />
      </Eui.EuiFormRow>
      <Eui.EuiFormRow
        label={capitalizedConnectionType}
        helpText={`Select ${indefiniteArticle} ${connectionType} to pull the data from.`}
      >
        <Eui.EuiComboBox
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
      </Eui.EuiFormRow>
      <Eui.EuiButton>Validate</Eui.EuiButton>
    </Eui.EuiForm>
  );
}

export function SetupBottomBar({ config }: { config: IntegrationConfig }) {
  return (
    <Eui.EuiBottomBar>
      <Eui.EuiFlexGroup justifyContent="flexEnd">
        <Eui.EuiFlexItem grow={false}>
          <Eui.EuiButton
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
          </Eui.EuiButton>
        </Eui.EuiFlexItem>
        <Eui.EuiFlexItem grow={false}>
          <Eui.EuiButton
            fill
            iconType="arrowRight"
            iconSide="right"
            onClick={() => console.log(config)}
          >
            Add Integration
          </Eui.EuiButton>
        </Eui.EuiFlexItem>
      </Eui.EuiFlexGroup>
    </Eui.EuiBottomBar>
  );
}

export function SetupIntegrationPage({ integration }: { integration: string }) {
  const [integConfig, setConfig] = useState({
    displayName: `${integration} Integration`,
    connectionType: 'index',
    connectionDataSource: '',
  } as IntegrationConfig);

  const updateConfig = (updates: Partial<IntegrationConfig>) =>
    setConfig(Object.assign({}, integConfig, updates));

  return (
    <Eui.EuiPage>
      <Eui.EuiPageBody>
        <Eui.EuiPageContent>
          <Eui.EuiPageContentBody restrictWidth>
            <SetupIntegrationForm config={integConfig} updateConfig={updateConfig} />
          </Eui.EuiPageContentBody>
        </Eui.EuiPageContent>
        <SetupBottomBar config={integConfig} />
      </Eui.EuiPageBody>
    </Eui.EuiPage>
  );
}
