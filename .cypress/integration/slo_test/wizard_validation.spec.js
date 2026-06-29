/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

/*
 * SLO wizard validation paths.
 *
 * Run locally with:
 *   yarn cypress:run --spec \
 *     .cypress/integration/slo_test/wizard_validation.spec.js \
 *     --env sloDatasourceId=<DS_ID>[,workspaceId=<WS>]
 *
 * Exercises the wizard's pre-submit guards. The dedup/CRUD specs cover the
 * happy path; this one pins the user-visible behavior when the form is
 * incomplete or malformed:
 *
 *   1. Submit with each required field empty (datasourceId, name, service,
 *      owner team) — the validation summary callout appears and lists the
 *      missing field. No SLO is created.
 *   2. Submit with an invalid Prometheus metric name — the SLI section
 *      surfaces the metric error.
 *   3. Submit with malformed PromQL (custom template, unbalanced parens) —
 *      the custom-PromQL field surfaces the goodQuery error.
 *   4. Click Cancel from the wizard — returns to the listing without a
 *      transient SLO landing in the catalog.
 *
 * Uses the `custom` template throughout when PromQL is involved so it
 * doesn't depend on RED metrics flowing in Cortex.
 */

const APP_ID = 'observability-apm-slo';
const DATASOURCE_ID = Cypress.env('sloDatasourceId') || 'prom_ci';
const WORKSPACE_PREFIX = Cypress.env('workspaceId') ? `/w/${Cypress.env('workspaceId')}` : '';
const SLO_BASE = `${WORKSPACE_PREFIX}/api/observability/v1/slos`;

const uniqueSuffix = () => Math.random().toString(36).slice(2, 8);

function visitWizard(templateId = 'custom') {
  // cy.visit only reloads on a path change — hash-only navigation reuses the
  // SPA's React state, which means a previous test's picked template can
  // bleed in and skip the picker. Bouncing through the listing first forces
  // a clean wizard mount on every test.
  cy.visit(`${WORKSPACE_PREFIX}/app/${APP_ID}#/slos`);
  cy.get('[data-test-subj="slosPage"]', { timeout: 30000 }).should('be.visible');
  cy.visit(`${WORKSPACE_PREFIX}/app/${APP_ID}#/slos/create`);
  cy.get(`[data-test-subj="slosTemplate-${templateId}"]`, { timeout: 30000 }).click();
  cy.get('[data-test-subj="sloWizardPage"]', { timeout: 20000 }).should('be.visible');
}

// The datasource field is a type-ahead EuiComboBox (single-select, no free
// text). Type to filter, then click the option (matched by `role="option"`,
// prefix-agnostic across the OUI/EUI class rename). The option label is the
// datasource connection name — the same value passed as `sloDatasourceId`.
function selectDatasource(dsName) {
  cy.get('[data-test-subj="slosWizardDatasourceId"]').click();
  cy.get('[data-test-subj="slosWizardDatasourceId"]').find('input').first().type(dsName);
  cy.get('[role="option"]', { timeout: 10000 }).contains(dsName).click();
}

// Clear a combobox selection. The clear (×) button carries no stable
// test-subj across the OUI/EUI rename, so remove the selected chip by focusing
// the input and pressing backspace — single-select drops the one selection.
function clearComboBox(testSubj) {
  cy.get(`[data-test-subj="${testSubj}"]`).find('input').first().focus().type('{backspace}');
}

// Service and Primary team are suggesting comboboxes that also accept free
// text. Type into the inner input and press Enter to commit a new value.
function typeComboBox(testSubj, value) {
  cy.get(`[data-test-subj="${testSubj}"]`).find('input').first().type(`${value}{enter}`);
}

// Author the SLI via Advanced (raw error-ratio) mode — a stable textarea.
// The default Ratio mode uses metric-picker comboboxes; Advanced is the raw
// PromQL escape hatch and the simplest deterministic path for these tests.
function fillSliRaw(query = 'sum(rate(http_requests_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))') {
  cy.get('[data-test-subj="slosWizardCustomPromqlMode"]').contains('Advanced').click();
  cy.get('[data-test-subj="slosWizardCustomPromqlRaw"]').clear().type(query, {
    parseSpecialCharSequences: false,
  });
}

function fillCustomHappyPath({ name, datasourceId = DATASOURCE_ID, service = 'ci-svc', team = 'platform' }) {
  selectDatasource(datasourceId);
  cy.get('[data-test-subj="slosWizardName"]').clear().type(name);
  typeComboBox('slosWizardService', service);
  typeComboBox('slosWizardOwnerTeam', team);
  fillSliRaw();
}

