/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

import {
  delay,
  PPL_METRICS,
  PPL_METRICS_NAMES,
  VIS_TYPE_LINE,
  TESTING_PANEL,
} from '../../utils/metrics_constants';
import { suppressResizeObserverIssue } from '../../utils/constants';
import { landOnPanels, clearQuerySearchBoxText } from '../../utils/event_analytics/helpers';

describe('Metrics Analytics', () => {
  beforeEach(() => {
    eraseSavedObjectMetrics();
  });

  describe('Creating custom metrics', () => {
    beforeEach(() => {
      moveToEventsExplorer();
      clearQuerySearchBoxText('searchAutocompleteTextArea');
      suppressResizeObserverIssue();
    });

    it('Create custom metric in event analytics and check it in events home', () => {
      createCustomMetric({ testMetricIndex: 0 });
      moveToEventsHome();
      cy.get('[data-test-subj="eventHome__savedQueryTableName"]')
        .first()
        .contains(PPL_METRICS_NAMES[0]);
    });
  });

  describe('Listing custom metrics', () => {
    it('Check for new metrics under available metrics', () => {
      createSavedObjectMetric({ testMetricIndex: 1 });

      moveToMetricsHome();
      cy.get('[data-test-subj="superDatePickerApplyTimeButton"]').click();
      cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
      cy.get('body').then(($body) => {
        if ($body.find('[data-test-subj="comboBoxClearButton"]').length > 0) {
          cy.get('[data-test-subj="comboBoxClearButton"]').first().click();
        }
      });
      cy.get('[data-test-subj="metricsDataSourcePicker"]').click();
      cy.get('[data-test-subj="prometheusOption"]').click();
      cy.get('[data-test-subj="metricsListItems_availableMetrics"]')
        .contains(PPL_METRICS_NAMES[1])
        .should('exist');
    });
  });

  describe('Sidebar Actions', () => {
    beforeEach(() => {
      moveToMetricsHome();
      createSavedObjectMetric({ testMetricIndex: 0 });
      createSavedObjectMetric({ testMetricIndex: 1 });
      suppressResizeObserverIssue();
    });

    describe('Check data source picker', () => {
      it('Index picker should be only available under Otel metric datasource', () => {
        cy.get('[data-test-subj="superDatePickerApplyTimeButton"]').click();
        cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
        cy.get('body').then(($body) => {
          if ($body.find('[data-test-subj="comboBoxClearButton"]').length > 0) {
            cy.get('[data-test-subj="comboBoxClearButton"]').first().click();
          }
        });
        cy.get('[data-test-subj="metricsDataSourcePicker"]').click();
        cy.get('[data-test-subj="prometheusOption"]').first().click();
        cy.get('[data-test-subj="metricsIndexPicker"]').should('not.exist');

        cy.get('[data-test-subj="superDatePickerApplyTimeButton"]').click();
        cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
        cy.get('body').then(($body) => {
          if ($body.find('[data-test-subj="comboBoxClearButton"]').length > 0) {
            cy.get('[data-test-subj="comboBoxClearButton"]').first().click();
          }
        });
        cy.get('[data-test-subj="metricsDataSourcePicker"]').click();
        cy.get('[data-test-subj="openTelemetryOption"]').click();
        cy.get('[data-test-subj="metricsIndexPicker"]').should('exist');
      });
    });

    describe('Search for metrics in search bar', () => {
      it('Search for metrics in search bar from available metrics', () => {
        cy.get('[data-test-subj="superDatePickerApplyTimeButton"]').click();
        cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
        cy.get('body').then(($body) => {
          if ($body.find('[data-test-subj="comboBoxClearButton"]').length > 0) {
            cy.get('[data-test-subj="comboBoxClearButton"]').first().click();
          }
        });
        cy.get('[data-test-subj="metricsDataSourcePicker"]').click();
        cy.get('[data-test-subj="prometheusOption"]').click();
        cy.get('[data-test-subj="metricsSearch"]').type('metric', { wait: 50 });

        cy.get('[data-test-subj="metricsListItems_availableMetrics"]')
          .contains(PPL_METRICS_NAMES[0])
          .should('exist');
        cy.get('[data-test-subj="metricsListItems_availableMetrics"]')
          .contains(PPL_METRICS_NAMES[1])
          .should('exist');
        cy.get('[data-test-subj="metricsListItems_availableMetrics"]')
          .contains('go_memstats_alloc_bytes')
          .should('not.exist');
        cy.get('[data-test-subj="metricsListItems_availableMetrics"]')
          .contains('go_threads')
          .should('not.exist');
      });
    });

    describe('Select and unselect metrics in sidebar', () => {
      it('Select and unselect metrics in sidebar', () => {
        cy.get('[data-test-subj="superDatePickerApplyTimeButton"]').click();
        cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
        cy.get('[data-test-subj="metricsDataSourcePicker"]').click();
        cy.get('[data-test-subj="prometheusOption"]').first().click();
        cy.get('[data-test-subj="metricsListItems_availableMetrics"]')
          .contains(PPL_METRICS_NAMES[0])
          .trigger('mouseover')
          .click();
        cy.get('[data-test-subj="metricsListItems_availableMetrics"]')
          .contains(PPL_METRICS_NAMES[1])
          .trigger('mouseover')
          .click();
        cy.wait(delay/2);
        cy.get('[data-test-subj="metricsListItems_selectedMetrics"]')
          .contains(PPL_METRICS_NAMES[0])
          .should('exist');
        cy.get('[data-test-subj="metricsListItems_selectedMetrics"]')
          .contains(PPL_METRICS_NAMES[1])
          .should('exist');
        cy.get('[data-test-subj="metricsListItems_selectedMetrics"]')
          .contains(PPL_METRICS_NAMES[0])
          .trigger('mouseover')
          .click();
        cy.get('[data-test-subj="metricsListItems_selectedMetrics"]')
          .contains(PPL_METRICS_NAMES[1])
          .trigger('mouseover')
          .click();
        cy.wait(delay/2);
        cy.get('[data-test-subj="metricsListItems_availableMetrics"]')
          .contains(PPL_METRICS_NAMES[0])
          .trigger('mouseover')
          .should('exist');
        cy.get('[data-test-subj="metricsListItems_availableMetrics"]')
          .contains(PPL_METRICS_NAMES[1])
          .trigger('mouseover')
          .should('exist');
      });
    });

    describe('Test Metric Visualizations', () => {
      beforeEach(() => {
        cy.get('[data-test-subj="superDatePickerApplyTimeButton"]').click();
        cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
        cy.get('body').then(($body) => {
          if ($body.find('[data-test-subj="comboBoxClearButton"]').length > 0) {
            cy.get('[data-test-subj="comboBoxClearButton"]').first().click();
          }
        });
        cy.get('[data-test-subj="metricsDataSourcePicker"]').click();
        cy.get('[data-test-subj="prometheusOption"]').click();
        cy.get('[data-test-subj="metricsListItems_availableMetrics"]')
          .contains(PPL_METRICS_NAMES[0])
          .trigger('mouseover')
          .click();
      });

      it('Drag and drop a Metric visualization', () => {
        cy.get('[data-test-subj="metricsListItems_availableMetrics"]')
          .contains(PPL_METRICS_NAMES[1])
          .trigger('mouseover')
          .click();
        cy.get('h5').eq(2).contains(PPL_METRICS_NAMES[1]).should('exist');;
        cy.get('[data-test-subj="draggable"]').eq(0)
        .focus()
        .type(' ')
        .type('{downarrow}')
        .type(' ');
          cy.get('h5').eq(2).contains(PPL_METRICS_NAMES[0]).should('exist');
      });

      it('Change date filter of the Metrics home page', () => {
        cy.get('.euiButtonEmpty[data-test-subj="superDatePickerToggleQuickMenuButton"]').click({
          force: true,
        });
        cy.get('.euiLink').contains('This year').trigger('mouseover').click();
        cy.wait(delay * 2);
        cy.get('.euiSuperDatePicker__prettyFormat[data-test-subj="superDatePickerShowDatesButton"]')
          .contains('This year')
          .should('exist');
      });

      it('Saves metrics to an existing panel', () => {
        landOnPanels();
        cy.get('[data-test-subj="customPanels__createNewPanels"]').click();
        cy.get('input.euiFieldText').type(TESTING_PANEL);
        cy.get('.euiButton__text')
          .contains(/^Create$/)
          .click();
        cy.wait(delay * 3);
        moveToMetricsHome();
        cy.get('[data-test-subj="metrics__saveManagementPopover"]').trigger('mouseover').click();
        cy.get('[data-test-subj="comboBoxSearchInput"]').eq(1)
          .focus()
          .type(TESTING_PANEL, { force: true });
        cy.get('[data-test-subj="metrics__SaveConfirm"]').click({ force: true });
        cy.get('.euiToastHeader__title').contains('successfully').should('exist');
      });
    });

    describe('Has working breadcrumbs', () => {
      it('Redirect to correct page on breadcrumb click', () => {
        cy.get('[data-test-subj="metricsSearch"]').should('exist');
        cy.get('.euiTitle').contains('Metrics').should('exist');
        cy.get('.euiBreadcrumb[href="observability-logs#/"]').click();
        cy.get('.euiTitle').contains('Logs').should('exist');
      });
    });
  });
});

