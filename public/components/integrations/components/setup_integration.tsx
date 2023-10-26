/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiBottomBar,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiComboBox,
  EuiEmptyPrompt,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiFormRow,
  EuiLoadingLogo,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPageContentBody,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import React, { useState, useEffect } from 'react';
import { Color } from 'common/constants/integrations';
import { coreRefs } from '../../../framework/core_refs';
import { IntegrationTemplate, addIntegrationRequest } from './create_integration_helpers';
import { CONSOLE_PROXY, INTEGRATIONS_BASE } from '../../../../common/constants/shared';
import { DATACONNECTIONS_BASE } from '../../../../common/constants/shared';

export interface IntegrationSetupInputs {
  displayName: string;
  connectionType: string;
  connectionDataSource: string;
  connectionLocation: string;
  connectionTableName: string;
}

type SetupCallout = { show: true; title: string; color?: Color; text?: string } | { show: false };

interface IntegrationConfigProps {
  config: IntegrationSetupInputs;
  updateConfig: (updates: Partial<IntegrationSetupInputs>) => void;
  integration: IntegrationTemplate;
  setupCallout: SetupCallout;
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
      title: 'Catalog',
      lower: 'catalog',
      help: 'Select a catalog to pull the data from.',
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
  datasource: string,
  sessionId: string | null
): Promise<Result<{ poll: object; sessionId: string }>> => {
  // Used for polling
  const sleep = (ms: number) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };

  try {
    const http = coreRefs.http!;
    const queryResponse: { queryId: string; sessionId: string } = await http.post(CONSOLE_PROXY, {
      body: JSON.stringify({ query, datasource, lang: 'sql', sessionId }),
      query: {
        path: '_plugins/_async_query',
        method: 'POST',
      },
    });
    const [queryId, newSessionId] = [queryResponse.queryId, queryResponse.sessionId];
    while (true) {
      const poll: { status: string; error?: string } = await http.post(CONSOLE_PROXY, {
        body: '{}',
        query: {
          path: '_plugins/_async_query/' + queryId,
          method: 'GET',
        },
      });
      if (poll.status.toLowerCase() === 'success') {
        return {
          ok: true,
          value: {
            poll,
            sessionId: newSessionId,
          },
        };
        // Fail status can inconsistently be "failed" or "failure"
      } else if (poll.status.toLowerCase().startsWith('fail')) {
        return {
          ok: false,
          error: new Error(poll.error ?? 'No error information provided', { cause: poll }),
        };
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
  setupCallout,
}: IntegrationConfigProps) {
  const connectionType = INTEGRATION_CONNECTION_DATA_SOURCE_TYPES.get(config.connectionType)!;

  const [dataSourceSuggestions, setDataSourceSuggestions] = useState(
    [] as Array<{ label: string }>
  );
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(true);
  const [isBlurred, setIsBlurred] = useState(false);
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
      {setupCallout.show ? (
        <EuiCallOut title={setupCallout.title} color="danger">
          <p>{setupCallout.text}</p>
        </EuiCallOut>
      ) : null}
      <EuiSpacer />
      <EuiText>
        <h3>Integration Details</h3>
      </EuiText>
      <EuiSpacer />
      <EuiFormRow
        label="Display Name"
        error={['Must be at least 1 character.']}
        isInvalid={config.displayName.length === 0}
      >
        <EuiFieldText
          value={config.displayName}
          onChange={(event) => updateConfig({ displayName: event.target.value })}
          placeholder={`${integration.name} Integration`}
          isInvalid={config.displayName.length === 0}
        />
      </EuiFormRow>
      <EuiSpacer />
      <EuiText>
        <h3>Integration Connection</h3>
      </EuiText>
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
          onCreateOption={(searchValue) => {
            const normalizedSearchValue = searchValue.trim();
            if (!normalizedSearchValue) {
              return;
            }
            const newOption = { label: normalizedSearchValue };
            setDataSourceSuggestions((ds) => ds.concat([newOption]));
            updateConfig({ connectionDataSource: newOption.label });
          }}
          customOptionText={`Select {searchValue} as your ${connectionType.lower}`}
        />
      </EuiFormRow>
      {config.connectionType === 's3' ? (
        <>
          <EuiFormRow
            label="Flint Table Name"
            helpText="Select a table name to associate with your data."
            error={['Must be at least 1 character.']}
            isInvalid={config.connectionTableName.length === 0}
          >
            <EuiFieldText
              placeholder={integration.name}
              value={config.connectionTableName}
              onChange={(evt) => {
                updateConfig({ connectionTableName: evt.target.value });
              }}
              isInvalid={config.connectionTableName.length === 0}
            />
          </EuiFormRow>
          <EuiFormRow
            label="S3 Bucket Location"
            isInvalid={isBlurred && !config.connectionLocation.startsWith('s3://')}
            error={["Must be a URL starting with 's3://'."]}
          >
            <EuiFieldText
              value={config.connectionLocation}
              onChange={(event) => updateConfig({ connectionLocation: event.target.value })}
              placeholder="s3://"
              isInvalid={isBlurred && !config.connectionLocation.startsWith('s3://')}
              onBlur={() => {
                setIsBlurred(true);
              }}
            />
          </EuiFormRow>
        </>
      ) : null}
    </EuiForm>
  );
}

