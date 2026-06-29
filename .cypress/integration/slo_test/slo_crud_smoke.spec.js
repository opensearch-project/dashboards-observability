/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

/*
 * SLO CRUD smoke — pick template → fill identity + custom PromQL →
 * submit → verify detail page → delete from detail → row gone.
 *
 * The wizard is template-driven; we use the `custom` template so the spec
 * doesn't need any RED metrics actually flowing in Cortex (the placeholder
 * PromQL queries are evaluated only when the rule fires).
 *
 * Prereqs (CI sets these up via .github/workflows/cypress-slo-cortex.yml;
 * locally, the observability-stack dev cluster covers them):
 *   - `observability.slo.enabled: true` in opensearch_dashboards.yml
 *   - A registered Prometheus-backed DirectQuery datasource. CI registers
 *     `prom_ci` against the Cortex sidecar; locally pass --env sloDatasourceId
 *
 * Run locally with:
 *   yarn cypress:run \
 *     --spec .cypress/integration/slo_test/slo_crud_smoke.spec.js \
 *     --env sloDatasourceId=<DS_ID>
 */

const APP_ID = 'observability-apm-slo';
const DATASOURCE_ID = Cypress.env('sloDatasourceId') || 'prom_ci';
const WORKSPACE_PREFIX = Cypress.env('workspaceId') ? `/w/${Cypress.env('workspaceId')}` : '';

const uniqueSuffix = () => Math.random().toString(36).slice(2, 8);

// The datasource field is a type-ahead EuiComboBox (single-select, no free
// text). Type to filter, then click the matching option. The option label is
// the datasource's connection name, which is the same value passed as
// `sloDatasourceId`. Options match by `role="option"` — prefix-agnostic across
// the OUI/EUI class rename.
function selectDatasource(dsName) {
  cy.get('[data-test-subj="slosWizardDatasourceId"]').click();
  cy.get('[data-test-subj="slosWizardDatasourceId"]').find('input').first().type(dsName);
  cy.get('[role="option"]', { timeout: 10000 }).contains(dsName).click();
}

// Service and Primary team are suggesting comboboxes that also accept free
// text. Type into the inner input and press Enter to commit a new value.
function typeComboBox(testSubj, value) {
  cy.get(`[data-test-subj="${testSubj}"]`).find('input').first().type(`${value}{enter}`);
}

describe('SLO — CRUD smoke', () => {
  it('creates an SLO via the custom-PromQL template, then deletes it', () => {
    const name = `Smoke SLO ${uniqueSuffix()}`;

    // Land on the listing page.
    cy.visit(`${WORKSPACE_PREFIX}/app/${APP_ID}#/slos`);
    cy.get('[data-test-subj="slosPage"]', { timeout: 30000 }).should('be.visible');

    // Open the create wizard. The header-bar create button (slosCreate) and
    // the empty-state create button (slosCreateEmpty) live in different DOM
    // subtrees; the empty-state one only renders when there are zero SLOs.
    // Either path is fine — pick whichever is visible first.
    cy.get('body').then(($body) => {
      if ($body.find('[data-test-subj="slosCreateEmpty"]').length) {
        cy.get('[data-test-subj="slosCreateEmpty"]').click();
      } else {
        // Header-bar create button: navigating directly to the wizard route
        // is more reliable than clicking through the OSD chrome (which lives
        // in a portal).
        cy.visit(`${WORKSPACE_PREFIX}/app/${APP_ID}#/slos/create`);
      }
    });

    // Pick the `custom` template — no RED metrics needed.
    cy.get('[data-test-subj="slosTemplate-custom"]', { timeout: 20000 }).click();

    // Identity panel
    selectDatasource(DATASOURCE_ID);
    cy.get('[data-test-subj="slosWizardName"]').type(name);

    // Service + owner team are both required.
    typeComboBox('slosWizardService', 'ci-svc');
    typeComboBox('slosWizardOwnerTeam', 'platform');

    // SLI query — use the Advanced (raw error-ratio) mode, a stable textarea.
    // The default Ratio mode renders metric-picker comboboxes; Advanced is the
    // raw-PromQL escape hatch and is simpler to drive deterministically here.
    // The placeholder query is syntactically valid PromQL; Cortex's ruler
    // accepts it even if the series don't exist yet (records `NaN`).
    // parseSpecialCharSequences:false because Cypress otherwise treats `{`
    // as a special-char modifier prefix (matches cmd, alt, etc).
    cy.get('[data-test-subj="slosWizardCustomPromqlMode"]').contains('Advanced').click();
    cy.get('[data-test-subj="slosWizardCustomPromqlRaw"]').type(
      'sum(rate(http_requests_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))',
      { parseSpecialCharSequences: false }
    );

    // Submit. The submit button lives in the OSD header chrome, controlled
    // via HeaderControlledComponentsWrapper.
    cy.get('[data-test-subj="slosWizardSubmit"]').click();

    // After create the wizard redirects to the detail page for the new SLO.
    cy.location('hash', { timeout: 30000 }).should('match', /#\/slos\/[0-9a-f-]{36}/);
    cy.get('[data-test-subj="sloDetailPage"]', { timeout: 30000 }).should('be.visible');
    cy.contains('h1, h2', name, { timeout: 15000 }).should('be.visible');

    // Delete from the detail page.
    cy.get('[data-test-subj="slosDetailDelete"]').click();
    cy.get('[data-test-subj="slosDetailDeleteModal"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-test-subj="confirmModalConfirmButton"]').click();

    // After delete we land back on the listing.
    cy.location('hash', { timeout: 20000 }).should('match', /#\/slos$/);
    cy.get('[data-test-subj="slosPage"]', { timeout: 30000 }).should('be.visible');
    // The deleted name should no longer appear as a row link.
    cy.contains(`[data-test-subj^="slosLink-"]`, name).should('not.exist');
  });
});
