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
  EuiLoadingDashboards,
  EuiModal,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPageContentBody,
  EuiProgress,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import React, { useState, useEffect } from 'react';
import { coreRefs } from '../../../framework/core_refs';
import { IntegrationTemplate, addIntegrationRequest } from './create_integration_helpers';
import { useToast } from '../../../../public/components/common/toast';
import { CONSOLE_PROXY, INTEGRATIONS_BASE } from '../../../../common/constants/shared';
import { DATACONNECTIONS_BASE } from '../../../../common/constants/shared';

export interface IntegrationSetupInputs {
  displayName: string;
  connectionType: string;
  connectionDataSource: string;
  connectionLocation: string;
}

interface IntegrationConfigProps {
  config: IntegrationSetupInputs;
  updateConfig: (updates: Partial<IntegrationSetupInputs>) => void;
  integration: IntegrationTemplate;
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

const suggestDataSources = async (type: string): Promise<Array<{ label: string }>> => {
  const http = coreRefs.http!;
  try {
    if (type === 'index') {
      const result = await http.post(CONSOLE_PROXY, {
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
      const result = (await http.get(DATACONNECTIONS_BASE)) as Array<{
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

const runQuery = async (
  query: string,
  trackProgress: (step: number) => void
): Promise<Result<object>> => {
  // Used for polling
  const sleep = (ms: number) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };

  try {
    const http = coreRefs.http!;
    const queryId = (
      await http.post(CONSOLE_PROXY, {
        body: JSON.stringify({ query, lang: 'sql' }),
        query: {
          path: '_plugins/_async_query',
          method: 'POST',
        },
      })
    ).queryId;
    while (true) {
      const poll = await http.post(CONSOLE_PROXY, {
        body: '{}',
        query: {
          path: '_plugins/_async_query/' + queryId,
          method: 'GET',
        },
      });
      if (poll.status === 'PENDING') {
        trackProgress(1);
      } else if (poll.status === 'RUNNING') {
        trackProgress(2);
      } else if (poll.status === 'SUCCESS') {
        trackProgress(3);
        return { ok: true, value: poll };
      } else if (poll.status === 'FAILURE') {
        return { ok: false, error: new Error('FAILURE status', { cause: poll }) };
      }
      await sleep(3000);
    }
  } catch (err: any) {
    console.error(err);
    return { ok: false, error: err };
  }
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
          placeholder={`${integration.name} Integration`}
        />
      </EuiFormRow>
      <EuiSpacer />
      <EuiTitle>
        <h2>Integration Connection</h2>
      </EuiTitle>
      <EuiSpacer />
      <EuiFormRow label="Data Source" helpText="Select a data source to connect to.">
        <EuiSelect
          options={integrationConnectionSelectorItems.filter((item) => {
            if (item.value === 's3') {
              return Object.hasOwn(integration.assets ?? {}, 'queries');
            } else if (item.value === 'index') {
              return Object.hasOwn(integration.assets ?? {}, 'savedObjects');
            } else {
              return false;
            }
          })}
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
      {config.connectionType === 's3' ? (
        <EuiFormRow label="S3 Bucket Location">
          <EuiFieldText
            value={config.connectionLocation}
            onChange={(event) => updateConfig({ connectionLocation: event.target.value })}
            placeholder="s3://"
          />
        </EuiFormRow>
      ) : null}
    </EuiForm>
  );
}

export function SetupBottomBar({
  config,
  integration,
  loading,
  setLoading,
  loadingProgress,
  setProgress,
}: {
  config: IntegrationSetupInputs;
  integration: IntegrationTemplate;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  loadingProgress: number;
  setProgress: (updater: number | ((progress: number) => number)) => void;
}) {
  const { setToast } = useToast();

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

              if (config.connectionType === 'index') {
                await addIntegrationRequest(
                  false,
                  integration.name,
                  config.displayName,
                  integration,
                  setToast,
                  config.displayName,
                  config.connectionDataSource
                );
                setProgress((progress) => progress + 1);
              } else if (config.connectionType === 's3') {
                const http = coreRefs.http!;

                const assets = await http.get(
                  `${INTEGRATIONS_BASE}/repository/${integration.name}/assets`
                );
                setProgress((progress) => progress + 1);

                // Queries must exist because we disable s3 if they're not present
                for (const query of assets.data.queries!) {
                  let queryStr = (query.query as string).replaceAll(
                    '{table_name}',
                    `${config.connectionDataSource}.default.${integration.name}`
                  );
                  queryStr = queryStr.replaceAll('{s3_bucket_location}', config.connectionLocation);
                  queryStr = queryStr.replaceAll('{object_name}', integration.name);
                  const currProgress = loadingProgress; // Need a frozen copy for getting accurate query steps
                  const result = await runQuery(queryStr, (step) =>
                    setProgress(currProgress + step)
                  );
                  if (!result.ok) {
                    console.error('Query failed', result.error);
                    setLoading(false);
                    setToast('Something went wrong.', 'danger');
                    return;
                  }
                }
                // Once everything is ready, add the integration to the new datasource as usual
                // TODO determine actual values here after more about queries is known
                await addIntegrationRequest(
                  false,
                  integration.name,
                  config.displayName,
                  integration,
                  setToast,
                  config.displayName,
                  config.connectionDataSource
                );
                setProgress((progress) => progress + 1);
              } else {
                console.error('Invalid data source type');
              }
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

export function LoadingPage({ value, max }: { value: number; max: number }) {
  return (
    <>
      <EuiSpacer size="xxl" />
      <EuiFlexGroup direction="column" justifyContent="center" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiLoadingDashboards size="xxl" />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiTitle>
            <h3>Adding Integration</h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText>
            This may take a few minutes. The integration and assets are being added.
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer />
      <EuiProgress value={value} max={max} size="m" />
    </>
  );
}

export function SetupIntegrationPage({ integration }: { integration: string }) {
  const [integConfig, setConfig] = useState({
    displayName: `${integration} Integration`,
    connectionType: 'index',
    connectionDataSource: '',
    connectionLocation: '',
  } as IntegrationSetupInputs);

  const [template, setTemplate] = useState({
    name: integration,
    type: '',
    assets: {},
  } as IntegrationTemplate);

  const [showLoading, setShowLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  useEffect(() => {
    const getTemplate = async () => {
      const http = coreRefs.http!;
      const value = await http.get(INTEGRATIONS_BASE + `/repository/${integration}`);
      setTemplate(value.data);
    };
    getTemplate();
  }, [integration]);

  const updateConfig = (updates: Partial<IntegrationSetupInputs>) =>
    setConfig(Object.assign({}, integConfig, updates));
  const maxProgress = 2 + 3 * (template.assets?.queries?.length ?? 0);

  return (
    <EuiPage>
      <EuiPageBody>
        <EuiPageContent>
          <EuiPageContentBody>
            {showLoading ? (
              <LoadingPage value={loadingProgress} max={maxProgress} />
            ) : (
              <SetupIntegrationForm
                config={integConfig}
                updateConfig={updateConfig}
                integration={template}
              />
            )}
          </EuiPageContentBody>
        </EuiPageContent>
        <SetupBottomBar
          config={integConfig}
          integration={template}
          loading={showLoading}
          setLoading={setShowLoading}
          loadingProgress={loadingProgress}
          setProgress={setLoadingProgress}
        />
      </EuiPageBody>
    </EuiPage>
  );
}
