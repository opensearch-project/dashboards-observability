/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

import {
  TEST_INTEGRATION_INSTANCE, TEST_SAMPLE_INSTANCE,
} from '../utils/constants';

let testInstanceSuffix = (Math.random() + 1).toString(36).substring(7);
let testInstance = `${TEST_INTEGRATION_INSTANCE}_${testInstanceSuffix}`;

const moveToIntegrationsHome = () => {
  cy.visit(`${Cypress.env('opensearchDashboards')}/app/integrations#/available`);
};

const moveToAvailableNginxIntegration = () => {
  cy.visit(`${Cypress.env('opensearchDashboards')}/app/integrations#/available/nginx`);
};

const moveToAddedIntegrations = () => {
  cy.visit(`${Cypress.env('opensearchDashboards')}/app/integrations#/installed`);
};

const createSamples = () => {
  moveToAvailableNginxIntegration();
  cy.get('[data-test-subj="try-it-button"]').click();
  cy.get('.euiToastHeader__title').should('contain', 'successfully');
}


describe('Basic sanity test for integrations plugin', () => {
  it('Navigates to integrations plugin and expects the correct header', () => {
    moveToIntegrationsHome();
    cy.get('[data-test-subj="integrations-header"]').should('exist');
  });

  it('Navigates to integrations plugin and tests that clicking the nginx cards navigates to the nginx page', () => {
    moveToIntegrationsHome();
    cy.get('[data-test-subj="integration_card_nginx"]').click();
    cy.url().should('include', '/available/nginx')
  })

  it('Navigates to nginx page and asserts the page to be as expected', () => {
    moveToAvailableNginxIntegration();
    cy.get('[data-test-subj="nginx-overview"]').should('exist')
    cy.get('[data-test-subj="nginx-details"]').should('exist')
    cy.get('[data-test-subj="nginx-screenshots"]').should('exist')
    cy.get('[data-test-subj="nginx-assets"]').should('exist')
    cy.get('[data-test-subj="fields"]').click();
    cy.get('[data-test-subj="nginx-fields"]').should('exist')
  })

  it('Uses the search of assets and fields tables', () => {
    moveToAvailableNginxIntegration();
    cy.get('input[type="search"]').eq(0).focus().type('ss4o{enter}');
    cy.get('.euiTableRow').should('have.length', 1);//Filters correctly to the index pattern
    cy.get('[data-test-subj="fields"]').click();
    cy.get('input[type="search"]').eq(0).focus().clear().type('severity.observe')
    cy.get('.euiTableRow').should('have.length', 2);//Filters correctly to the field name
  })

  it('Uses the filter of assets table', () => {
    moveToAvailableNginxIntegration();
    cy.get('.euiFilterGroup').trigger('mouseover').click();
    cy.get('.euiFilterSelectItem').contains('visualization').click();
    cy.get('.euiTableRow').should('have.length', 4);//Filters correctly to visualization types
  })
});

describe('Tests the add nginx integration instance flow', () => {
  it('Navigates to nginx page and triggers the adds the instance flow', () => {
    createSamples();
    moveToAvailableNginxIntegration();
    cy.get('[data-test-subj="add-integration-button"]').click();
    cy.get('[data-test-subj="new-instance-name"]').should('have.value', 'nginx');
    cy.get('[data-test-subj="createInstanceButton"]').should('be.disabled')
    cy.get('[data-test-subj="addIntegrationFlyoutTitle"]').should('exist')
    // Modifies the name of the integration
    cy.get('[data-test-subj="new-instance-name"]').type(testInstance.substring(5));
    // validates the created sample index
    cy.get('[data-test-subj="data-source-name"]').type('ss4o_logs-nginx-sample-sample');
    cy.get('[data-test-subj="validateIndex"]').click();
    cy.get('.euiToastHeader__title').should('contain', 'valid');
    cy.get('[data-test-subj="createInstanceButton"]').click();
    cy.get('.euiToastHeader__title').should('contain', 'successfully');
  })

  it('Navigates to installed integrations page and verifies that nginx-test exists', () => {
    moveToAddedIntegrations();
    cy.contains(testInstance).should('exist');
    cy.get('input[type="search"]').eq(0).focus().type(`${testInstance}{enter}`);
    cy.get('.euiTableRow').should('have.length', 1);//Filters correctly to the test integration instance
    cy.get(`[data-test-subj="${testInstance}IntegrationLink"]`).click();
  })

  it('Navigates to added integrations page and verifies that nginx-test exists and linked asset works as expected', () => {
    moveToAddedIntegrations();
    cy.contains(TEST_INTEGRATION_INSTANCE).should('exist');
    cy.get(`[data-test-subj="${testInstance}IntegrationLink"]`).click();
    cy.get(`[data-test-subj="IntegrationAssetLink"]`).click();
    cy.url().should('include', '/dashboards#/')
  })

  it('Navigates to installed nginx-test instance page and deletes it', () => {
    moveToAddedIntegrations();
    cy.contains(testInstance).should('exist');
    cy.get(`[data-test-subj="${testInstance}IntegrationLink"]`).click();
    cy.get('[data-test-subj="deleteInstanceButton"]').click();

    cy.get('button[data-test-subj="popoverModal__deleteButton"]').should('be.disabled');

    cy.get('input.euiFieldText[placeholder="delete"]').focus().type('delete', {
      delay: 50,
    });
    cy.get('button[data-test-subj="popoverModal__deleteButton"]').should('not.be.disabled');
    cy.get('button[data-test-subj="popoverModal__deleteButton"]').click();
    cy.get('.euiToastHeader__title').should('contain', 'successfully');
  })
});

describe('Tests the add nginx integration instance flow', () => {
  it('Navigates to nginx page and triggers the try it flow', () => {
    moveToAvailableNginxIntegration();
    cy.get('[data-test-subj="try-it-button"]').click();
    cy.get('.euiToastHeader__title').should('contain', 'successfully');
    moveToAddedIntegrations();
    cy.contains(TEST_SAMPLE_INSTANCE).should('exist');
  })
});