describe('SLO wizard — validation paths', () => {
  // Track any name we typed so a stray successful submit doesn't leak; the
  // tests below should never reach create because they submit invalid forms.
  // We sweep by name in `after` as a belt-and-braces guard.
  const dirtyNames = [];

  after(() => {
    if (dirtyNames.length === 0) return;
    cy.request({
      method: 'GET',
      url: `${SLO_BASE}?pageSize=500`,
      headers: { 'osd-xsrf': 'true' },
      failOnStatusCode: false,
    }).then((resp) => {
      // paginate() returns { results, total, nextCursor, prevCursor }.
      const items = resp.body && (resp.body.results || resp.body.items);
      if (resp.status !== 200 || !Array.isArray(items)) return;
      const matching = items.filter(
        (item) => item.spec && dirtyNames.includes(item.spec.name)
      );
      matching.forEach((item) => {
        cy.request({
          method: 'DELETE',
          url: `${SLO_BASE}/${encodeURIComponent(item.id)}`,
          headers: { 'osd-xsrf': 'true' },
          failOnStatusCode: false,
        });
      });
    });
  });

  it('missing datasource: validation summary surfaces spec.datasourceId error', () => {
    const name = `Wizard validate ${uniqueSuffix()}`;
    dirtyNames.push(name);
    visitWizard('custom');
    fillCustomHappyPath({ name });
    clearComboBox('slosWizardDatasourceId');
    cy.get('[data-test-subj="slosWizardSubmit"]').click();
    cy.get('[data-test-subj="slosWizardValidationSummary"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-test-subj="slosWizardValidationSummaryItem-spec.datasourceId"]').should(
      'be.visible'
    );
    // Submit must not have routed away from the wizard.
    cy.location('hash').should('match', /#\/slos\/create/);
  });

  it('missing name: validation summary surfaces spec.name error', () => {
    const name = `Wizard validate ${uniqueSuffix()}`;
    dirtyNames.push(name);
    visitWizard('custom');
    fillCustomHappyPath({ name });
    cy.get('[data-test-subj="slosWizardName"]').clear();
    cy.get('[data-test-subj="slosWizardSubmit"]').click();
    cy.get('[data-test-subj="slosWizardValidationSummary"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-test-subj="slosWizardValidationSummaryItem-spec.name"]').should('be.visible');
    cy.location('hash').should('match', /#\/slos\/create/);
  });

  it('missing service: validation summary surfaces spec.service error', () => {
    const name = `Wizard validate ${uniqueSuffix()}`;
    dirtyNames.push(name);
    visitWizard('custom');
    fillCustomHappyPath({ name });
    clearComboBox('slosWizardService');
    cy.get('[data-test-subj="slosWizardSubmit"]').click();
    cy.get('[data-test-subj="slosWizardValidationSummary"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-test-subj="slosWizardValidationSummaryItem-spec.service"]').should('be.visible');
    cy.location('hash').should('match', /#\/slos\/create/);
  });

  it('missing owner team: validation summary surfaces spec.owner.teams error', () => {
    const name = `Wizard validate ${uniqueSuffix()}`;
    dirtyNames.push(name);
    visitWizard('custom');
    fillCustomHappyPath({ name });
    clearComboBox('slosWizardOwnerTeam');
    cy.get('[data-test-subj="slosWizardSubmit"]').click();
    cy.get('[data-test-subj="slosWizardValidationSummary"]', { timeout: 10000 }).should('be.visible');
    cy.get('[data-test-subj="slosWizardValidationSummaryItem-spec.owner.teams"]').should(
      'be.visible'
    );
    cy.location('hash').should('match', /#\/slos\/create/);
  });

  it('malformed PromQL: validation summary surfaces customExpr.errorRatioQuery error', () => {
    const name = `Wizard validate ${uniqueSuffix()}`;
    dirtyNames.push(name);
    visitWizard('custom');
    // Fill the happy path first (which authors the SLI in Advanced/raw mode),
    // then overwrite the raw error-ratio query with an unbalanced expression.
    // validateCustomPromQL counts paren depth and rejects on imbalance — see
    // common/slo/slo_validators.ts.
    fillCustomHappyPath({ name });
    cy.get('[data-test-subj="slosWizardCustomPromqlRaw"]')
      .clear()
      .type('sum(rate(', { parseSpecialCharSequences: false });
    cy.get('[data-test-subj="slosWizardSubmit"]').click();
    cy.get('[data-test-subj="slosWizardValidationSummary"]', { timeout: 10000 }).should('be.visible');
    cy.get(
      '[data-test-subj="slosWizardValidationSummaryItem-spec.sli.definition.customExpr.errorRatioQuery"]'
    ).should('be.visible');
    cy.location('hash').should('match', /#\/slos\/create/);
  });

  it('cancel: returns to listing without creating an SLO', () => {
    const name = `Wizard validate cancel ${uniqueSuffix()}`;
    visitWizard('custom');
    fillCustomHappyPath({ name });
    cy.get('[data-test-subj="slosWizardCancel"]').click();
    cy.location('hash', { timeout: 20000 }).should('match', /#\/slos$/);
    cy.get('[data-test-subj="slosPage"]', { timeout: 30000 }).should('be.visible');
    // The catalog must not have a row for the cancelled wizard input.
    cy.contains(`[data-test-subj^="slosLink-"]`, name).should('not.exist');
  });
});
