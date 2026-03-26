/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OSD-specific Cypress commands for workspace and dataset management
 */

// Default fields for dataset creation (minimal set)
const defaultFieldsForDatasetCreation = [
  {
    name: '_source',
    type: '_source',
    esTypes: ['_source'],
    searchable: false,
    aggregatable: false,
    readFromDocValues: false,
  },
];

// Initialize osd namespace
if (!cy.osd) {
  cy.osd = {};
}

/**
 * Adds a command to the cy.osd namespace
 */
const addCommand = (name, fn) => {
  cy.osd[name] = fn;
};

/**
 * Creates or gets a data source for the local OpenSearch cluster
 * @param {string} dataSourceName - Name for the data source
 * @param {string} endpoint - Optional endpoint URL
 */
addCommand('createOrGetLocalDataSource', (dataSourceName, endpoint) => {
  const baseUrl = endpoint || Cypress.config('baseUrl') || '';
  const opensearchUrl = Cypress.env('opensearch') || 'localhost:9200';
  const datasourceUrl = `http://${opensearchUrl}`;

  // First, try to find existing data source
  cy.request({
    method: 'GET',
    url: `${baseUrl}/api/saved_objects/_find`,
    headers: {
      'osd-xsrf': true,
    },
    qs: {
      per_page: 100,
      type: 'data-source',
      search: dataSourceName,
      search_fields: 'title',
    },
  }).then((resp) => {
    const savedObjects = (resp.body && resp.body.saved_objects) || [];
    const dataSource = savedObjects.find(
      (obj) => obj.attributes && obj.attributes.title === dataSourceName
    );

    if (dataSource) {
      cy.log(`Found existing data source: ${dataSourceName} (ID: ${dataSource.id})`);
      cy.wrap(dataSource.id).as('DATASOURCE_ID');
    } else {
      // Create the data source using the proper OSD pattern
      cy.log(`Creating data source: ${dataSourceName}`);

      // Step 1: Fetch data source metadata
      cy.request({
        method: 'POST',
        url: `${baseUrl}/internal/data-source-management/fetchDataSourceMetaData`,
        headers: {
          'osd-xsrf': true,
        },
        body: {
          dataSourceAttr: {
            endpoint: datasourceUrl,
            auth: {
              type: 'no_auth',
            },
          },
        },
      }).then((metadataResp) => {
        expect(metadataResp.status).to.be.oneOf([200, 201]);
        const datasourceMetaData = metadataResp.body;

        // Step 2: Create data source with metadata
        cy.request({
          method: 'POST',
          url: `${baseUrl}/api/saved_objects/data-source`,
          headers: {
            'osd-xsrf': true,
          },
          body: {
            attributes: {
              title: dataSourceName,
              description: '',
              endpoint: datasourceUrl,
              auth: {
                type: 'no_auth',
              },
              ...datasourceMetaData,
            },
          },
          failOnStatusCode: false,
        }).then((createResp) => {
          expect(createResp.status).to.be.oneOf([200, 201]);
          cy.log(`Created data source: ${dataSourceName} (ID: ${createResp.body.id})`);
          cy.wrap(createResp.body.id).as('DATASOURCE_ID');
        });
      });
    }
  });
});

/**
 * Gets a data source ID by name
 * @param {string} dataSourceName - Name of the data source
 * @param {string} endpoint - Optional endpoint URL
 */
addCommand('getDataSourceId', (dataSourceName, endpoint) => {
  const baseUrl = endpoint || Cypress.config('baseUrl') || '';

  cy.request({
    method: 'GET',
    url: `${baseUrl}/api/saved_objects/_find`,
    headers: {
      'osd-xsrf': true,
    },
    qs: {
      per_page: 100,
      type: 'data-source',
      search: dataSourceName,
      search_fields: 'title',
    },
  }).then((resp) => {
    const savedObjects = (resp.body && resp.body.saved_objects) || [];

    // Find the data source with exact name match
    const dataSource = savedObjects.find((obj) => obj.attributes && obj.attributes.title === dataSourceName);

    if (!dataSource) {
      throw new Error(`Data source with name "${dataSourceName}" not found`);
    }

    // Log the ID
    cy.log(`Found data source: ${dataSource.attributes && dataSource.attributes.title} (ID: ${dataSource.id})`);

    // Save the data source ID as an alias for later use
    cy.wrap(dataSource.id).as('DATASOURCE_ID');
  });
});

