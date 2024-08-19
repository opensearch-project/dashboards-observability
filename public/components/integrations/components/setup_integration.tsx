/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiBottomBar,
  EuiSmallButton,
  EuiSmallButtonEmpty,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiLoadingLogo,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPageContentBody,
} from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { NotificationsStart, SavedObjectsStart } from '../../../../../../src/core/public';
import { DataSourceManagementPluginSetup } from '../../../../../../src/plugins/data_source_management/public';
import { Color } from '../../../../common/constants/integrations';
import { CONSOLE_PROXY, INTEGRATIONS_BASE } from '../../../../common/constants/shared';
import { coreRefs } from '../../../framework/core_refs';
import { addIntegrationRequest } from './create_integration_helpers';
import { SetupIntegrationFormInputs } from './setup_integration_inputs';

export interface IntegrationSetupInputs {
  displayName: string;
  connectionType: string;
  connectionDataSource: string;
  connectionLocation: string;
  checkpointLocation: string;
  connectionTableName: string;
  enabledWorkflows: string[];
}

export interface IntegrationConfigProps {
  config: IntegrationSetupInputs;
  updateConfig: (updates: Partial<IntegrationSetupInputs>) => void;
  integration: IntegrationConfig;
  setupCallout: SetupCallout;
  lockConnectionType?: boolean;
  notifications: NotificationsStart;
  dataSourceEnabled: boolean;
  dataSourceManagement: DataSourceManagementPluginSetup;
  savedObjectsMDSClient: SavedObjectsStart;
}

