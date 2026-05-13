/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

/*
 * PR-1 SLO CRUD smoke — create → listing row → delete → row gone.
 *
 * Runs against a locally-running dev cluster + observability plugin. Use:
 *
 *   yarn cypress:run-without-security --spec \
 *     .cypress/integration/slo_test/slo_crud_smoke.spec.js
 *
 * Requires a registered Prometheus-backed DirectQuery datasource. The spec
 * picks up the datasource id from the `sloDatasourceId` Cypress env.
 */

const DATASOURCE_ID = Cypress.env('sloDatasourceId') || 'prom';

const uniqueSuffix = () => Math.random().toString(36).slice(2, 8);

describe('SLO — CRUD smoke (PR 1)', () => {
  it('creates, lists, and deletes an SLO through the wizard', () => {
    const name = `Smoke SLO ${uniqueSuffix()}`;
    const service = `smoke-svc-${uniqueSuffix()}`;

    // Land on the listing page. The sidebar entry is registered when APM is
    // enabled (observability-apm-slo).
    cy.visit('/app/observability-apm-slo#/slos');
    cy.get('[data-test-subj="sloCreateBtn"], [data-test-subj="sloCreateBtnEmpty"]')
      .first()
      .click();

    // Fill the wizard.
    cy.get('[data-test-subj="sloWizardName"]').type(name);
    cy.get('[data-test-subj="sloWizardService"]').type(service);
    cy.get('[data-test-subj="sloWizardTeam"]').type('platform');
    cy.get('[data-test-subj="sloWizardDatasource"]').type(DATASOURCE_ID);
    cy.get('[data-test-subj="sloWizardMetric"]')
      .clear()
      .type('http_requests_total');
    cy.get('[data-test-subj="sloWizardTarget"]').clear().type('99.9');
    cy.get('[data-test-subj="sloWizardSubmit"]').click();

    // Back to listing — row should appear.
    cy.location('hash').should('eq', '#/slos');
    cy.contains('[data-test-subj="sloRowName"]', name).should('be.visible');

    // Delete.
    cy.contains('[data-test-subj="sloRowName"]', name)
      .parents('tr')
      .find('[data-test-subj="sloRowDelete"]')
      .click();
    cy.get('[data-test-subj="sloDeleteConfirm"]').find('button.euiButton--danger').click();

    // Gone.
    cy.contains('[data-test-subj="sloRowName"]', name).should('not.exist');
  });
});
