/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Helper functions for observability plugin Cypress tests
 */

const endpoint = Cypress.config().baseUrl || '';

/**
 * Creates a workspace with datasource and observability features
 * @param {string} datasourceName - The name of the datasource (e.g., 'default')
 * @param {string} workspaceName - The name of the workspace to create
 * @param {string[]} features - Array of features to enable (defaults to observability)
 */
export const createObservabilityWorkspace = (
  datasourceName,
  workspaceName,
  features = ['use-case-observability']
) => {
  // Create or get the data source (handles case where it doesn't exist yet)
  cy.osd.createOrGetLocalDataSource(datasourceName);

  cy.get('@DATASOURCE_ID').then((datasourceId) => {
    cy.osd.createWorkspaceWithDataSourceId(
      datasourceId,
      workspaceName,
      features,
      `${workspaceName}:WORKSPACE_ID`
    );
  });
};

/**
 * Creates a dataset for observability data (traces, logs, services)
 * @param {string} datasourceName - The name of the datasource
 * @param {string} workspaceName - The name of the workspace
 * @param {string} datasetId - Unique ID for this dataset
 * @param {Object} config - Dataset configuration
 * @param {string} config.title - Index pattern (e.g., 'otel_v1_apm_span_explore')
 * @param {string} config.signalType - Signal type: 'traces', 'logs', etc.
 * @param {string} config.timestamp - Timestamp field name
 * @param {Array} [config.fields] - Optional field definitions
 * @param {string} [config.schemaMappings] - Optional schema mappings for correlations
 */
export const createObservabilityDataset = (
  datasourceName,
  workspaceName,
  datasetId,
  config
) => {
  // Create or get the data source (handles case where it doesn't exist yet)
  cy.osd.createOrGetLocalDataSource(datasourceName);

  cy.get('@DATASOURCE_ID').then((datasourceId) => {
    cy.get(`@${workspaceName}:WORKSPACE_ID`).then((workspaceId) => {
      cy.osd.createDatasetByEndpoint(
        datasetId,
        workspaceId,
        datasourceId,
        config,
        `${datasetId}:DATASET_ID`
      );
    });
  });
};

/**
 * Creates a Prometheus data connection
 * @param {string} connectionName - Name for the Prometheus connection
 * @param {string} prometheusUrl - Prometheus URL
 * @returns {Cypress.Chainable} Promise that resolves when connection is created
 */
export const createPrometheusDataConnection = (connectionName, prometheusUrl) => {
  return cy
    .request({
      method: 'POST',
      url: `${endpoint}/api/directquery/dataconnections`,
      headers: {
        'osd-xsrf': true,
        'content-type': 'application/json',
      },
      body: {
        name: connectionName,
        allowedRoles: [],
        connector: 'prometheus',
        properties: {
          'prometheus.uri': prometheusUrl,
        },
      },
      failOnStatusCode: false,
    })
    .then((resp) => {
      if (resp.status === 200 || resp.status === 409) {
        cy.log(`Prometheus data connection '${connectionName}' created or already exists`);
      } else {
        cy.log(`Create data connection response: ${JSON.stringify(resp.body)}`);
      }
    });
};

/**
 * Gets the saved object ID for a Prometheus data connection
 * @param {string} connectionName - Name of the connection to find
 * @returns {Cypress.Chainable<string>} Promise that resolves with the connection ID
 */
export const getPrometheusConnectionId = (connectionName) => {
  return cy
    .request({
      method: 'GET',
      url: `${endpoint}/api/saved_objects/_find`,
      headers: { 'osd-xsrf': true },
      qs: { per_page: 10000, type: 'data-connection' },
    })
    .then((resp) => {
      const savedObjects = (resp.body && resp.body.saved_objects) || [];
      const connection = savedObjects.find(
        (savedObject) => savedObject.attributes.connectionId === connectionName
      );
      expect(connection).to.exist;
      return connection.id;
    });
};

