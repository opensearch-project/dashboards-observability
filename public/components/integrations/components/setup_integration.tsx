/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiBottomBar,
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
  EuiSmallButton,
  EuiSmallButtonEmpty,
} from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { NotificationsStart, SavedObjectsStart } from '../../../../../../src/core/public';
import { DataSourceManagementPluginSetup } from '../../../../../../src/plugins/data_source_management/public';
import { Color } from '../../../../common/constants/integrations';
import { INTEGRATIONS_BASE } from '../../../../common/constants/shared';
import { SQLService } from '../../../../public/services/requests/sql';
import { coreRefs } from '../../../framework/core_refs';
import { addIntegrationRequest } from './create_integration_helpers';
import { SetupIntegrationFormInputs } from './setup_integration_inputs';
import { generateTimestampFilter } from './integraiton_timefield_strategies';

/**
 * Configuration inputs for integration setup
 */
export interface IntegrationSetupInputs {
  displayName: string;
  connectionType: string;
  connectionDataSource: string;
  connectionLocation: string;
  checkpointLocation: string;
  /** Name of the database to connect to */
  databaseName: string;
  connectionTableName: string;
  enabledWorkflows: string[];
  refreshRangeDays: number;
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
  handleSelectedDataSourceChange: (dataSourceMDSId?: string, dataSourceMDSLabel?: string) => void;
}

/**
 * Interface for the parameters used in the addIntegration function
 */
interface AddIntegrationParams {
  /** Configuration settings for the integration setup */
  config: IntegrationSetupInputs;

  /** Integration configuration details */
  integration: IntegrationConfig;

  /** Callback function to set loading state */
  setLoading: (loading: boolean) => void;

  /** Callback function to display toast notifications */
  setCalloutLikeToast: (title: string, color?: Color, text?: string) => void;

  /** Optional MDS ID for the data source */
  dataSourceMDSId?: string;

  /** Optional MDS label for the data source */
  dataSourceMDSLabel?: string;

  /** Optional callback to set installation status */
  setIsInstalling?: (isInstalling: boolean, success?: boolean) => void;
}

type SetupCallout = { show: true; title: string; color?: Color; text?: string } | { show: false };

const sqlService = new SQLService(coreRefs.http!);

