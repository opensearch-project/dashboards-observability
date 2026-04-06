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

  let workspaceId;
  let startTime;
  let endTime;

  before(() => {
    if (!prometheusConfig.url) {
      throw new Error(
        'APM tests require Prometheus. Set PROMETHEUS_CONNECTION_URL environment variable.'
      );
    }

    // Chain all async operations with return to ensure proper sequencing
    return getAPMTestTimeRange()
      .then((timeRange) => {
        // Calculate time range for current time window
        startTime = formatDateForPicker(timeRange.start);
        endTime = formatDateForPicker(timeRange.end);
      })
      .then(() => {
        // Upload raw data to OpenSearch indices
        return uploadAPMDataToOpenSearch();
      })
      .then(() => {
        // Wait for Prometheus to be ready with scraped metrics
        return waitForPrometheusMetrics(prometheusConfig.url);
      })
      .then(() => {
        // Setup APM test environment with workspace, datasets, and Prometheus
        return setupAPMTestEnvironment({
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
  });

  after(() => {
    cleanupObservabilityWorkspace(workspaceName);
  });

  describe('APM Configuration and Display', () => {
    beforeEach(() => {
      // Verify Prometheus is healthy before loading the page
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

      // Set up intercepts BEFORE setting time range to capture all queries
      cy.intercept('POST', '**/api/enhancements/search/promql').as('promqlCall');
      cy.intercept('POST', '**/api/enhancements/search/ppl').as('pplCall');

      // Set time range - this triggers widget reloads with correct time range
      setAPMTimeRange(startTime, endTime);

      // Wait for loading to complete after time range change
      cy.get('[data-test-subj="globalLoadingIndicator"]', { timeout: 10000 }).should('not.exist');

      // Verify page loaded successfully with service data
      // Look for specific services from the test data
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
