/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const delay = 1000;
export const timeoutDelay = 30000;
export const TYPING_DELAY = 450;

export const loadAllData = () => {
  // flights and web logs, not using ecommerce currently
  loadAllSampleData();

  loadOtelData();
}

export const loadOtelData = () => {
  testIndexDataSet.forEach(({ mapping_url, data_url, index }) =>
    dumpDataSet(mapping_url, data_url, index)
  );
}

export const loadAllSampleData = () => {
  // Deleting all indices, cypress doesn't support conditionals in any way so to create a single
  //  line of execution, need to start from a clean slate
  cy.request(
    'DELETE',
    `${Cypress.env('opensearch')}/index*,sample*,opensearch_dashboards*,test*,cypress*`
  );

  cy.visit(`${Cypress.env('opensearchDashboards')}/app/home#/tutorial_directory`);

  // Load sample flights data
  cy.get(`button[data-test-subj="addSampleDataSetflights"]`).click({
    force: true,
  });
  // Load sample logs data
  cy.get(`button[data-test-subj="addSampleDataSetlogs"]`).click({
    force: true,
  });

  // Verify that sample data is add by checking toast notification
  cy.contains('Sample flight data installed', { timeout: 60000 });
  cy.contains('Sample web logs installed', { timeout: 60000 });
}

// took dumpDataSet and testIndexDataSet from https://github.com/opensearch-project/opensearch-dashboards-functional-test/blob/main/cypress/integration/plugins/observability-dashboards/0_before.spec.js
const dumpDataSet = (mapping_url, data_url, index) => {
  cy.request({
    method: 'PUT',
    failOnStatusCode: false,
    url: `${Cypress.env('opensearch')}/${index}`,
    headers: {
      'content-type': 'application/json;charset=UTF-8',
      'osd-xsrf': true,
    },
  });

  cy.request(mapping_url).then((response) => {
    cy.request({
      method: 'POST',
      form: false,
      url: `${Cypress.env('opensearch')}/${index}/_mapping`,
      headers: {
        'content-type': 'application/json;charset=UTF-8',
        'osd-xsrf': true,
      },
      body: response.body,
    });
  });

  cy.request(data_url).then((response) => {
    cy.request({
      method: 'POST',
      form: false,
      url: `${Cypress.env('opensearch')}/${index}/_bulk`,
      headers: {
        'content-type': 'application/json;charset=UTF-8',
        'osd-xsrf': true,
      },
      body: response.body,
    });
  });
};

const testIndexDataSet = [
  {
    mapping_url:
      'https://raw.githubusercontent.com/opensearch-project/dashboards-observability/main/.cypress/utils/otel-v1-apm-service-map-mappings.json',
    data_url:
      'https://raw.githubusercontent.com/opensearch-project/dashboards-observability/main/.cypress/utils/otel-v1-apm-service-map.json',
    index: 'otel-v1-apm-service-map',
  },
  {
    mapping_url:
      'https://raw.githubusercontent.com/opensearch-project/dashboards-observability/main/.cypress/utils/otel-v1-apm-span-000001-mappings.json',
    data_url:
      'https://raw.githubusercontent.com/opensearch-project/dashboards-observability/main/.cypress/utils/otel-v1-apm-span-000001.json',
    index: 'otel-v1-apm-span-000001',
  },
  {
    mapping_url:
      'https://raw.githubusercontent.com/opensearch-project/dashboards-observability/main/.cypress/utils/otel-v1-apm-span-000001-mappings.json',
    data_url:
      'https://raw.githubusercontent.com/opensearch-project/dashboards-observability/main/.cypress/utils/otel-v1-apm-span-000002.json',
    index: 'otel-v1-apm-span-000002',
  },
];

export const moveToHomePage = () => {
  cy.visit(`${Cypress.env('opensearchDashboards')}/app/observability-applications#/`);
  cy.get('.euiTitle').contains('Applications').should('exist');
};

export const moveToCreatePage = () => {
  cy.visit(`${Cypress.env('opensearchDashboards')}/app/observability-applications#/`);
  cy.get('.euiButton[href="#/create"]').eq(0).click();
  cy.get('[data-test-subj="createPageTitle"]').should('contain', 'Create application');
};

export const moveToApplication = (name) => {
  cy.visit(`${Cypress.env('opensearchDashboards')}/app/observability-applications#/`);
  cy.get('.euiTableRow').should('have.length.greaterThan', 0);//Replaces Wait
  cy.get(`[data-test-subj="${name}ApplicationLink"]`).click();
  cy.get('.euiTableRow').should('have.length.lessThan', 1);//Replaces Wait
  cy.get('[data-test-subj="applicationTitle"]').should('contain', name);
  changeTimeTo24('years');
};

export const moveToEditPage = () => {
  moveToApplication(nameOne);
  cy.get('[data-test-subj="app-analytics-configTab"]').click();
  cy.get('[data-test-subj="editApplicationButton"]').click();
  cy.get('[data-test-subj="createPageTitle"]').should('contain', 'Edit application');
};

export const changeTimeTo24 = (timeUnit) => {
  cy.get('[data-test-subj="superDatePickerToggleQuickMenuButton"]').trigger('mouseover').click({ force: true });
  cy.get('[aria-label="Time value"]').type('{selectall}24');
  cy.get('[aria-label="Time unit"]').select(timeUnit);
  cy.get('.euiButton').contains('Apply').click();
  cy.get('[data-test-subj="superDatePickerApplyTimeButton"]').click();
  cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
};

export const expectMessageOnHover = (button, message) => {
  cy.get(`[data-test-subj="${button}"]`).click({ force: true });
  cy.get('.euiToolTipPopover').contains(message).should('exist');
};

export const moveToPanelHome = () => {
  cy.visit(
    `${Cypress.env('opensearchDashboards')}/app/observability-dashboards#/operational_panels/`
  );
  cy.wait(delay * 3);
};

export const deleteAllSavedApplications = () => {
  moveToHomePage();
  cy.get('[data-test-subj="checkboxSelectAll"]').click();
  cy.get('.euiPopover').contains('Actions').click();
  cy.get('.euiContextMenuItem').contains('Delete').click();
  cy.get('.euiButton__text').contains('Delete').click();
};

export const uniqueId = Date.now();
export const baseQuery = 'source = opensearch_dashboards_sample_data_flights';
export const nameOne = `Cypress-${uniqueId}`;
export const nameTwo = `Pine-${uniqueId}`;
export const nameThree = `Cedar-${uniqueId}`;
export const description = 'This is my application for cypress testing.';
export const service_one = 'order';
export const service_two = 'payment';
export const trace_one = 'HTTP POST';
export const trace_two = 'HTTP GET';
export const trace_three = 'client_pay_order';
export const query_one = 'where DestCityName = "Venice" | stats count() by span( timestamp , 6h )';
export const query_two = 'where OriginCityName = "Seoul" | stats count() by span( timestamp , 6h )';
export const availability_default = 'stats count() by span( timestamp, 1h )';
export const visOneName = 'Flights to Venice';
export const visTwoName = 'Flights from Seoul';
export const composition = 'order, payment, HTTP POST, HTTP GET, client_pay_order'
export const newName = `Monterey Cypress-${uniqueId}`;
