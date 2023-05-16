/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

import {
    TEST_PANEL,
    PPL_VISUALIZATIONS,
    PPL_VISUALIZATIONS_NAMES,
    NEW_VISUALIZATION_NAME,
    PPL_FILTER,
    SAMPLE_PANEL,
    SAMPLE_VISUALIZATIONS_NAMES,
  } from '../utils/panel_constants';  
import {
      delay,
      PPL_METRICS,
      PPL_METRICS_NAMES,
      VIS_TYPE_LINE
  } from '../utils/metrics_constants';
import { suppressResizeObserverIssue, COMMAND_TIMEOUT_LONG } from '../utils/constants';
import { clearQuerySearchBoxText } from '../utils/event_analytics/helpers';

  
  const moveToMetricsHome = () => {
    cy.visit(
      `${Cypress.env('opensearchDashboards')}/app/observability-metrics#/`
    );
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
  
  const moveToPanelHome = () => {
    cy.visit(
      `${Cypress.env('opensearchDashboards')}/app/observability-dashboards#/`
    );
    cy.wait(delay * 3);
  };
  
  const moveToTestPanel = () => {
    moveToPanelHome();
    cy.get('.euiTableCellContent').contains(TEST_PANEL).trigger('mouseover').click();
    cy.wait(delay * 3);
    cy.get('h1').contains(TEST_PANEL).should('exist');
    cy.wait(delay);
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
      cy.get('[data-test-subj="comboBoxInput"]').click();
      cy.get('.euiComboBoxOption__content').contains('Time series').click({ force: true });

      cy.get('[data-test-subj="eventExplorer__saveManagementPopover"]').click({ force: true });
      cy.get('[data-test-subj="eventExplorer__querySaveName"]')
      .focus()
      .type(PPL_METRICS_NAMES[0], { force: true });
      // cy.get('[data-test-subj="eventExplorer__querySaveConfirm"]', { timeout: COMMAND_TIMEOUT_LONG }).click();

      // cy.get('[data-test-subj="eventExplorer__saveManagementPopover"]').trigger('mouseover').click();
      // cy.wait(1000);
      // cy.get('[data-test-subj="eventExplorer__querySaveName"]')
      //   // .focus()
      //   .type(PPL_METRICS_NAMES[0], {
      //     delay: 50,
      //   });
      cy.get('[data-test-subj="eventExplorer__metricSaveName"]').trigger('mouseover').click();
      cy.wait(1000);
      cy.get('[data-test-subj="eventExplorer__querySaveConfirm"]', { timeout: COMMAND_TIMEOUT_LONG }).click();
      // cy.get('[data-test-subj="eventExplorer__querySaveConfirm"]').trigger('mouseover').click();
      cy.wait(delay);
      cy.get('.euiToastHeader__title').contains('successfully').should('exist');
      moveToEventsHome();
      cy.get('[data-test-subj="eventHome__savedQueryTableName"]').first().contains(PPL_METRICS_NAMES[0]);
    });
  
    it('Check for new metric under recently created netrics', () => {
      cy.get('[id^=autocomplete-textarea]').focus().type(PPL_METRICS[1], {
        delay: 50,
      });
      cy.get('.euiButton__text').contains('Refresh').trigger('mouseover').click();
      cy.wait(delay);
      suppressResizeObserverIssue();
      cy.get('button[id="main-content-vis"]').contains('Visualizations').trigger('mouseover').click();
      cy.wait(delay * 2);
      cy.get('[data-test-subj="eventExplorer__vizTypeComboBox"]').trigger('mouseover').click();
      cy.get('.euiComboBoxOption__content').contains('Time series').click();
      cy.get('[data-test-subj="eventExplorer__saveManagementPopover"]').trigger('mouseover').click();
      cy.wait(1000);
      cy.get('[data-test-subj="eventExplorer__querySaveName"]')
        .focus()
        .type(PPL_METRICS_NAMES[1], {
          delay: 50,
        });
      cy.get('[data-test-subj="eventExplorer__metricSaveName"]').trigger('mouseover').click();
      cy.wait(1000);
      cy.get('[data-test-subj="eventExplorer__querySaveConfirm"]').trigger('mouseover').click();
      cy.wait(delay);
      cy.get('.euiToastHeader__title').contains('successfully').should('exist');
      moveToMetricsHome();
      cy.get('[data-test-subj="metricsListItems_recentlyCreated"]')
        .contains('Average value by virtual memory bytes').should('exist');
      }); 
  });
  
  describe('Search for metrics in search bar', () => {
    beforeEach(() => {
      moveToMetricsHome();
    });
  
    it('Search for metrics in search bar from available metrics', () => {
      cy.get('[data-test-subj="metricsSearch"]').focus().type('memstats', {
          delay: 50,
        });
        cy.wait(delay);
    
        cy.get('[data-test-subj="metricsListItems_availableMetrics"]').contains('go_memstats').should('exist');
        cy.get('[data-test-subj="metricsListItems_availableMetrics"]').contains('memstats_heap').should('exist');
        cy.get('[data-test-subj="metricsListItems_availableMetrics"]').contains('go_memstats_alloc_bytes').should('exist');
        cy.get('[data-test-subj="metricsListItems_availableMetrics"]').contains('go_info').should('not.exist');
        cy.get('[data-test-subj="metricsListItems_availableMetrics"]').contains('go_threads').should('not.exist');
    });
  });
  
  describe('Select and unselect metrics in sidebar', () => {
      beforeEach(() => {
        moveToMetricsHome();
      });
    
      it('Move metrics to selected metrics when clicked on', () => {
          cy.get('[data-test-subj="metricsListItems_availableMetrics"]').contains('go_memstats_alloc_bytes').trigger('mouseover').click();
          cy.get('[data-test-subj="metricsListItems_availableMetrics"]').contains('go_threads').trigger('mouseover').click();
          cy.wait(50);
          cy.get('[data-test-subj="metricsListItems_selectedMetrics"]').contains('go_memstats_alloc_bytes').should('exist');
          cy.get('[data-test-subj="metricsListItems_selectedMetrics"]').contains('go_threads').should('exist');
      });
  
      it('Unselected metrics should move to available metrics', () => {
          cy.get('[data-test-subj="metricsListItems_selectedMetrics"]').contains('go_memstats_alloc_bytes').trigger('mouseover').click();
          cy.get('[data-test-subj="metricsListItems_selectedMetrics"]').contains('go_threads').trigger('mouseover').click();
          cy.wait(50);
          cy.get('[data-test-subj="metricsListItems_availableMetrics"]').contains('go_memstats_alloc_bytes').should('exist');
          cy.get('[data-test-subj="metricsListItems_availableMetrics"]').contains('go_threads').should('exist');
      });
  });
  
  describe('Test Metric Visualizations', () => {
      beforeEach(() => {
        moveToMetricsHome();
      });
  
  it('Resize a Metric visualization in edit mode', () => {
      cy.get('.euiButton__text').contains('Edit').trigger('mouseover').click();
      cy.wait(delay);
      cy.get('.react-resizable-handle')
        .eq(1)
        .trigger('mousedown', { which: 1 })
        .trigger('mousemove', { clientX: 2000, clientY: 800 })
        .trigger('mouseup', { force: true });
      cy.wait(delay);
      cy.get('[data-test-subj="metrics__saveView]').trigger('mouseover').click();
      cy.wait(delay * 3);
      cy.get('div.react-grid-layout>div').eq(1).invoke('height').should('match', new RegExp('470'));
      cy.wait(delay);
    });
  
    it('Drag and drop a Metric visualization in edit mode', () => {
      cy.get('.euiButton__text').contains('Edit').trigger('mouseover').click();
      cy.wait(delay);
      cy.get('h5')
        .contains(PPL_METRICS_NAMES[1])
        .trigger('mousedown', { which: 1 })
        .trigger('mousemove', { clientX: 1100, clientY: 0 })
        .trigger('mouseup', { force: true });
      cy.wait(delay);
      cy.get('[data-test-subj="metrics__saveView]').trigger('mouseover').click();
      cy.wait(delay * 3);
      cy.get('div.react-grid-layout>div')
        .eq(1)
        .invoke('attr', 'style')
        .should('match', new RegExp('(.*)transform: translate((.*)10px)(.*)'));
      cy.wait(delay);
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
  
    it('Change span value interval', () => {
      cy.get('[data-test-subj="metrics__spanValue"]').focus().type('3', {
          delay: 50,
        });
      cy.get('[data-test-subj="metrics__spanResolutionSelect"]').eq('hours').trigger('mouseover').click();
      cy.get('.euiButton__text').contains('Refresh').trigger('mouseover').click();
      cy.wait(delay);
      suppressResizeObserverIssue();
      cy.get('[data-test-subj="metrics__spanValue"]').contains('3').should('exist');
      cy.get('[data-test-subj="metrics__spanResolutionSelect"]').contains('hours').should('exist');
    });
  
  
  });
  
  describe('Has working breadcrumbs', () => {
      it('Redirect to correct page on breadcrumb click', () => {
        moveToMetricsHome();
        cy.get('.euiBreadcrumb[href="/observability_metrics#/"]').contains('Metrics analytics').click();
        cy.get('[data-test-subj="metricsSearch"]').should('exist');
        cy.get('.euiTitle').contains('Metrics analytics').should('exist');
        cy.get('.euiBreadcrumb[href="observability-dashboards#/"]').contains('Observability').click();
        cy.get('.euiTitle').contains('Metrics analytics').should('exist');
      });
    });