const moveToMetricsHome = () => {
  cy.visit(`${Cypress.env('opensearchDashboards')}/app/observability-metrics#/`);
  cy.wait(delay * 3);
};

const moveToEventsExplorer = () => {
  cy.visit(`${Cypress.env('opensearchDashboards')}/app/observability-logs#/explorer`);
  cy.wait(delay * 3);
};

const moveToEventsHome = () => {
  cy.visit(`${Cypress.env('opensearchDashboards')}/app/observability-logs#/`);
  cy.wait(delay * 3);
};

const createCustomMetric = ({ testMetricIndex }) => {
  cy.get('[id^=autocomplete-textarea]').focus().type(PPL_METRICS[testMetricIndex], {
    delay: 50,
  });
  cy.get('[data-test-subj="superDatePickerApplyTimeButton"]').trigger('mouseover').click();
  suppressResizeObserverIssue();
  cy.get('button[id="main-content-vis"]').contains('Visualizations').trigger('mouseover').click();
  cy.wait(delay * 2);
  cy.get('[data-test-subj="comboBoxToggleListButton"]').eq(1).click();
  cy.get('[data-test-subj="comboBoxSearchInput"]').eq(1).focus().type(VIS_TYPE_LINE, { force: true });
  cy.get('[data-test-subj="eventExplorer__saveManagementPopover"]').click({ force: true });
  cy.get('[data-test-subj="eventExplorer__querySaveName"]')
    .focus()
    .type(PPL_METRICS_NAMES[testMetricIndex], { force: true });
  cy.get('[data-test-subj="eventExplorer__metricSaveName"]').click({ force: true });
  cy.wait(delay * 10);
  cy.get('[data-test-subj="eventExplorer__querySaveConfirm"]').click();
  cy.get('.euiToastHeader__title').contains('successfully').should('exist');
};

