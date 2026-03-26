/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

import { PROMETHEUS_CLUSTER } from '../../utils/constants';
import { uploadAPMDataToOpenSearch, waitForPrometheusMetrics, verifyPrometheusReady, getAPMTestTimeRange } from '../../utils/apm_data_helpers';
import { setupAPMTestEnvironment, cleanupObservabilityWorkspace } from '../../utils/helpers';
import { getRandomizedWorkspaceName, getRandomizedDatasetId, formatDateForPicker } from '../../utils/shared';

const workspaceName = getRandomizedWorkspaceName('apm-services');
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

const setAPMTimeRange = (startDate, endDate) => {
  const opts = { log: false };

  // Close any open popovers first
  cy.get('body', opts).then(($body) => {
    if ($body.find('[data-test-subj="superDatePickerAbsoluteTab"]').length > 0) {
      cy.get('body').type('{esc}', opts);
    }
  });

  // Find and click the date picker button
  cy.getElementsByTestIds(
    ['superDatePickerstartDatePopoverButton', 'superDatePickerShowDatesButton'],
    opts
  )
    .should('be.visible')
    .invoke('attr', 'data-test-subj')
    .then((testId) => {
      cy.getElementByTestId(testId, opts).should('be.visible').click(opts);
    });

  // Ensure date selection dialog is open
  cy.whenTestIdNotFound('superDatePickerAbsoluteTab', () => {
    cy.getElementByTestId('superDatePickerstartDatePopoverButton', opts)
      .should('be.visible')
      .click(opts);
  });

  // Set start date
  cy.getElementByTestId('superDatePickerAbsoluteTab', opts).first(opts).click(opts);
  cy.getElementByTestId('superDatePickerAbsoluteDateInput', opts)
    .first(opts)
    .click(opts)
    .clear(opts)
    .type(startDate, { ...opts, delay: 0 });

  // Set end date
  cy.getElementByTestId('superDatePickerendDatePopoverButton', opts).last(opts).click(opts);
  cy.getElementByTestId('superDatePickerAbsoluteTab', opts).last(opts).click(opts);
  cy.getElementByTestId('superDatePickerAbsoluteDateInput', opts)
    .last(opts)
    .click(opts)
    .clear(opts)
    .type(endDate, { ...opts, delay: 0 });

  // Close popup
  cy.getElementByTestId('superDatePickerendDatePopoverButton', opts).click(opts);

  // Click Apply button
  cy.get('[data-test-subj="superDatePickerApplyTimeButton"]').should('be.visible').click();
  cy.get('[data-test-subj="globalLoadingIndicator"]', { timeout: 60000 }).should('not.exist');
};

