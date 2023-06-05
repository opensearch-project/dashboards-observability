/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

import {
    TEST_INTEGRATION_INSTANCE,
  } from '../utils/constants';
  
  const moveToIntegrationsHome = () => {
    cy.visit(`${Cypress.env('opensearchDashboards')}/app/observability-integrations#/`);
  };

  const moveToAvailableNginxIntegration = () => {
    cy.visit(`${Cypress.env('opensearchDashboards')}/app/observability-integrations#/available/nginx`);
  };

  const moveToInstalledeIntegrations = () => {
    cy.visit(`${Cypress.env('opensearchDashboards')}/app/observability-integrations#/installed`);
  };
  

  
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
      cy.get('[data-test-subj="nginx-fields"]').should('exist')
    })
  });

  describe('Tests the add nginx integration instance flow', () => {
    it('Navigates to nginx page and triggers the adds the instance flow', () => {
      moveToAvailableNginxIntegration();
      cy.get('[data-test-subj="add-integration-button"]').click();
      cy.get('[data-test-subj="instance-name"]').should('have.value', 'nginx');
      cy.get('[data-test-subj="addIntegrationFlyoutTitle"]').should('exist')
      cy.get('[data-test-subj="instance-name"]').type('-test');
      cy.get('[data-test-subj="createInstanceButton"]').click();
      cy.get('.euiToastHeader__title').should('contain', 'successfully');
    })

    it('Navigates to installed integrations page and verifies that nginx-test exists', () => {
      moveToInstalledeIntegrations();
      cy.contains(TEST_INTEGRATION_INSTANCE).should('exist');
      cy.get('[data-test-subj="nginx-testIntegrationLink"]').click();
    })

    it('Navigates to installed integrations page and verifies that nginx-test exists and linked asset works as expected', () => {
      moveToInstalledeIntegrations();
      cy.contains(TEST_INTEGRATION_INSTANCE).should('exist');
      cy.get('[data-test-subj="nginx-testIntegrationLink"]').click();
      cy.get(`[data-test-subj="IntegrationAssetLink"]`).click();
      cy.url().should('include', '/dashboards#/')

    })

    it('Navigates to installed nginx-test instance page and deletes it', () => {
      moveToInstalledeIntegrations();
      cy.contains(TEST_INTEGRATION_INSTANCE).should('exist');
      cy.get('[data-test-subj="nginx-testIntegrationLink"]').click();
      cy.get('[data-test-subj="deleteInstanceButton"]').click();

      cy.get('button[data-test-subj="popoverModal__deleteButton"]').should('be.disabled');

      cy.get('input.euiFieldText[placeholder="delete"]').focus().type('delete', {
        delay: 50,
      });
      cy.get('button[data-test-subj="popoverModal__deleteButton"]').should('not.be.disabled');
      cy.get('button[data-test-subj="popoverModal__deleteButton"]').click();
      cy.get('.euiToastHeader__title').should('contain', 'successfully');
      cy.get('.euiTableCellContent__text').contains('No items found').should('exist');
    })
  });
  
  
 