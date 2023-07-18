/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />
import {
  TEST_QUERIES,
  aggregationValues,
} from '../../utils/event_analytics/constants';

import {
  querySearch,
  landOnEventVisualizations,
  saveVisualizationAndVerify,
  deleteVisualization,
} from '../../utils/event_analytics/helpers';

const renderPieChart = () => {
  landOnEventVisualizations();
  querySearch(TEST_QUERIES[3].query, TEST_QUERIES[3].dateRangeDOM);
  cy.get('[data-test-subj="comboBoxInput"]').click();
  cy.get('[data-test-subj="comboBoxOptionsList "] button span').contains('Pie').click({ force: true });
};

describe('Adding sample data and visualization', () => {
  it('Adds sample flights data for visualizations to use', () => {
    cy.visit(`${Cypress.env('opensearchDashboards')}/app/home#/tutorial_directory/sampleData`);
    cy.get('div[data-test-subj="sampleDataSetCardflights"]')
      .contains(/(Add|View) data/)
      .click();
  });
});

describe('Render Pie chart and verify default behavior', () => {
  beforeEach(() => {
    renderPieChart();
  });

  it('Render Pie chart and verify the default data', () => {
    cy.get('.plot-container.plotly').should('exist');
  });

  it('Render Pie chart and verify Data Configuration panel default behavior', () => {
    cy.get('.euiTitle.euiTitle--xxsmall').contains('Configuration').should('exist');
    cy.get('.euiTitle.euiTitle--xxsmall').contains('dimensions').should('exist');
    cy.get('.euiTitle.euiTitle--xxxsmall').contains('Query fields').should('exist');
    cy.get('.euiButton__text').contains('Update chart').should('exist');
  });

  it('Render Pie chart and verify Style section for Pie chart', () => {
    cy.get('#data-panel').contains('Style').should('exist');
    cy.get('[aria-controls="configPanel__panelOptions"]').contains('Panel options').should('exist');
    cy.get('[aria-controls="configPanel__legend"]').contains('Legend').should('exist');
    cy.get('.euiForm.visEditorSidebar__form .euiIEFlexWrapFix')
      .contains('Tooltip options')
      .should('exist');
    cy.get('[aria-controls="configPanel__chartStyles"]').should('exist');
  });

  it('Options under Legend section', () => {
    cy.get('#configPanel__legend').contains('Legend');
    cy.get('.euiTitle.euiTitle--xxsmall').contains('Show legend');
    cy.get('[data-text="Show"]').eq(0).contains('Show');
    cy.get('[data-text="Hidden"]').eq(0).contains('Hidden');
    cy.get('.euiTitle.euiTitle--xxsmall').contains('Position');
    cy.get('[data-text="Right"]').contains('Right');
    cy.get('[data-text="Bottom"]').contains('Bottom');
    cy.get('.euiTitle.euiTitle--xxsmall').contains('Legend size').should('exist');
  });

  it('Options under Tooltip options section', () => {
    cy.get('.euiIEFlexWrapFix').contains('Tooltip options').should('exist');
    cy.get('[data-text="Show"]').eq(1).contains('Show');
    cy.get('[data-text="Hidden"]').eq(1).contains('Hidden');
    cy.get('.euiTitle.euiTitle--xxsmall').contains('Tooltip text');
    cy.get('[data-text="All"]').contains('All');
    cy.get('[data-text="Label"]').contains('Label');
    cy.get('[data-text="Value"]').contains('Value');
    cy.get('[data-text="Percent"]').contains('Percent');
  });

  it('Options under Chart Styles section', () => {
    cy.get('.euiIEFlexWrapFix').contains('Chart styles').should('exist');
    cy.get('#configPanel__chartStyles').contains('Mode');
    cy.get('.euiTitle.euiTitle--xxsmall').eq(9).contains('Label size');
  });

  it('Table view should be enabled for Pie chart', () => {
    cy.get('.euiSwitch__label').contains('Table view').should('exist');
    cy.get('[data-test-subj="workspace__dataTableViewSwitch"][aria-checked="false"]').click();
    cy.get('.ag-header.ag-pivot-off').should('exist');
  });

  it('Render Pie chart and verify legends for Position Right and Bottom', () => {
    cy.get('[data-text="Right"]').should('have.text', 'Right');
    cy.get('[data-text="Right"] [data-test-subj="v"]').should('have.attr', 'checked');
    cy.get('[data-text="Bottom"]').should('have.text', 'Bottom').click();
    cy.get('[data-text="Bottom"] [data-test-subj="h"]').should('not.have.attr', 'checked');
    cy.get('[data-test-subj="visualizeEditorRenderButton"]').click({ force: true, multiple: true });
  });

  it('Render Pie chart and verify legends for Show and Hidden', () => {
    cy.get('[data-text="Show"]').eq(0).should('have.text', 'Show');
    cy.get('[data-text="Show"] [data-test-subj="show"]').should('have.attr', 'checked');
    cy.get('[data-text="Hidden"]').eq(0).should('have.text', 'Hidden').click();
    cy.get('[data-text="Hidden"] [data-test-subj="hidden"]').should('not.have.attr', 'checked');
    cy.get('[data-test-subj="visualizeEditorRenderButton"]').click({ force: true, multiple: true });
  });

  it('Render Pie chart and verify Chart Style works', () => {
    cy.get('[data-test-subj="pie"]').should('exist');
    cy.get('[data-test-subj="pie"]').should('have.attr', 'checked');
    cy.get('[data-test-subj="donut"]').should('exist').click({ force: true });
    cy.get('[data-test-subj="donut"]').should('not.have.attr', 'checked');
  });
});

describe('Save and Delete Visualization', () => {
  beforeEach(() => {
    renderPieChart();
  });

  it('Render Pie chart, Save and Delete Visualization', () => {
    saveVisualizationAndVerify();
    deleteVisualization();
  });
});

describe('Renders Pie chart and Configurations section for Pie chart', () => {
  beforeEach(() => {
    landOnEventVisualizations();
    renderPieChart();
  });

  it('Verify drop down values for Series Aggregation', () => {
    cy.get('.euiTitle.euiTitle--xxsmall').contains('Configuration').should('exist');
    cy.get('.euiTitle.euiTitle--xxsmall').eq(1).contains('series').should('exist');
    cy.get('[data-test-subj="viz-config-add-btn"]').eq(0).click();
    cy.get('[data-test-subj="comboBoxSearchInput"]').eq(0).click();
    aggregationValues.forEach(function (value) {
      cy.get('.euiComboBoxOption__content').contains(value);
    });
    cy.get('[data-test-subj="panelCloseBtn"]').eq(0).click();
  });

  it('Render Pie chart and verify the data configuration panel and chart panel are collapsable', () => {
    cy.get('[aria-label="Press to toggle this panel"]').eq(0).click({ force: true });
    cy.get('[class*="euiResizableToggleButton-isCollapsed"]').eq(0).should('exist');
    cy.get('[aria-label="Press to toggle this panel"]').eq(1).click({ force: true });
    cy.get('[class*="euiResizableToggleButton-isCollapsed"]').eq(1).should('exist');
  });
});