describe('APM Services Page', () => {
  const prometheusConfig = PROMETHEUS_CLUSTER;
  const timeRange = getAPMTestTimeRange();
  const startTime = formatDateForPicker(timeRange.start);
  const endTime = formatDateForPicker(timeRange.end);

  let workspaceId;

  before(() => {
    if (!prometheusConfig.url) {
      throw new Error(
        'APM tests require Prometheus. Set PROMETHEUS_CONNECTION_URL environment variable.'
      );
    }

    // Upload raw data to OpenSearch indices
    uploadAPMDataToOpenSearch();

    // Wait for Prometheus to scrape metrics
    cy.log(`Waiting for Prometheus at ${prometheusConfig.url} to scrape metrics`);
    waitForPrometheusMetrics(prometheusConfig.url);

    // Setup APM test environment with workspace, datasets, and Prometheus
    setupAPMTestEnvironment({
      datasourceName: APM_RESOURCES.DATASOURCE_NAME,
      workspaceName: workspaceName,
      prometheusConnectionName: APM_RESOURCES.DATA_CONNECTION_NAME,
      prometheusUrl: prometheusConfig.url,
      datasets: {
        trace: {
          id: traceDatasetId,
          config: {
            title: APM_RESOURCES.TRACE_INDEX_PATTERN,
            signalType: 'traces',
            timestamp: APM_RESOURCES.TRACE_TIME_FIELD,
          },
        },
        service: {
          id: serviceDatasetId,
          config: {
            title: APM_RESOURCES.SERVICE_INDEX_PATTERN,
            signalType: 'logs',
            timestamp: APM_RESOURCES.SERVICE_TIME_FIELD,
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
    });
  });

  after(() => {
    cleanupObservabilityWorkspace(workspaceName);
  });

  describe('APM Configuration and Display', () => {
    beforeEach(() => {
      // Verify Prometheus still has metrics before loading the page
      verifyPrometheusReady(prometheusConfig.url);

      // Navigate to APM Services page in the workspace
      cy.visit(`/w/${workspaceId}/app/observability-apm-services`, {
        onBeforeLoad: (win) => {
          win.sessionStorage.clear();
        },
      });
      cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
    });

    it('should configure APM settings and display services page', () => {
      // Click "Get started" button to open settings modal
      cy.contains('button', 'Get started').should('be.visible').click();

      // Wait for modal to appear
      cy.get('.euiModal').should('be.visible');
      cy.get('.euiModalHeader').should('be.visible');

      // Select Traces dataset
      cy.get('.euiFormRow')
        .contains('Traces')
        .parent()
        .parent()
        .find('.euiComboBox')
        .click();
      cy.get('.euiComboBoxOptionsList').should('be.visible');
      cy.contains(APM_RESOURCES.TRACE_INDEX_PATTERN).click();
      cy.get('.euiComboBoxOptionsList').should('not.exist');

      // Select Services dataset
      cy.get('.euiFormRow')
        .contains('Services')
        .parent()
        .parent()
        .find('.euiComboBox')
        .click();
      cy.get('.euiComboBoxOptionsList').should('be.visible');
      cy.contains(APM_RESOURCES.SERVICE_INDEX_PATTERN).click();
      cy.get('.euiComboBoxOptionsList').should('not.exist');

      // Select Prometheus data source
      cy.get('.euiFormRow')
        .contains('RED Metrics')
        .parent()
        .parent()
        .find('.euiComboBox')
        .click();
      cy.get('.euiComboBoxOptionsList').should('be.visible');
      cy.contains(APM_RESOURCES.DATA_CONNECTION_NAME).click();
      cy.get('.euiComboBoxOptionsList').should('not.exist');

      // Click Apply button
      cy.get('.euiModalFooter').find('.euiButton--fill').click();

      // Wait for modal to close and page to reload
      cy.get('.euiModal').should('not.exist');
      cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');

      // Set time range
      setAPMTimeRange(startTime, endTime);

      // Debug: Check what Prometheus actually has
      cy.log('=== DEBUG: Checking Prometheus metrics ===');

      cy.request({
        method: 'GET',
        url: `${prometheusConfig.url}/api/v1/query`,
        qs: { query: 'fault{remoteService=""}' },
      }).then((resp) => {
        const count = resp.body.data.result.length;
        cy.log(`✓ Prometheus has ${count} fault metric series with remoteService=""`);

        if (count > 0) {
          const sample = resp.body.data.result[0];
          cy.log('Sample fault metric labels:', JSON.stringify(sample.metric));
          cy.log('Sample fault value:', JSON.stringify(sample.value));

          // Print to Node console for CI visibility
          cy.task('log', `Prometheus fault metrics count: ${count}`);
          cy.task('log', `Sample: ${JSON.stringify(sample)}`);
        } else {
          cy.task('log', '⚠️  WARNING: No fault metrics with remoteService="" found in Prometheus!');
        }

        // Fail fast if no metrics
        expect(count, 'Should have fault metrics in Prometheus').to.be.greaterThan(0);
      });

      cy.request({
        method: 'GET',
        url: `${prometheusConfig.url}/api/v1/query`,
        qs: { query: 'request{remoteService=""}' },
      }).then((resp) => {
        const count = resp.body.data.result.length;
        cy.log(`✓ Prometheus has ${count} request metric series with remoteService=""`);
        cy.task('log', `Prometheus request metrics count: ${count}`);
        expect(count, 'Should have request metrics in Prometheus').to.be.greaterThan(0);
      });

      // Debug: Check OSD's Prometheus query API
      cy.log('=== DEBUG: Testing OSD Prometheus query API ===');
      cy.request({
        method: 'GET',
        url: '/api/directquery/dataconnections/query',
        qs: {
          dataSourceMDSId: 'prom_integ_test',
          query: 'sum(fault{remoteService="",namespace="span_derived"}) by (service)',
        },
        failOnStatusCode: false,
      }).then((resp) => {
        cy.log(`OSD query status: ${resp.status}`);
        cy.task('log', `OSD Prometheus query status: ${resp.status}`);
        cy.task('log', `OSD query response: ${JSON.stringify(resp.body)}`);

        if (resp.status !== 200) {
          cy.task('log', `⚠️  ERROR: OSD Prometheus query failed with status ${resp.status}`);
        }
      });

      // Verify page loaded successfully with service data
      // Look for specific services from the test data
      cy.wait(60000);
      cy.get('body').should('contain', 'cart');
    });

    it('should navigate to Application Map page', () => {
      cy.visit(`/w/${workspaceId}/app/observability-apm-application-map`, {
        onBeforeLoad: (win) => {
          win.sessionStorage.clear();
        },
      });
      cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');

      // Set time range
      setAPMTimeRange(startTime, endTime);

      // Verify Application Map page loaded
      cy.get('[data-test-subj="applicationMapPage"]', { timeout: 30000 }).should('be.visible');
      cy.contains('View insights').should('be.visible');
    });
  });
});
