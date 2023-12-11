/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

  
  const moveToDatasourcesHome = () => {
    cy.visit(`${Cypress.env('opensearchDashboards')}/app/datasources`);
  };

  const moveToNewDatasourcesPage = () => {
    cy.visit(`${Cypress.env('opensearchDashboards')}/app/datasources#/new`);
  };

  const moveToCreatePrometheusDatasourcePage = () => {
    cy.visit(`${Cypress.env('opensearchDashboards')}/app/datasources#/configure/PROMETHEUS`);
  };
  
  describe('Integration tests for datasources plugin', () => {
    const testPrometheusSuffix = (Math.random() + 1).toString(36).substring(7);
const testPrometheusInstance = `Prometheus_${testPrometheusSuffix}`;
const testS3Suffix = (Math.random() + 1).toString(36).substring(7);
const testS3Instance = `S3_${testS3Suffix}`;
    it('Navigates to datasources plugin and expects the correct header', () => {
      moveToDatasourcesHome();
      cy.get('[data-test-subj="dataconnections-header"]').should('exist');
    });

    it('Tests navigation between tabs and goes to Prometheus creation flow', () => {
      moveToDatasourcesHome();
      cy.get('[data-test-subj="new"]').click();
      cy.url().should('include', '/new')
      cy.get('[data-test-subj="datasource_card_prometheus"]').click();
      cy.url().should('include', '/configure/PROMETHEUS');
    });

});

  
  