const createSavedObjectMetric = ({ testMetricIndex }) => {
  return cy
    .request({
      method: 'POST',
      failOnStatusCode: false,
      url: 'api/saved_objects/observability-visualization',
      headers: {
        'content-type': 'application/json;charset=UTF-8',
        'osd-xsrf': true,
      },
      body: {
        attributes: {
          title: PPL_METRICS_NAMES[testMetricIndex],
          description: '',
          version: 1,
          createdTimeMs: new Date().getTime(),
          savedVisualization: {
            query: PPL_METRICS[testMetricIndex],
            selected_date_range: {
              start: 'now-15m',
              end: 'now',
              text: '',
            },
            selected_timestamp: {
              name: 'timestamp',
              type: 'timestamp',
            },
            selected_fields: {
              tokens: [],
              text: '',
            },
            name: PPL_METRICS_NAMES[testMetricIndex],
            description: '',
            type: 'line',
            subType: 'metric',
          },
        },
      },
    })
    .then((response) => response.body);
};

const eraseSavedObjectMetrics = () => {
  return cy
    .request({
      method: 'get',
      failOnStatusCode: false,
      url: 'api/saved_objects/_find?type=observability-visualization',
      headers: {
        'content-type': 'application/json;charset=UTF-8',
        'osd-xsrf': true,
      },
    })
    .then((response) => {
      response.body.saved_objects.map((soMetric) => {
        cy.request({
          method: 'DELETE',
          failOnStatusCode: false,
          url: `api/saved_objects/observability-visualization/${soMetric.id}`,
          headers: {
            'content-type': 'application/json;charset=UTF-8',
            'osd-xsrf': true,
          },
        });
      });
    });
};