const runQuery = async (
  query: string,
  datasource: string,
  sessionId: string | undefined,
  dataSourceMDSId?: string
): Promise<Result<{ poll: object; sessionId: string }>> => {
  // Used for polling
  const sleep = (ms: number) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };

  try {
    const queryResponse: { queryId: string; sessionId: string } = await sqlService.fetch(
      {
        query,
        datasource,
        lang: 'sql',
        sessionId,
      },
      dataSourceMDSId
    );

    let poll: { status: string; error?: string } = { status: 'undefined' };
    const { queryId, sessionId: newSessionId } = queryResponse;

    while (!poll.error) {
      poll = await sqlService.fetchWithJobId({ queryId }, dataSourceMDSId);

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

/**
 * Constructs a fully qualified table name from the integration configuration.
 *
 * @param config - The integration setup configuration object
 * @param config.connectionDataSource - The data source connection name
 * @param config.databaseName - The database name (defaults to 'default' if not provided)
 * @param config.connectionTableName - The table name
 * @returns A string representing the fully qualified table name in the format: dataSource.database.table
 */
const makeTableName = (config: IntegrationSetupInputs): string => {
  return `${config.connectionDataSource}.${config.databaseName}.${config.connectionTableName}`;
};

const prepareQuery = (query: string, config: IntegrationSetupInputs): string => {
  // To prevent checkpoint collisions, each query needs a unique checkpoint name, we use an enriched
  // UUID to create subfolders under the given checkpoint location per-query.
  const querySpecificUUID = crypto.randomUUID();
  let checkpointLocation = config.checkpointLocation.endsWith('/')
    ? config.checkpointLocation
    : config.checkpointLocation + '/';
  checkpointLocation += `${config.connectionDataSource}-${config.connectionTableName}-${querySpecificUUID}`;

  // Generate refresh range filter using universal @timestamp filter
  const refreshRangeFilter = generateTimestampFilter(config.refreshRangeDays);

  let queryStr = query.replaceAll('{table_name}', makeTableName(config));
  queryStr = queryStr.replaceAll('{s3_bucket_location}', config.connectionLocation);
  queryStr = queryStr.replaceAll('{s3_checkpoint_location}', checkpointLocation);
  queryStr = queryStr.replaceAll('{object_name}', config.connectionTableName);
  queryStr = queryStr.replaceAll('{refresh_range_filter}', refreshRangeFilter);
  // TODO spark API only supports single-line queries, but directly replacing all whitespace leads
  // to issues with single-line comments and quoted strings with more whitespace. A more robust
  // implementation would remove comments before flattening and ignore strings.
  queryStr = queryStr.replaceAll(/\s+/g, ' ');
  return queryStr;
};

/**
 * Handles the integration setup process based on the connection type.
 *
 * @throws {Error} Throws an error if the connection type is invalid
 * @returns {Promise<void>} A promise that resolves when the integration is added
 */
const addIntegration = async ({
  config,
  integration,
  setLoading,
  setCalloutLikeToast,
  dataSourceMDSId,
  dataSourceMDSLabel,
  setIsInstalling,
}: AddIntegrationParams): Promise<void> => {
  setLoading(true);

  if (config.connectionType === 'index') {
    await addNativeIntegration({
      config,
      integration,
      setLoading,
      setCalloutLikeToast,
      dataSourceMDSId,
      dataSourceMDSLabel,
      setIsInstalling,
    });
  } else if (config.connectionType === 's3') {
    await addFlintIntegration({
      config,
      integration,
      setLoading,
      setCalloutLikeToast,
      dataSourceMDSId,
      dataSourceMDSLabel,
      setIsInstalling,
    });
  } else {
    console.error('Invalid data source type');
    setLoading(false);
  }
};

/**
 * Handles the installation of an integration index by processing the configuration and making the integration request.
 *
 * @returns {Promise<void>} A promise that resolves when the installation is complete
 *
 */
const addNativeIntegration = async ({
  config,
  integration,
  setLoading,
  setCalloutLikeToast,
  dataSourceMDSId,
  dataSourceMDSLabel,
  setIsInstalling,
}: AddIntegrationParams): Promise<void> => {
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
    dataSourceMDSId,
    dataSourceMDSLabel,
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
};

/**
 * Handles the installation process for S3 integration by creating a database (if specified),
 * processing integration assets, and executing necessary queries.
 *
 * @returns {Promise<void>} A promise that resolves when the installation is complete
 *
 * @throws Will set error toast if database creation fails or integration addition fails
 */
const addFlintIntegration = async ({
  config,
  integration,
  setLoading,
  setCalloutLikeToast,
  dataSourceMDSId,
  dataSourceMDSLabel,
  setIsInstalling,
}: AddIntegrationParams): Promise<void> => {
  let sessionId: string | undefined;

  // Create database if specified
  const dbResult = await createDatabase(
    config,
    sessionId,
    dataSourceMDSId,
    setLoading,
    setCalloutLikeToast
  );

  if (!dbResult.success) {
    return;
  }
  sessionId = dbResult.sessionId;

  // Process integration assets
  const http = coreRefs.http!;
  const assets: { data: ParsedIntegrationAsset[] } = await http.get(
    `${INTEGRATIONS_BASE}/repository/${integration.name}/assets`
  );

  // Execute queries
  for (const query of assets.data.filter(
    (a: ParsedIntegrationAsset): a is ParsedIntegrationAsset & { type: 'query' } =>
      a.type === 'query'
  )) {
    if (query.workflows && !query.workflows.some((w) => config.enabledWorkflows.includes(w))) {
      continue;
    }

    const queryStr = prepareQuery(query.query, config);
    const result = await runQuery(
      queryStr,
      config.connectionDataSource,
      sessionId,
      dataSourceMDSId
    );

    if (!result.ok) {
      setLoading(false);
      setCalloutLikeToast('Failed to add integration', 'danger', result.error.message);
      return;
    }
    sessionId = result.value.sessionId ?? sessionId;
  }

  // Add integration to the new datasource
  const res = await addIntegrationRequest({
    addSample: false,
    templateName: integration.name,
    integration,
    setToast: setCalloutLikeToast,
    dataSourceMDSId,
    dataSourceMDSLabel,
    name: config.displayName,
    indexPattern: `flint_${config.connectionDataSource}_${config.databaseName}_${config.connectionTableName}__*`,
    workflows: config.enabledWorkflows,
    skipRedirect: setIsInstalling ? true : false,
    dataSourceInfo: {
      dataSource: config.connectionDataSource,
      tableName: makeTableName(config),
    },
  });

  if (setIsInstalling) {
    setIsInstalling(false, res);
  }
  if (!res) {
    setLoading(false);
  }
};

/**
 * Creates a database if it doesn't already exist using the provided configuration.
 *
 * @param config - Configuration object containing database details
 * @param config.databaseName - Name of the database to create
 * @param config.connectionDataSource - Data source connection string
 * @param sessionId - Current session identifier
 * @param dataSourceMDSId - Data source MDS identifier
 * @param setLoading - Callback function to update loading state
 * @param setCalloutLikeToast - Callback function to display toast notifications
 * @param setCalloutLikeToast.message - Message to display in the toast
 * @param setCalloutLikeToast.type - Type of toast notification (e.g., 'danger')
 * @param setCalloutLikeToast.details - Optional details for the toast message
 *
 * @returns Promise resolving to an object containing:
 *          - success: boolean indicating if the operation was successful
 *          - sessionId: the current or updated session identifier
 *
 */
const createDatabase = async (
  config: { databaseName: string; connectionDataSource: string },
  sessionId: string,
  dataSourceMDSId: string,
  setLoading: (loading: boolean) => void,
  setCalloutLikeToast: (message: string, type: string, details?: string) => void
): Promise<{ success: boolean; sessionId: string }> => {
  if (!config.databaseName) {
    return { success: true, sessionId };
  }

  const createDbQuery = `CREATE DATABASE IF NOT EXISTS ${config.databaseName}`;
  const result = await runQuery(
    createDbQuery,
    config.connectionDataSource,
    sessionId,
    dataSourceMDSId
  );

  if (!result.ok) {
    setLoading(false);
    setCalloutLikeToast('Failed to create database', 'danger', result.error.message);
    return { success: false, sessionId };
  }

  return { success: true, sessionId: result.value.sessionId };
};

const isConfigValid = (config: IntegrationSetupInputs, integration: IntegrationConfig): boolean => {
  if (config.displayName.length < 1 || config.connectionDataSource.length < 1) {
    return false;
  }

  // Add database name validation
  if (config.databaseName && !/^[a-zA-Z0-9_]+$/.test(config.databaseName)) {
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
  dataSourceMDSId,
  dataSourceMDSLabel,
  unsetIntegration,
  setIsInstalling,
}: {
  config: IntegrationSetupInputs;
  integration: IntegrationConfig;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  setSetupCallout: (setupCallout: SetupCallout) => void;
  dataSourceMDSId?: string;
  dataSourceMDSLabel?: string;
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
                dataSourceMDSId,
                dataSourceMDSLabel,
                setIsInstalling,
              });
            } else {
              await addIntegration({
                integration,
                config,
                setLoading,
                setCalloutLikeToast,
                dataSourceMDSId,
                dataSourceMDSLabel,
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
    databaseName: 'default',
    enabledWorkflows: [],
    refreshRangeDays: 7,
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
  const [dataSourceMDSId, setDataSourceMDSId] = useState<string>('');
  const [dataSourceMDSLabel, setDataSourceMDSLabel] = useState<string>('');

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
  const handleSelectedDataSourceChange = (id?: string, label?: string) => {
    setDataSourceMDSId(id);
    setDataSourceMDSLabel(label);
  };

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
          handleSelectedDataSourceChange={handleSelectedDataSourceChange}
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
      dataSourceMDSId={dataSourceMDSId}
      dataSourceMDSLabel={dataSourceMDSLabel}
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