type SetupCallout = { show: true; title: string; color?: Color; text?: string } | { show: false };

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
    let poll: { status: string; error?: string } = { status: 'undefined' };
    const [queryId, newSessionId] = [queryResponse.queryId, queryResponse.sessionId];
    while (!poll.error) {
      poll = await http.post(CONSOLE_PROXY, {
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
    return { ok: false, error: new Error(poll.error) };
  } catch (err) {
    console.error(err);
    return { ok: false, error: err };
  }
};

const makeTableName = (config: IntegrationSetupInputs): string => {
  return `${config.connectionDataSource}.default.${config.connectionTableName}`;
};

const prepareQuery = (query: string, config: IntegrationSetupInputs): string => {
  // To prevent checkpoint collisions, each query needs a unique checkpoint name, we use an enriched
  // UUID to create subfolders under the given checkpoint location per-query.
  const querySpecificUUID = crypto.randomUUID();
  let checkpointLocation = config.checkpointLocation.endsWith('/')
    ? config.checkpointLocation
    : config.checkpointLocation + '/';
  checkpointLocation += `${config.connectionDataSource}-${config.connectionTableName}-${querySpecificUUID}`;

  let queryStr = query.replaceAll('{table_name}', makeTableName(config));
  queryStr = queryStr.replaceAll('{s3_bucket_location}', config.connectionLocation);
  queryStr = queryStr.replaceAll('{s3_checkpoint_location}', checkpointLocation);
  queryStr = queryStr.replaceAll('{object_name}', config.connectionTableName);
  // TODO spark API only supports single-line queries, but directly replacing all whitespace leads
  // to issues with single-line comments and quoted strings with more whitespace. A more robust
  // implementation would remove comments before flattening and ignore strings.
  queryStr = queryStr.replaceAll(/\s+/g, ' ');
  return queryStr;
};

const addIntegration = async ({
  config,
  integration,
  setLoading,
  setCalloutLikeToast,
  setIsInstalling,
}: {
  config: IntegrationSetupInputs;
  integration: IntegrationConfig;
  setLoading: (loading: boolean) => void;
  setCalloutLikeToast: (title: string, color?: Color, text?: string) => void;
  setIsInstalling?: (isInstalling: boolean, success?: boolean) => void;
}) => {
  setLoading(true);
  let sessionId: string | null = null;

  if (config.connectionType === 'index') {
    let enabledWorkflows: string[] | undefined;
    if (integration.workflows) {
      enabledWorkflows = integration.workflows
        .filter((w) =>
          w.applicable_data_sources ? w.applicable_data_sources.includes('index') : true
        )
        .map((w) => w.name);
    }
    const res = await addIntegrationRequest({
      addSample: false,
      templateName: integration.name,
      integration,
      setToast: setCalloutLikeToast,
      name: config.displayName,
      indexPattern: config.connectionDataSource,
      skipRedirect: setIsInstalling ? true : false,
      workflows: enabledWorkflows,
    });
    if (setIsInstalling) {
      setIsInstalling(false, res);
    }
    if (!res) {
      setLoading(false);
    }
  } else if (config.connectionType === 's3') {
    const http = coreRefs.http!;

    const assets: { data: ParsedIntegrationAsset[] } = await http.get(
      `${INTEGRATIONS_BASE}/repository/${integration.name}/assets`
    );

    for (const query of assets.data.filter(
      (a: ParsedIntegrationAsset): a is ParsedIntegrationAsset & { type: 'query' } =>
        a.type === 'query'
    )) {
      // Skip any queries that have conditional workflows but aren't enabled
      if (query.workflows && !query.workflows.some((w) => config.enabledWorkflows.includes(w))) {
        continue;
      }

      const queryStr = prepareQuery(query.query, config);
      const result = await runQuery(queryStr, config.connectionDataSource, sessionId);
      if (!result.ok) {
        setLoading(false);
        setCalloutLikeToast('Failed to add integration', 'danger', result.error.message);
        return;
      }
      sessionId = result.value.sessionId ?? sessionId;
    }
    // Once everything is ready, add the integration to the new datasource as usual
    const res = await addIntegrationRequest({
      addSample: false,
      templateName: integration.name,
      integration,
      setToast: setCalloutLikeToast,
      name: config.displayName,
      indexPattern: `flint_${config.connectionDataSource}_default_${config.connectionTableName}__*`,
      workflows: config.enabledWorkflows,
      skipRedirect: setIsInstalling ? true : false,
      dataSourceInfo: { dataSource: config.connectionDataSource, tableName: makeTableName(config) },
    });
    if (setIsInstalling) {
      setIsInstalling(false, res);
    }
    if (!res) {
      setLoading(false);
    }
  } else {
    console.error('Invalid data source type');
  }
};

const isConfigValid = (config: IntegrationSetupInputs, integration: IntegrationConfig): boolean => {
  if (config.displayName.length < 1 || config.connectionDataSource.length < 1) {
    return false;
  }
  if (config.connectionType === 's3') {
    if (integration.workflows && config.enabledWorkflows.length < 1) {
      return false;
    }
    return (
      config.connectionLocation.startsWith('s3://') && config.checkpointLocation.startsWith('s3://')
    );
  }
  return true;
};

export function SetupBottomBar({
  config,
  integration,
  loading,
  setLoading,
  setSetupCallout,
  unsetIntegration,
  setIsInstalling,
}: {
  config: IntegrationSetupInputs;
  integration: IntegrationConfig;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  setSetupCallout: (setupCallout: SetupCallout) => void;
  unsetIntegration?: () => void;
  setIsInstalling?: (isInstalling: boolean, success?: boolean) => void;
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
    <EuiFlexGroup justifyContent="flexEnd">
      <EuiFlexItem grow={false}>
        <EuiSmallButtonEmpty
          color="text"
          iconType="cross"
          onClick={() => {
            // If we can unset the integration, then just unset it.
            // Otherwise, remove `/setup` from the window location.
            if (unsetIntegration) {
              unsetIntegration();
              return;
            }
            let hash = window.location.hash;
            hash = hash.trim();
            hash = hash.substring(0, hash.lastIndexOf('/setup'));
            window.location.hash = hash;
          }}
          disabled={loading}
        >
          Discard
        </EuiSmallButtonEmpty>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiSmallButton
          fill
          iconType="arrowRight"
          iconSide="right"
          isLoading={loading}
          disabled={!isConfigValid(config, integration)}
          onClick={async () => {
            if (setIsInstalling) {
              setIsInstalling(true);
              await addIntegration({
                integration,
                config,
                setLoading: (newLoading: boolean) => {
                  setLoading(newLoading);
                  setIsInstalling(newLoading);
                },
                setCalloutLikeToast,
                setIsInstalling,
              });
            } else {
              await addIntegration({
                integration,
                config,
                setLoading,
                setCalloutLikeToast,
                setIsInstalling,
              });
            }
          }}
          data-test-subj="create-instance-button"
        >
          Add Integration
        </EuiSmallButton>
      </EuiFlexItem>
    </EuiFlexGroup>
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

export function SetupIntegrationForm({
  integration,
  renderType = 'page',
  unsetIntegration,
  forceConnection,
  notifications,
  dataSourceEnabled,
  dataSourceManagement,
  savedObjectsMDSClient,
  setIsInstalling,
}: {
  integration: string;
  renderType: 'page' | 'flyout';
  unsetIntegration?: () => void;
  forceConnection?: {
    name: string;
    type: string;
  };
  notifications: NotificationsStart;
  dataSourceEnabled: boolean;
  dataSourceManagement: DataSourceManagementPluginSetup;
  savedObjectsMDSClient: SavedObjectsStart;
  setIsInstalling?: (isInstalling: boolean, success?: boolean) => void;
}) {
  const [integConfig, setConfig] = useState({
    displayName: `${integration} Integration`,
    connectionType: forceConnection?.type ?? 'index',
    connectionDataSource: forceConnection?.name ?? '',
    connectionLocation: '',
    checkpointLocation: '',
    connectionTableName: integration,
    enabledWorkflows: [],
  });

  const [template, setTemplate] = useState({
    name: integration,
    type: '',
    assets: [],
    version: '',
    license: '',
    components: [],
  } as IntegrationConfig);

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

  const IntegrationInputFormComponent = SetupIntegrationFormInputs;
  const content = (
    <>
      {showLoading ? (
        <LoadingPage />
      ) : (
        <IntegrationInputFormComponent
          config={integConfig}
          updateConfig={updateConfig}
          integration={template}
          setupCallout={setupCallout}
          lockConnectionType={forceConnection !== undefined}
          dataSourceManagement={dataSourceManagement}
          notifications={notifications}
          dataSourceEnabled={dataSourceEnabled}
          savedObjectsMDSClient={savedObjectsMDSClient}
        />
      )}
    </>
  );

  const bottomBar = (
    <SetupBottomBar
      config={integConfig}
      integration={template}
      loading={showLoading}
      setLoading={setShowLoading}
      setSetupCallout={setSetupCallout}
      unsetIntegration={unsetIntegration}
      setIsInstalling={setIsInstalling}
    />
  );

  if (renderType === 'page') {
    return (
      <>
        <EuiPageContent>
          <EuiPageContentBody>{content}</EuiPageContentBody>
        </EuiPageContent>
        <EuiBottomBar>{bottomBar}</EuiBottomBar>
      </>
    );
  } else if (renderType === 'flyout') {
    return (
      <>
        <EuiFlyoutBody>
          {showLoading ? (
            <LoadingPage />
          ) : (
            <SetupIntegrationFormInputs
              config={integConfig}
              updateConfig={updateConfig}
              integration={template}
              setupCallout={setupCallout}
              lockConnectionType={forceConnection !== undefined}
            />
          )}
        </EuiFlyoutBody>
        <EuiFlyoutFooter>
          <SetupBottomBar
            config={integConfig}
            integration={template}
            loading={showLoading}
            setLoading={setShowLoading}
            setSetupCallout={setSetupCallout}
            unsetIntegration={unsetIntegration}
            setIsInstalling={setIsInstalling}
          />
        </EuiFlyoutFooter>
      </>
    );
  }
}

export function SetupIntegrationPage({
  integration,
  unsetIntegration,
  notifications,
  dataSourceEnabled,
  dataSourceManagement,
  savedObjectsMDSClient,
}: {
  integration: string;
  unsetIntegration?: () => void;
  notifications: NotificationsStart;
  dataSourceEnabled: boolean;
  dataSourceManagement: DataSourceManagementPluginSetup;
  savedObjectsMDSClient: SavedObjectsStart;
}) {
  return (
    <EuiPage>
      <EuiPageBody>
        <SetupIntegrationForm
          integration={integration}
          unsetIntegration={unsetIntegration}
          renderType="page"
          dataSourceManagement={dataSourceManagement}
          notifications={notifications}
          dataSourceEnabled={dataSourceEnabled}
          savedObjectsMDSClient={savedObjectsMDSClient}
        />
      </EuiPageBody>
    </EuiPage>
  );
}
