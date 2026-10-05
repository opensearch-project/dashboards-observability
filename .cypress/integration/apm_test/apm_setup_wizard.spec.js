/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

import { PROMETHEUS_CLUSTER } from '../../utils/constants';
import {
  uploadAPMDataToOpenSearch,
  waitForPrometheusMetrics,
  verifyPrometheusReady,
} from '../../utils/apm_data_helpers';
import {
  setupAPMTestEnvironment,
  cleanupObservabilityWorkspace,
  deleteApmConfig,
} from '../../utils/helpers';
import { getRandomizedWorkspaceName, getRandomizedDatasetId } from '../../utils/shared';

const workspaceName = getRandomizedWorkspaceName('apm-wizard');
const traceDatasetId = getRandomizedDatasetId('trace');
const serviceDatasetId = getRandomizedDatasetId('service');
const logDatasetId = getRandomizedDatasetId('log');

const APM_RESOURCES = {
  DATASOURCE_NAME: Cypress.env('dataSourceTitle') || 'default',
  DATA_CONNECTION_NAME: 'prom_integ_test',
  TRACE_INDEX_PATTERN: 'otel_v1_apm_span_explore',
  TRACE_TIME_FIELD: 'endTime',
  SERVICE_INDEX_PATTERN: 'otel_apm_service_map_explore',
  SERVICE_TIME_FIELD: 'timestamp',
  LOG_INDEX_PATTERN: 'logs_otel_v1_explore',
  LOG_TIME_FIELD: 'time',
};

// Build the index-pattern `fields` attribute (a JSON string) so a freshly
// API-created dataset already exposes the fields the wizard gates on. Without a
// cached field list the wizard treats the dataset as "invalid" and requires a
// "Refresh fields" click first; pre-seeding the fields lets the reuse path land
// on the valid ("exists") state deterministically. The completeReuseStep helper
// below still falls back to "Refresh fields" if a step lands invalid anyway.
const field = (name, type = 'string', esType = 'keyword') =>
  JSON.stringify({
    name,
    type,
    esTypes: [esType],
    searchable: true,
    aggregatable: true,
    readFromDocValues: true,
  });
const fieldsJson = (names) => `[${names.map(([n, t, e]) => field(n, t, e)).join(',')}]`;

// Traces requires traceId, spanId, serviceName (APM_TRACES_REQUIRED_FIELDS).
const TRACE_FIELDS = fieldsJson([
  ['traceId'],
  ['spanId'],
  ['serviceName'],
  ['endTime', 'date', 'date'],
  ['startTime', 'date', 'date'],
]);
// Service map requires sourceNode, targetNode, sourceOperation, targetOperation,
// nodeConnectionHash, timestamp (APM_SERVICE_MAP_REQUIRED_FIELDS). Only this
// dataset carries these fields, so it is the sole valid service-map candidate.
const SERVICE_FIELDS = fieldsJson([
  ['sourceNode'],
  ['targetNode'],
  ['sourceOperation'],
  ['targetOperation'],
  ['nodeConnectionHash'],
  ['timestamp', 'date', 'date'],
]);

// Select an option in an EUI combo box addressed by its data-test-subj. Gates
// the open on the async load spinner being gone (the wizard swaps the options
// prop when the dataset list resolves), then scopes the option click to the
// options list so a mid-click re-render can't detach the element.
const selectComboBoxOption = (comboSubj, optionText) => {
  cy.get(`[data-test-subj="${comboSubj}"]`).as('combo');
  cy.get('@combo').find('.euiLoadingSpinner', { timeout: 60000 }).should('not.exist');
  cy.get('@combo').click();
  cy.get('.euiComboBoxOptionsList').should('be.visible');
  cy.get('.euiComboBoxOptionsList').contains(optionText).click();
  cy.get('.euiComboBoxOptionsList').should('not.exist');
};

// Drive a data step (traces / services) through to a state where Next is
// enabled, then advance. Handles both outcomes of the reconcile effect:
//  - valid: the dataset resolves as "exists" and Next is enabled immediately.
//  - invalid: the dataset's cached fields don't satisfy the requirement, so we
//    select the target dataset in the invalid picker and click "Refresh fields"
//    (which re-pulls the field list from the live index and promotes it).
const completeReuseStep = ({ stepSubj, datasetTitle, existsSubj, invalidSubj }) => {
  cy.get(`[data-test-subj="${stepSubj}"]`, { timeout: 60000 }).should('be.visible');

  // Wait for the step to settle out of its "checking" state onto either the
  // valid or invalid branch.
  cy.get('body', { timeout: 60000 }).should(($body) => {
    const settled =
      $body.find(`[data-test-subj="${existsSubj}"]`).length > 0 ||
      $body.find(`[data-test-subj="${invalidSubj}"]`).length > 0;
    expect(settled, `${stepSubj} settled onto exists/invalid`).to.eq(true);
  });

  cy.get('body').then(($body) => {
    if ($body.find(`[data-test-subj="${invalidSubj}"]`).length > 0) {
      const invalidPicker = `${invalidSubj}Picker`;
      selectComboBoxOption(invalidPicker, datasetTitle);
      cy.get(`[data-test-subj="${invalidSubj}"]`).find('[data-test-subj$="RefreshFields"]').click();
    }
  });

  // Whichever branch we came from, Next must end up enabled before we advance.
  cy.get('[data-test-subj="apmSetupWizardNext"]', { timeout: 60000 }).should('not.be.disabled');
  cy.get('[data-test-subj="apmSetupWizardNext"]').click();
};

