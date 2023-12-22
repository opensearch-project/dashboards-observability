/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  FONTEND_BASE_PATH,
  DATASOURCES_API_PREFIX,
  DATASOURCES_PATH,
} from '../../utils/constants'

const manageDataSourcesTag = 'button[data-test-subj="manage"]';
const newDataSourcesTag = 'button[data-test-subj="new"]';
const createS3Button = '[data-test-subj="datasource_card_s3glue"]'
const createPrometheusButton = '[data-test-subj="datasource_card_prometheus"]';

const visitDatasourcesHomePage = () => {
  cy.visit(FONTEND_BASE_PATH + DATASOURCES_API_PREFIX);
}

const visitDatasourcesCreationPage = () => {
  cy.visit(FONTEND_BASE_PATH + DATASOURCES_PATH.DATASOURCES_CREATION_BASE);
}

describe('Integration tests for datasources plugin', () => {
  it('Navigates to datasources plugin and expects the correct header', () => {
    visitDatasourcesHomePage();
    cy.get('[data-test-subj="dataconnections-header"]').should('exist');
  });

  it('Tests navigation between tabs', () => {
    visitDatasourcesHomePage();

    cy.get(manageDataSourcesTag)
      .should('have.class', 'euiTab-isSelected')
      .and('have.attr', 'aria-selected', 'true');
    cy.get(manageDataSourcesTag).click();
    cy.url().should('include', '/manage');

    cy.get(newDataSourcesTag).click();
    cy.get(newDataSourcesTag)
      .should('have.class', 'euiTab-isSelected')
      .and('have.attr', 'aria-selected', 'true');
    cy.url().should('include', '/new');

    cy.get(createS3Button).should('be.visible');
    cy.get(createPrometheusButton).should('be.visible');
  });

  it('Tests navigation of S3 datasources creation page with hash', () => {
    visitDatasourcesCreationPage();

    cy.get(createS3Button).should('be.visible').click();
    cy.url().should('include', DATASOURCES_PATH.DATASOURCES_CONFIG_BASE + '/AmazonS3AWSGlue')

    cy.get('h1.euiTitle.euiTitle--medium')
      .should('be.visible')
      .and('contain', 'Configure Amazon S3 data source');
  });

  it('Tests navigation of Prometheus datasources creation page with hash', () => {
    visitDatasourcesCreationPage();

    cy.get(createPrometheusButton).should('be.visible').click();
    cy.url().should('include', DATASOURCES_PATH.DATASOURCES_CONFIG_BASE + '/Prometheus')

    cy.get('h4.euiTitle.euiTitle--medium')
      .should('be.visible')
      .and('contain', 'Configure Prometheus data source');
  });
});
