/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />
  
  const moveToDatasourcesHome = () => {
    cy.visit(`${Cypress.env('opensearchDashboards')}/app/datasources`);
  };
  
  describe('Basic sanity test for datasources plugin', () => {
    it('Navigates to datasources plugin and expects the correct header', () => {
      moveToDatasourcesHome();
      cy.get('[data-test-subj="datasources-header"]').should('exist');
    });
});

  
  