describe('APM Setup Wizard', () => {
  const prometheusConfig = PROMETHEUS_CLUSTER;

  let workspaceId;

  before(() => {
    if (!prometheusConfig.url) {
      throw new Error(
        'APM tests require Prometheus. Set PROMETHEUS_CONNECTION_URL environment variable.'
      );
    }

    return uploadAPMDataToOpenSearch()
      .then(() => waitForPrometheusMetrics(prometheusConfig.url))
      .then(() =>
        setupAPMTestEnvironment({
          datasourceName: APM_RESOURCES.DATASOURCE_NAME,
          workspaceName,
          prometheusConnectionName: APM_RESOURCES.DATA_CONNECTION_NAME,
          prometheusUrl: prometheusConfig.url,
          datasets: {
            trace: {
              id: traceDatasetId,
              config: {
                title: APM_RESOURCES.TRACE_INDEX_PATTERN,
                signalType: 'traces',
                timestamp: APM_RESOURCES.TRACE_TIME_FIELD,
                fields: TRACE_FIELDS,
              },
            },
            service: {
              id: serviceDatasetId,
              config: {
                title: APM_RESOURCES.SERVICE_INDEX_PATTERN,
                signalType: 'logs',
                timestamp: APM_RESOURCES.SERVICE_TIME_FIELD,
                fields: SERVICE_FIELDS,
              },
            },
            log: {
              id: logDatasetId,
              config: {
                title: APM_RESOURCES.LOG_INDEX_PATTERN,
                signalType: 'logs',
                timestamp: APM_RESOURCES.LOG_TIME_FIELD,
              },
            },
          },
        }).then((wsId) => {
          workspaceId = wsId;
        })
      );
  });

  after(() => {
    cleanupObservabilityWorkspace(workspaceName);
  });

  beforeEach(() => {
    // The wizard is only reachable from the empty state, i.e. when no APM config
    // exists. Delete any config left by a prior test so every run starts from a
    // clean, unconfigured Services page.
    deleteApmConfig(workspaceId);

    verifyPrometheusReady(prometheusConfig.url);

    cy.visit(`/w/${workspaceId}/app/observability-apm-services`, {
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });
    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
  });

  it('sets up APM via the guided wizard (reuse path) and renders the Services page', () => {
    // Empty state → launch the wizard.
    cy.get('[data-test-subj="apmEmptyState"]').should('be.visible');
    cy.get('[data-test-subj="apmGetStartedButton"]').should('be.visible').click();

    // Overview step.
    cy.get('[data-test-subj="apmSetupWizardModal"]').should('be.visible');
    cy.get('[data-test-subj="apmSetupWizardOverviewStep"]').should('be.visible');
    cy.get('[data-test-subj="apmSetupWizardNext"]').should('not.be.disabled').click();

    // Traces step — reuse the existing traces dataset.
    completeReuseStep({
      stepSubj: 'apmSetupWizardTracesStep',
      datasetTitle: APM_RESOURCES.TRACE_INDEX_PATTERN,
      existsSubj: 'apmSetupWizardTracesExists',
      invalidSubj: 'apmSetupWizardTracesInvalid',
    });

    // Services step — reuse the existing service map dataset.
    completeReuseStep({
      stepSubj: 'apmSetupWizardServicesStep',
      datasetTitle: APM_RESOURCES.SERVICE_INDEX_PATTERN,
      existsSubj: 'apmSetupWizardServicesExists',
      invalidSubj: 'apmSetupWizardServicesInvalid',
    });

    // RED metrics step. The test environment has exactly one Prometheus source
    // exposing the required metrics, so the step auto-selects it and enables
    // Finish without any interaction — just wait for the probe to resolve. (We
    // deliberately don't open the picker: with a single source already selected
    // its options list is empty, so a `.contains()` click would hang.)
    cy.get('[data-test-subj="apmSetupWizardMetricsStep"]', { timeout: 60000 }).should('be.visible');

    // Finish persists the APM config and closes the wizard.
    cy.get('[data-test-subj="apmSetupWizardFinish"]', { timeout: 60000 })
      .should('not.be.disabled')
      .click();
    cy.get('[data-test-subj="apmSetupWizardModal"]').should('not.exist');

    // The Services page flips out of the empty state and renders the configured
    // UI once the config resolves.
    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
    cy.get('[data-test-subj="apmEmptyState"]').should('not.exist');

    // The wizard wrote the APM config saved object (correlations / APM-Config-*).
    cy.request({
      method: 'GET',
      url: `/w/${workspaceId}/api/saved_objects/_find`,
      headers: { 'osd-xsrf': true },
      qs: { type: 'correlations', per_page: 10000 },
    }).then((resp) => {
      const savedObjects = (resp.body && resp.body.saved_objects) || [];
      const apmConfigs = savedObjects.filter((so) =>
        (so.attributes?.correlationType || '').startsWith('APM-Config-')
      );
      expect(apmConfigs.length, 'APM config saved object was created').to.be.greaterThan(0);
    });
  });

  it('shows the empty state (wizard entry) again after the APM config is removed', () => {
    // beforeEach already deleted the config, so the empty state must be present
    // and the wizard reachable — this guards the wizard-vs-configured gating.
    cy.get('[data-test-subj="apmEmptyState"]').should('be.visible');
    cy.get('[data-test-subj="apmGetStartedButton"]').should('be.visible').click();
    cy.get('[data-test-subj="apmSetupWizardModal"]').should('be.visible');
    cy.get('[data-test-subj="apmSetupWizardCancel"]').click();
    cy.get('[data-test-subj="apmSetupWizardModal"]').should('not.exist');
  });
});
