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
} from '../utils/metrics_constants';
import { suppressResizeObserverIssue, COMMAND_TIMEOUT_LONG } from '../utils/constants';
import {
  landOnPanels,
  clearQuerySearchBoxText,
} from '../utils/event_analytics/helpers';

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

describe('Creating custom metrics', () => {
  beforeEach(() => {
    moveToEventsExplorer();
    clearQuerySearchBoxText('searchAutocompleteTextArea');
    suppressResizeObserverIssue();
  });

  it('Create custom metric in event analytics and check it in events home', () => {
    cy.get('[id^=autocomplete-textarea]').focus().type(PPL_METRICS[0], {
      delay: 50,
    });
    cy.get('.euiButton__text').contains('Refresh').trigger('mouseover').click();
    cy.wait(delay);
    suppressResizeObserverIssue();
    cy.get('button[id="main-content-vis"]').contains('Visualizations').trigger('mouseover').click();
    cy.wait(delay * 2);
    cy.get('[data-test-subj="comboBoxToggleListButton"]').click();
    cy.get('[data-test-subj="comboBoxSearchInput"]').focus().type(VIS_TYPE_LINE, { force: true });
    cy.get('[data-test-subj="eventExplorer__saveManagementPopover"]').click({ force: true });
    cy.get('[data-test-subj="eventExplorer__querySaveName"]')
      .focus()
      .type(PPL_METRICS_NAMES[0], { force: true });
    cy.get('[data-test-subj="eventExplorer__metricSaveName"]').click({ force: true });
    cy.wait(1000);
    cy.get('[data-test-subj="eventExplorer__querySaveConfirm"]', {
      timeout: COMMAND_TIMEOUT_LONG,
    }).click();
    cy.wait(delay);
    cy.get('.euiToastHeader__title').contains('successfully').should('exist');
    moveToEventsHome();
    cy.get('[data-test-subj="eventHome__savedQueryTableName"]')
      .first()
      .contains(PPL_METRICS_NAMES[0]);
  });

  it('Check for new metrics under recently created netrics', () => {
    cy.get('[id^=autocomplete-textarea]').focus().type(PPL_METRICS[1], {
      delay: 50,
    });
    cy.get('.euiButton__text').contains('Refresh').trigger('mouseover').click();
    cy.wait(delay);
    suppressResizeObserverIssue();
    cy.get('button[id="main-content-vis"]').contains('Visualizations').trigger('mouseover').click();
    cy.wait(delay * 2);
    cy.get('[data-test-subj="comboBoxInput"]').click();
    cy.get('.euiComboBoxOption__content').contains('Time series').click({ force: true });

    cy.get('[data-test-subj="eventExplorer__saveManagementPopover"]').click({ force: true });
    cy.get('[data-test-subj="eventExplorer__querySaveName"]')
      .focus()
      .type(PPL_METRICS_NAMES[1], { force: true });
    cy.get('[data-test-subj="eventExplorer__metricSaveName"]').click({ force: true });
    cy.wait(1000);
    cy.get('[data-test-subj="eventExplorer__querySaveConfirm"]', {
      timeout: COMMAND_TIMEOUT_LONG,
    }).click();
    cy.wait(delay);
    cy.get('.euiToastHeader__title').contains('successfully').should('exist');
    moveToMetricsHome();
    cy.get('[data-test-subj="metricsListItems_recentlyCreated"]')
      .contains(PPL_METRICS_NAMES[1])
      .should('exist');
  });
});

describe('Search for metrics in search bar', () => {
  beforeEach(() => {
    moveToMetricsHome();
    suppressResizeObserverIssue();
  });

  it('Search for metrics in search bar from available metrics', () => {
    cy.get('[data-test-subj="metricsSearch"]').type('metric', {
      delay: 50,
    });
    cy.wait(delay);

    cy.get('[data-test-subj="metricsListItems_recentlyCreated"]')
      .contains(PPL_METRICS_NAMES[0])
      .should('exist');
    cy.get('[data-test-subj="metricsListItems_recentlyCreated"]')
      .contains(PPL_METRICS_NAMES[1])
      .should('exist');
    cy.get('[data-test-subj="metricsListItems_recentlyCreated"]')
      .contains('go_memstats_alloc_bytes')
      .should('not.exist');
    cy.get('[data-test-subj="metricsListItems_recentlyCreated"]')
      .contains('go_threads')
      .should('not.exist');
  });
});

