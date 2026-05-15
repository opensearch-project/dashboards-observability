/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

/*
 * PR 2 wizard — multi-objective happy path + validation summary.
 *
 * Adds a second objective row, fills both, submits, and verifies the SLO is
 * persisted with two objectives. Then exercises the validation-summary flow:
 * clear a required field, submit, the summary banner appears with one error.
 *
 * Prereqs:
 *   - `observability.slo.enabled: true` in opensearch_dashboards.yml.
 *   - A registered Prometheus-backed DirectQuery datasource.
 *
 * Run with (from plugin dir):
 *   yarn cypress:run \
 *     --spec .cypress/integration/slo_test/slo_wizard_multi_objective.spec.js \
 *     --env workspaceId=<WS_ID>,sloDatasourceId=<DS_ID>,baseUrl=http://localhost:5602
 */

const WORKSPACE_ID = Cypress.env('workspaceId');
const DATASOURCE_ID = Cypress.env('sloDatasourceId') || 'prom';

const uniqueSuffix = () => Math.random().toString(36).slice(2, 8);
const prefix = WORKSPACE_ID ? `/w/${WORKSPACE_ID}` : '';
const sloApp = `${prefix}/app/observability-apm-slo`;

const SLO_ENABLED = Cypress.env('sloEnabled') !== false;

describe('SLO wizard — multi-objective', () => {
  before(function () {
    if (!SLO_ENABLED) this.skip();
  });

  it('creates an SLO with two objectives and renders the rule preview', () => {
    const name = `Multi-Obj SLO ${uniqueSuffix()}`;
    const service = `multi-obj-svc-${uniqueSuffix()}`;

    cy.visit(`${sloApp}#/slos/create`);
    cy.get('[data-test-subj="slosTemplate-http-availability"]', { timeout: 10000 }).click();

    // Identity / owner / datasource.
    cy.get('[data-test-subj="slosWizardDatasourceId"]').clear().type(DATASOURCE_ID);
    cy.get('[data-test-subj="slosWizardName"]').type(name);
    cy.get('[data-test-subj="slosWizardService"]').type(service);
    cy.get('[data-test-subj="slosWizardOwnerTeam"]').type('platform');

    // Default objective is "availability-99-9". Add a second.
    cy.get('[data-test-subj="slosWizardObjectiveAdd"]').click();
    cy.get('[data-test-subj="slosWizardObjectiveName-1"]').clear().type('availability-99-0');
    cy.get('[data-test-subj="slosWizardObjectiveTarget-1"]').clear().type('99');

    // Live downtime preview surfaces under the target.
    cy.get('[data-test-subj="slosWizardObjectiveTargetDowntime-0"]').should('be.visible');
    cy.get('[data-test-subj="slosWizardObjectiveTargetDowntime-1"]').should('be.visible');

    // Rule-preview panel renders once form is valid (debounce ~500ms).
    cy.get('[data-test-subj="slosWizardPreviewSuccess"]', { timeout: 15000 }).should('be.visible');

    cy.get('[data-test-subj="slosWizardSubmit"]').click();
    cy.location('hash', { timeout: 15000 }).should('match', /#\/slos\/[0-9a-f-]{36}/);

    // Detail page surfaces both objectives in the spec JSON view.
    cy.contains(name).should('be.visible');
    cy.contains('availability-99-0').should('be.visible');
  });

  it('surfaces a top-level validation summary when a required field is missing', () => {
    cy.visit(`${sloApp}#/slos/create`);
    cy.get('[data-test-subj="slosTemplate-http-availability"]', { timeout: 10000 }).click();

    // Skip the Name field — but fill the rest so this is a single-error flow.
    cy.get('[data-test-subj="slosWizardDatasourceId"]').clear().type(DATASOURCE_ID);
    cy.get('[data-test-subj="slosWizardService"]').type(`svc-${uniqueSuffix()}`);
    cy.get('[data-test-subj="slosWizardOwnerTeam"]').type('platform');

    cy.get('[data-test-subj="slosWizardSubmit"]').click();
    cy.get('[data-test-subj="slosWizardValidationSummary"]', { timeout: 5000 }).should('be.visible');
    cy.get('[data-test-subj="slosWizardValidationSummaryItem-spec.name"]').should('be.visible');

    // Filling the name clears the corresponding row from the summary on next
    // submit attempt (the user sees progress, not a stale red banner).
    cy.get('[data-test-subj="slosWizardName"]').type(`Recovered ${uniqueSuffix()}`);
    cy.get('[data-test-subj="slosWizardSubmit"]').click();
    cy.get('[data-test-subj="slosWizardValidationSummaryItem-spec.name"]').should('not.exist');
  });
});
