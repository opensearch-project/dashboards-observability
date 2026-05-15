/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

/*
 * SLO CRUD smoke — create → detail → listing row → delete → row gone.
 *
 * The wizard surface targeted here is the PR 2 multi-section wizard. Test-subj
 * naming follows the `slos*` convention introduced in PR 2 (vs. PR 1's
 * `sloWizard*` names which the wizard rewrite replaced).
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
 */

const WORKSPACE_ID = Cypress.env('workspaceId');
const DATASOURCE_ID = Cypress.env('sloDatasourceId') || 'prom';

const uniqueSuffix = () => Math.random().toString(36).slice(2, 8);
const prefix = WORKSPACE_ID ? `/w/${WORKSPACE_ID}` : '';
const sloApp = `${prefix}/app/observability-apm-slo`;

// FIXME(pr-5): wire this spec into the CI pipeline once the observability-
// stack dev cluster ships as a CI prereq. Today it's operator-run only:
// CI doesn't have a Prometheus-backed DirectQuery datasource available.
// The `sloEnabled` env gate below lets anyone drop it in a CI run that
// doesn't have the stack up without failing the whole suite.
const SLO_ENABLED = Cypress.env('sloEnabled') !== false;

describe('SLO — CRUD smoke', () => {
  before(function () {
    if (!SLO_ENABLED) this.skip();
  });

  it('creates, lists, and deletes an SLO through the wizard', () => {
    const name = `Smoke SLO ${uniqueSuffix()}`;
    const service = `smoke-svc-${uniqueSuffix()}`;

    // Land on the listing page.
    cy.visit(`${sloApp}#/slos`);
    cy.get(
      '[data-test-subj="sloCreateBtn"], [data-test-subj="sloCreateBtnEmpty"]'
    )
      .first()
      .click();

    // Pick a template (HTTP availability — single objective, no probe path).
    cy.get('[data-test-subj="slosTemplate-http-availability"]', { timeout: 10000 }).click();

    // Fill the wizard fields. Identity, owner, datasource — single objective
    // suffices for the smoke path.
    cy.get('[data-test-subj="slosWizardDatasourceId"]').clear().type(DATASOURCE_ID);
    cy.get('[data-test-subj="slosWizardName"]').type(name);
    cy.get('[data-test-subj="slosWizardService"]').type(service);
    cy.get('[data-test-subj="slosWizardOwnerTeam"]').type('platform');

    cy.get('[data-test-subj="slosWizardSubmit"]').click();

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