describe('Select and unselect metrics in sidebar', () => {
  it('Select and unselect metrics in sidebar', () => {
    moveToMetricsHome();
    suppressResizeObserverIssue();
    cy.get('[data-test-subj="metricsListItems_recentlyCreated"]')
      .contains(PPL_METRICS_NAMES[0])
      .trigger('mouseover')
      .click();
    cy.get('[data-test-subj="metricsListItems_recentlyCreated"]')
      .contains(PPL_METRICS_NAMES[1])
      .trigger('mouseover')
      .click();
    cy.wait(50);
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
    cy.wait(50);
    cy.get('[data-test-subj="metricsListItems_recentlyCreated"]')
      .contains(PPL_METRICS_NAMES[0])
      .trigger('mouseover')
      .should('exist');
    cy.get('[data-test-subj="metricsListItems_recentlyCreated"]')
      .contains(PPL_METRICS_NAMES[1])
      .trigger('mouseover')
      .should('exist');
  });
});

describe('Test Metric Visualizations', () => {
  beforeEach(() => {
    moveToMetricsHome();
    suppressResizeObserverIssue();
    cy.get('[data-test-subj="metricsListItems_recentlyCreated"]')
      .contains(PPL_METRICS_NAMES[0])
      .trigger('mouseover')
      .click();
  });

  it('Resize a Metric visualization in edit mode', () => {
    cy.get('[data-test-subj="metrics__editView"]')
      .contains('Edit view')
      .trigger('mouseover')
      .click();
    cy.wait(delay);
    cy.get('.react-resizable-handle-se')
      // .eq(1)
      .trigger('mousedown', { which: 1 })
      .trigger('mousemove', { clientX: 2000, clientY: 800 })
      .trigger('mouseup', { force: true });
    cy.wait(delay);
    cy.get('[data-test-subj="metrics__saveView"]').trigger('mouseover').click();
    cy.wait(delay * 3);
    cy.get('div.react-grid-layout>div').invoke('height').should('match', new RegExp('630'));
    cy.wait(delay);
  });

  it('Drag and drop a Metric visualization in edit mode', () => {
    cy.get('[data-test-subj="metricsListItems_recentlyCreated"]')
      .contains(PPL_METRICS_NAMES[1])
      .trigger('mouseover')
      .click();
    cy.get('[data-test-subj="metrics__editView"]')
      .contains('Edit view')
      .trigger('mouseover')
      .click();
    cy.wait(delay);
    cy.get('h5')
      .contains(PPL_METRICS_NAMES[0])
      .trigger('mousedown', { which: 1, force: true })
      .trigger('mousemove', { clientX: 415, clientY: 500 })
      .trigger('mouseup', { force: true });
    cy.wait(delay);
    cy.get('[data-test-subj="metrics__saveView"]')
      .trigger('mouseover')
      .click({ force: true })
      .then(() => {
        cy.wait(delay * 3);
        cy.get('div.react-grid-layout>div')
          .eq(1)
          .invoke('attr', 'style')
          .should('match', new RegExp('(.*)transform: translate((.*)10px)(.*)'));
        cy.wait(delay);
      });
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
    cy.wait(delay);
  });

  it('Saves metrics to an existing panel', () => {
    landOnPanels();
    cy.get('[data-test-subj="customPanels__createNewPanels"]').click();
    cy.get('input.euiFieldText').type(TESTING_PANEL);
    cy.get('.euiButton__text', { timeout: COMMAND_TIMEOUT_LONG })
      .contains(/^Create$/)
      .click();
    cy.wait(delay * 3);
    moveToMetricsHome();
    cy.get('[data-test-subj="metrics__saveManagementPopover"]').trigger('mouseover').click();
    cy.get('[data-test-subj="comboBoxSearchInput"]').focus().type(TESTING_PANEL, { force: true });
    cy.get('[data-test-subj="metrics__SaveConfirm"]').click({ force: true });
    cy.get('.euiToastHeader__title').contains('successfully').should('exist');
  });
});

describe('Has working breadcrumbs', () => {
  it('Redirect to correct page on breadcrumb click', () => {
    moveToMetricsHome();
    suppressResizeObserverIssue();
    cy.get('[data-test-subj="metricsSearch"]').should('exist');
    cy.get('.euiTitle').contains('Metrics').should('exist');
    cy.get('.euiBreadcrumb[href="observability-logs#/"]').click(),
      { timeout: COMMAND_TIMEOUT_LONG };
    cy.get('.euiTitle').contains('Logs').should('exist');
  });
});
