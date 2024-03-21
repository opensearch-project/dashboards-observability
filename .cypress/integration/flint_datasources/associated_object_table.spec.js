/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

// ../../utils/flint-datasources/catalog-cache.json
// ../../utils/flint-datasources/accelerations-cache.json

Cypress.on('uncaught:exception', (err, runnable) => {
  if (err.message.includes('ResizeObserver loop completed with undelivered notifications')) {
    return false;
  }
});

const goToDataConnectionPage = () => {
  cy.visit(`${Cypress.env('opensearchDashboards')}/app/datasources`);
	cy.get('h1[data-test-subj="dataconnections-header"]').should('be.visible');
	cy.get('a[data-test-subj="mys3DataConnectionsLink"]').click();
}

describe('Associated Object test', () => {
  before(() => {
    // Load the catalog cache data
    const catalogCachePath = './.cypress/utils/flint-datasources/catalog-cache.json';
    cy.readFile(catalogCachePath).then((cache) => {
      cy.visit(`${Cypress.env('opensearchDashboards')}`, {
        onBeforeLoad: (win) => {
          win.localStorage.setItem('async-query-catalog-cache', JSON.stringify(cache));
        },
      });
    });

    // Load the accelerations cache data
    const accelerationCachePath = './.cypress/utils/flint-datasources/accelerations-cache.json';
    cy.readFile(accelerationCachePath).then((cache) => {
      cy.visit(`${Cypress.env('opensearchDashboards')}`, {
        onBeforeLoad: (win) => {
          win.localStorage.setItem('async-query-acclerations-cache', JSON.stringify(cache));
        },
      });
    });
  });

	after(() => {
		cy.clearLocalStorage('async-query-catalog-cache');
		cy.clearLocalStorage('async-query-acclerations-cache');
	});

  it('Navigates to data connection page and located the Associated objects table', () => {
    goToDataConnectionPage();
    cy.contains('h2.panel-title', 'Associated objects').should('exist');
  });
});
