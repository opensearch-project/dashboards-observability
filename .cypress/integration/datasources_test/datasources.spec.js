/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {FONTEND_BASE_PATH, DATASOURCES_API_PREFIX} from '../../utils/constants'

const visitDatasourcesHomePage = () => {
  cy.visit(FONTEND_BASE_PATH + DATASOURCES_API_PREFIX);
}

describe('Integration tests for datasources plugin', () => {


  it('Navigates to datasources plugin and expects the correct header', () => {
    visitDatasourcesHomePage();
    cy.get('[data-test-subj="dataconnections-header"]').should('exist');
  });

  it('Tests navigation between tabs and goes to Prometheus creation flow', () => {
    visitDatasourcesHomePage();
    cy.get('[data-test-subj="new"]').click();
    cy.url().should('include', '/new');
    cy.get('[data-test-subj="datasource_card_prometheus"]').click();
    cy.url().should('include', '/configure/Prometheus');
  });
});
