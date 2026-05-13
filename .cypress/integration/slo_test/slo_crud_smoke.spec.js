/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

/*
 * PR-1 SLO CRUD smoke — create → detail → listing row → delete → row gone.
 *
 * Prereqs:
 *   - Dev stack running with `observability.slo.enabled: true` in
 *     `opensearch_dashboards.yml`.
 *   - A registered Prometheus-backed DirectQuery datasource.
 *   - An OSD workspace in which the APM + SLO apps are visible. The spec
 *     picks up the workspace id from `workspaceId` env (see cypress.config).
 *
 * Run with (from plugin dir):
 *   yarn cypress:run \
 *     --spec .cypress/integration/slo_test/slo_crud_smoke.spec.js \
 *     --env workspaceId=<WS_ID>,sloDatasourceId=<DS_ID>,baseUrl=http://localhost:5602
 *
 * The baseUrl env overrides `cypress.config.js` for dev servers on :5602.
 */

const WORKSPACE_ID = Cypress.env('workspaceId');
const DATASOURCE_ID = Cypress.env('sloDatasourceId') || 'prom';

const uniqueSuffix = () => Math.random().toString(36).slice(2, 8);
const prefix = WORKSPACE_ID ? `/w/${WORKSPACE_ID}` : '';
const sloApp = `${prefix}/app/observability-apm-slo`;

describe('SLO — CRUD smoke (PR 1)', () => {
  it('creates, lists, and deletes an SLO through the wizard', () => {
    const name = `Smoke SLO ${uniqueSuffix()}`;
    const service = `smoke-svc-${uniqueSuffix()}`;

    // Land on the listing page.
    cy.visit(`${sloApp}#/slos`);
    // Wait for the listing to render — either an empty prompt or the table.
    cy.get(
      '[data-test-subj="sloCreateBtn"], [data-test-subj="sloCreateBtnEmpty"]'
    )
      .first()
      .click();

    // Fill the wizard.
    cy.get('[data-test-subj="sloWizardName"]').type(name);
    cy.get('[data-test-subj="sloWizardService"]').type(service);
    cy.get('[data-test-subj="sloWizardTeam"]').type('platform');
    cy.get('[data-test-subj="sloWizardDatasource"]').type(DATASOURCE_ID);
    cy.get('[data-test-subj="sloWizardMetric"]').clear().type('http_requests_total');
    cy.get('[data-test-subj="sloWizardTarget"]').clear().type('99.9');
    cy.get('[data-test-subj="sloWizardSubmit"]').click();

    // After create the wizard redirects to the detail page for the new SLO.
    cy.location('hash', { timeout: 15000 }).should('match', /#\/slos\/[0-9a-f-]{36}/);
    // Detail page shows the SLO name as the chrome h1 (via breadcrumb).
    cy.contains('h1', name, { timeout: 15000 }).should('be.visible');

    // Navigate back to the listing and locate the new row. Tolerate either
    // page (new SLOs sort last; pageSize=100 guarantees visibility even with
    // a seeded cluster).
    cy.visit(`${sloApp}#/slos`);
    cy.get('[data-test-subj="tablePaginationPopoverButton"]').click();
    cy.get('.euiContextMenuItem').contains('100 rows').click();
    cy.contains('[data-test-subj="sloRowName"]', name, { timeout: 15000 })
      .should('be.visible');

    // Trigger delete via the row's trash action.
    cy.contains('[data-test-subj="sloRowName"]', name)
      .closest('tr')
      .find('[data-test-subj="sloRowDelete"]')
      .click();
    cy.get('[data-test-subj="sloDeleteConfirm"]')
      .find('button.euiButton--danger')
      .click();

    // Row is gone (toast confirms success; assert on the list for durability).
    cy.contains('[data-test-subj="sloRowName"]', name).should('not.exist');
  });
});