/**
 * Creates a dataset (index pattern) by making an API request to the endpoint
 * @param {string} datasetId - The unique ID for the dataset to be created
 * @param {string} workspaceId - The ID of the workspace where the dataset will be created
 * @param {string} datasourceId - The ID of the data source to associate with the dataset
 * @param {Object} options - Configuration options for the dataset
 * @param {string} options.title - The title/name of the dataset
 * @param {string} [options.displayName] - Optional display name for the dataset
 * @param {string} [options.signalType] - Signal type for the dataset (default: "logs")
 * @param {string} options.timestamp - The name of the time field
 * @param {Array} [options.fields] - Optional fields array, defaults to defaultFieldsForDatasetCreation
 * @param {string} [options.schemaMappings] - Optional schema mappings JSON string
 * @param {string} aliasName - The alias name to save the dataset ID under
 * @param {string} [endpoint] - Optional endpoint URL, defaults to baseUrl from Cypress config
 */
addCommand(
  'createDatasetByEndpoint',
  (datasetId, workspaceId, datasourceId, options, aliasName, endpoint) => {
    const baseUrl = endpoint || Cypress.config('baseUrl') || '';
    const fields = options.fields || defaultFieldsForDatasetCreation;

    // Build attributes object conditionally
    const attributes = {
      title: options.title,
      displayName: options.displayName || '',
      signalType: options.signalType || 'logs',
      fields: fields,
      schemaMappings: options.schemaMappings || '{}',
    };

    // Only include timeFieldName if timestamp is provided
    if (options.timestamp) {
      attributes.timeFieldName = options.timestamp;
    }

    cy.request({
      method: 'POST',
      url: `${baseUrl}/api/saved_objects/index-pattern/${datasourceId}::${datasetId}`,
      headers: {
        'osd-xsrf': true,
      },
      body: {
        attributes: attributes,
        references: [
          {
            id: datasourceId,
            type: 'OpenSearch',
            name: 'dataSource',
          },
        ],
        workspaces: [workspaceId],
      },
    }).then((response) => {
      // Validate successful response
      expect(response.status).to.be.oneOf([200, 201]);
      expect(response.body).to.have.property('id');

      // Log success
      cy.log(`Dataset created successfully: ${options.title} (ID: ${response.body.id})`);

      // Save the dataset ID as an alias
      cy.wrap(response.body.id).as(aliasName);

      // Save the dataset ID to environment as well
      Cypress.env(aliasName, response.body.id);
    });
  }
);

/**
 * Creates a workspace with a specific data source ID
 * @param {string} datasourceId - The ID of the data source to associate with the workspace
 * @param {string} workspaceName - The name for the workspace
 * @param {string|string[]} useCase - Use case feature(s) (e.g., 'use-case-observability' or ['use-case-observability'])
 * @param {string} [aliasName] - Optional custom alias name, defaults to 'WORKSPACE_ID'
 * @param {string} [endpoint] - Optional endpoint URL, defaults to baseUrl from Cypress config
 */
addCommand(
  'createWorkspaceWithDataSourceId',
  (datasourceId, workspaceName, useCase, aliasName = 'WORKSPACE_ID', endpoint) => {
    const baseUrl = endpoint || Cypress.config('baseUrl') || '';

    // Normalize useCase to array
    const features = Array.isArray(useCase) ? useCase : (useCase ? [useCase] : ['use-case-observability']);

    cy.createWorkspaceWithEndpoint(baseUrl, {
      name: workspaceName,
      features: features,
      settings: {
        permissions: {
          library_write: { users: ['%me%'] },
          write: { users: ['%me%'] },
        },
        dataSources: [datasourceId],
        dataConnections: [],
      },
    }).then((response) => {
      // Validate successful response
      expect(response).to.have.property('id');

      // Log success
      cy.log(`Workspace created successfully: ${workspaceName} (ID: ${response.id})`);

      // Save the workspace ID as an alias (with custom name to avoid conflicts)
      cy.wrap(response.id).as(aliasName);

      // Also store in Cypress env for persistence across runs
      Cypress.env(aliasName, response.id);
    });
  }
);

/**
 * Creates a workspace using API endpoint
 * @param {string} endpoint - The base URL endpoint
 * @param {Object} config - Workspace configuration
 * @param {string} config.name - Workspace name
 * @param {string[]} config.features - Features array (e.g., ['use-case-observability'])
 * @param {Object} config.settings - Workspace settings (dataSources, dataConnections, permissions)
 */
Cypress.Commands.add('createWorkspaceWithEndpoint', (endpoint, { settings, ...workspace } = {}) => {
  return cy
    .request({
      method: 'POST',
      url: `${endpoint}/api/workspaces`,
      headers: {
        'osd-xsrf': true,
      },
      body: {
        attributes: {
          ...workspace,
          features: workspace.features || ['use-case-observability'],
          description: workspace.description || 'Observability test workspace',
        },
        settings,
      },
      failOnStatusCode: false,
    })
    .then((resp) => {
      if (resp && resp.body && resp.body.success) {
        return resp.body.result;
      } else {
        const errorMsg = resp && resp.body && resp.body.error ? resp.body.error : 'Unknown error';
        throw new Error(`Create workspace ${workspace.name} failed: ${errorMsg}`);
      }
    });
});