/**
 * Adds a Prometheus data connection to an existing workspace
 * @param {string} workspaceId - The workspace ID
 * @param {string} workspaceName - The workspace name
 * @param {string} dataConnectionId - The Prometheus connection saved object ID
 * @param {string} datasourceId - The OpenSearch data source ID to preserve
 * @param {string[]} features - Array of features for the workspace
 */
export const addPrometheusToWorkspace = (
  workspaceId,
  workspaceName,
  dataConnectionId,
  datasourceId,
  features = ['use-case-observability']
) => {
  return cy
    .request({
      method: 'PUT',
      url: `${endpoint}/api/workspaces/${workspaceId}`,
      headers: { 'osd-xsrf': true },
      body: {
        attributes: {
          name: workspaceName,
          features: features,
        },
        settings: {
          dataSources: [datasourceId],
          dataConnections: [dataConnectionId],
          permissions: {
            library_write: { users: ['%me%'] },
            write: { users: ['%me%'] },
          },
        },
      },
    })
    .then((resp) => {
      if (!resp || !resp.body || !resp.body.success) {
        throw new Error(
          `Failed to add Prometheus connection to workspace: ${JSON.stringify(resp)}`
        );
      }
      cy.log(`Added Prometheus connection to workspace ${workspaceName}`);
    });
};

/**
 * Sets up a complete APM test environment with workspace, datasets, and Prometheus
 * @param {Object} config - Configuration object
 * @param {string} config.datasourceName - Datasource name (usually 'default')
 * @param {string} config.workspaceName - Workspace name
 * @param {string} config.prometheusConnectionName - Prometheus connection name
 * @param {string} config.prometheusUrl - Prometheus URL
 * @param {Object} config.datasets - Dataset configurations
 * @param {Object} config.datasets.trace - Trace dataset config
 * @param {Object} config.datasets.service - Service dataset config
 * @param {Object} config.datasets.log - Log dataset config
 * @returns {Cypress.Chainable} Promise that resolves when setup is complete
 */
export const setupAPMTestEnvironment = (config) => {
  const {
    datasourceName,
    workspaceName,
    prometheusConnectionName,
    prometheusUrl,
    datasets,
  } = config;

  // Step 1: Create workspace with observability features
  createObservabilityWorkspace(datasourceName, workspaceName);

  // Step 2: Create Prometheus data connection
  createPrometheusDataConnection(prometheusConnectionName, prometheusUrl);

  // Step 3: Get Prometheus connection ID and add to workspace
  getPrometheusConnectionId(prometheusConnectionName).then((dcId) => {
    cy.get(`@${workspaceName}:WORKSPACE_ID`).then((wsId) => {
      cy.get('@DATASOURCE_ID').then((dsId) => {
        addPrometheusToWorkspace(wsId, workspaceName, dcId, dsId);
      });
    });
  });

  // Step 4: Create datasets for traces, services, and logs
  if (datasets.trace) {
    createObservabilityDataset(
      datasourceName,
      workspaceName,
      datasets.trace.id,
      datasets.trace.config
    );
  }

  if (datasets.service) {
    createObservabilityDataset(
      datasourceName,
      workspaceName,
      datasets.service.id,
      datasets.service.config
    );
  }

  if (datasets.log) {
    createObservabilityDataset(
      datasourceName,
      workspaceName,
      datasets.log.id,
      datasets.log.config
    );
  }

  return cy.get(`@${workspaceName}:WORKSPACE_ID`);
};

/**
 * Cleans up workspace and associated resources after tests
 * @param {string} workspaceName - Name of workspace to clean up
 */
export const cleanupObservabilityWorkspace = (workspaceName) => {
  const wsId = Cypress.env(`${workspaceName}:WORKSPACE_ID`);
  if (wsId) {
    cy.request({
      method: 'DELETE',
      url: `${endpoint}/api/workspaces/${wsId}`,
      headers: { 'osd-xsrf': true },
      failOnStatusCode: false,
    });
  }
};
