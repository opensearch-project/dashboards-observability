/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

/*
 * Workspace-scoped create — confirms PR 2's request-layer plumbing routes the
 * workspace id from `getWorkspaceState(req)` into `sloRulerNamespaceFor(...)`.
 * An SLO created under a non-default workspace lands in
 * `slo-generated-<wsId>` on the ruler and is visible only from the same
 * workspace's listing.
 *
 * Prereqs:
 *   - `observability.slo.enabled: true` in opensearch_dashboards.yml.
 *   - A non-default workspace `<WS_ID>` with the APM + SLO apps visible.
 *   - A registered Prometheus-backed DirectQuery datasource visible in that
 *     workspace.
 *
 * Run with (from plugin dir):
 *   yarn cypress:run \
 *     --spec .cypress/integration/slo_test/slo_workspace_isolation.spec.js \
 *     --env workspaceId=<WS_ID>,sloDatasourceId=<DS_ID>,baseUrl=http://localhost:5602
 *
 * The spec NO-OPs (skips) when no workspaceId is supplied — single-workspace
 * deployments don't have a "non-default" path to exercise.
 */

const WORKSPACE_ID = Cypress.env('workspaceId');
const DATASOURCE_ID = Cypress.env('sloDatasourceId') || 'prom';

const uniqueSuffix = () => Math.random().toString(36).slice(2, 8);
const sloApp = (prefix) => `${prefix}/app/observability-apm-slo`;

const SLO_ENABLED = Cypress.env('sloEnabled') !== false;

describe('SLO — workspace-scoped create', () => {
  before(function () {
    if (!SLO_ENABLED) this.skip();
    if (!WORKSPACE_ID) this.skip();
  });

  it('creates an SLO under a non-default workspace and lists it only there', () => {
    const name = `WS Iso SLO ${uniqueSuffix()}`;
    const service = `ws-iso-svc-${uniqueSuffix()}`;
    const wsPrefix = `/w/${WORKSPACE_ID}`;

    // Create from the workspace-scoped app surface.
    cy.visit(`${sloApp(wsPrefix)}#/slos`);
    cy.get(
      '[data-test-subj="sloCreateBtn"], [data-test-subj="sloCreateBtnEmpty"]'
    )
      .first()
      .click();

    cy.get('[data-test-subj="slosTemplate-http-availability"]', { timeout: 10000 }).click();
    cy.get('[data-test-subj="slosWizardDatasourceId"]').clear().type(DATASOURCE_ID);
    cy.get('[data-test-subj="slosWizardName"]').type(name);
    cy.get('[data-test-subj="slosWizardService"]').type(service);
    cy.get('[data-test-subj="slosWizardOwnerTeam"]').type('platform');
    cy.get('[data-test-subj="slosWizardSubmit"]').click();

    cy.location('hash', { timeout: 15000 }).should('match', /#\/slos\/[0-9a-f-]{36}/);
    cy.contains('h1', name, { timeout: 15000 }).should('be.visible');

    // Listing shows the row inside this workspace.
    cy.visit(`${sloApp(wsPrefix)}#/slos`);
    cy.get('[data-test-subj="tablePaginationPopoverButton"]').click();
    cy.get('.euiContextMenuItem').contains('100 rows').click();
    cy.contains('[data-test-subj="sloRowName"]', name, { timeout: 15000 }).should('be.visible');

    // Listing in the default workspace must NOT show the row — workspace
    // isolation at the saved-objects layer plus the ruler-namespace gate
    // means the SLO is genuinely scoped to the creating workspace.
    cy.visit(sloApp('') + '#/slos');
    cy.get('[data-test-subj="tablePaginationPopoverButton"]', { timeout: 10000 }).click();
    cy.get('.euiContextMenuItem').contains('100 rows').click();
    cy.contains('[data-test-subj="sloRowName"]', name).should('not.exist');

    // Clean up — go back to the workspace-scoped listing and delete.
    cy.visit(`${sloApp(wsPrefix)}#/slos`);
    cy.get('[data-test-subj="tablePaginationPopoverButton"]').click();
    cy.get('.euiContextMenuItem').contains('100 rows').click();
    cy.contains('[data-test-subj="sloRowName"]', name)
      .closest('tr')
      .find('[data-test-subj="sloRowDelete"]')
      .click();
    cy.get('[data-test-subj="sloDeleteConfirm"]').find('button.euiButton--danger').click();
    cy.contains('[data-test-subj="sloRowName"]', name).should('not.exist');
  });
});