export function SetupBottomBar({
  config,
  integration,
  loading,
  setLoading,
  setSetupCallout,
}: {
  config: IntegrationSetupInputs;
  integration: IntegrationTemplate;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  setSetupCallout: (setupCallout: SetupCallout) => void;
}) {
  // Drop-in replacement for setToast
  const setCalloutLikeToast = (title: string, color?: Color, text?: string) =>
    setSetupCallout({
      show: true,
      title,
      color,
      text,
    });

  return (
    <EuiBottomBar>
      <EuiFlexGroup justifyContent="flexEnd">
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            color="text"
            iconType="cross"
            onClick={() => {
              // TODO evil hack because props aren't set up
              let hash = window.location.hash;
              hash = hash.trim();
              hash = hash.substring(0, hash.lastIndexOf('/setup'));
              window.location.hash = hash;
            }}
            disabled={loading}
          >
            Discard
          </EuiButtonEmpty>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton
            fill
            iconType="arrowRight"
            iconSide="right"
            isLoading={loading}
            disabled={
              config.displayName.length < 1 ||
              config.connectionDataSource.length < 1 ||
              (config.connectionType === 's3' &&
                (config.connectionTableName.length < 1 ||
                  !config.connectionLocation.startsWith('s3://')))
            }
            onClick={async () => {
              setLoading(true);
              let sessionId: string | null = null;

              if (config.connectionType === 'index') {
                const res = await addIntegrationRequest(
                  false,
                  integration.name,
                  config.displayName,
                  integration,
                  setCalloutLikeToast,
                  config.displayName,
                  config.connectionDataSource
                );
                if (!res) {
                  setLoading(false);
                }
              } else if (config.connectionType === 's3') {
                const http = coreRefs.http!;

                const assets = await http.get(
                  `${INTEGRATIONS_BASE}/repository/${integration.name}/assets`
                );

                // Queries must exist because we disable s3 if they're not present
                for (const query of assets.data.queries!) {
                  let queryStr = (query.query as string).replaceAll(
                    '{table_name}',
                    `${config.connectionDataSource}.default.${config.connectionTableName}`
                  );
                  queryStr = queryStr.replaceAll('{s3_bucket_location}', config.connectionLocation);
                  queryStr = queryStr.replaceAll('{object_name}', config.connectionTableName);
                  queryStr = queryStr.replaceAll(/\s+/g, ' ');
                  const result = await runQuery(queryStr, config.connectionDataSource, sessionId);
                  if (!result.ok) {
                    setLoading(false);
                    setCalloutLikeToast(
                      'Failed to add integration',
                      'danger',
                      result.error.message
                    );
                    return;
                  }
                  sessionId = result.value.sessionId ?? sessionId;
                }
                // Once everything is ready, add the integration to the new datasource as usual
                // TODO determine actual values here after more about queries is known
                const res = await addIntegrationRequest(
                  false,
                  integration.name,
                  config.displayName,
                  integration,
                  setCalloutLikeToast,
                  config.displayName,
                  `flint_${config.connectionDataSource}_default_${config.connectionTableName}_mview`
                );
                if (!res) {
                  setLoading(false);
                }
              } else {
                console.error('Invalid data source type');
              }
            }}
          >
            Add Integration
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiBottomBar>
  );
}

export function LoadingPage() {
  return (
    <>
      <EuiEmptyPrompt
        icon={<EuiLoadingLogo logo="logoOpenSearch" size="xl" />}
        title={<h2>Setting Up the Integration</h2>}
        body={<p>This can take several minutes.</p>}
      />
    </>
  );
}

export function SetupIntegrationPage({ integration }: { integration: string }) {
  const [integConfig, setConfig] = useState({
    displayName: `${integration} Integration`,
    connectionType: 'index',
    connectionDataSource: '',
    connectionLocation: '',
    connectionTableName: integration,
  } as IntegrationSetupInputs);

  const [template, setTemplate] = useState({
    name: integration,
    type: '',
    assets: {},
  } as IntegrationTemplate);

  const [setupCallout, setSetupCallout] = useState({ show: false } as SetupCallout);
  const [showLoading, setShowLoading] = useState(false);

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

  return (
    <EuiPage>
      <EuiPageBody>
        <EuiPageContent>
          <EuiPageContentBody>
            {showLoading ? (
              <LoadingPage />
            ) : (
              <SetupIntegrationForm
                config={integConfig}
                updateConfig={updateConfig}
                integration={template}
                setupCallout={setupCallout}
              />
            )}
          </EuiPageContentBody>
        </EuiPageContent>
        <SetupBottomBar
          config={integConfig}
          integration={template}
          loading={showLoading}
          setLoading={setShowLoading}
          setSetupCallout={setSetupCallout}
        />
      </EuiPageBody>
    </EuiPage>
  );
}
