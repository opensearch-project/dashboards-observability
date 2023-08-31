/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />
import {
  delay,
  TEST_QUERIES,
} from '../../utils/event_analytics/constants';

import {
  querySearch,
  landOnEventVisualizations,
} from '../../utils/event_analytics/helpers';

const numberOfWindow = 6;

const renderHeatMapChart = () => {
  landOnEventVisualizations();
  querySearch(TEST_QUERIES[4].query, TEST_QUERIES[4].dateRangeDOM);
  cy.get('[data-test-subj="comboBoxInput"]').click();
  cy.get('[data-test-subj="comboBoxOptionsList "] button span').contains('Heatmap').click({ force: true });
};

describe('Adding sample data for visualizations', () => {
  it('Adds sample flights data for visualizations to use', () => {
    cy.visit(`${Cypress.env('opensearchDashboards')}/app/home#/tutorial_directory/sampleData`);
    cy.get('div[data-test-subj="sampleDataSetCardlogs"]')
      .contains(/(Add|View) data/)
      .click();
  });
});

describe('Render Heatmap chart and verify default behaviour ', () => {
  beforeEach(() => {
    renderHeatMapChart();
  });

  it('Render Heatmap chart and verify by default the data gets render', () => {
    cy.get('.xy').should('exist');
  });

  it('Render Heatmap chart and verify you see data configuration panel and chart panel', () => {
    cy.get('.euiPanel.euiPanel--paddingSmall').should('have.length', numberOfWindow);
    cy.get('.euiTitle.euiTitle--xxsmall').contains('Configuration').should('exist');
    cy.get('.euiTitle.euiTitle--xxsmall').contains('dimensions').should('exist');
    cy.get('.euiButton__text').contains('Update chart').should('exist');
    cy.get('.euiIEFlexWrapFix').contains('Panel options').click();
    cy.get('.euiIEFlexWrapFix').contains('Legend').click();
    cy.get('.euiIEFlexWrapFix').contains('Chart styles').click();
  });

  it('Render Heatmap chart and verify the data configuration panel and chart panel are collapsable', () => {
    cy.get('.euiPanel.euiPanel--paddingSmall').should('have.length', numberOfWindow);
    cy.get('[aria-label="Press to toggle this panel"]').eq(0).click({ force: true });
    cy.get('[aria-label="Press to toggle this panel"]').eq(1).click({ force: true });
  });
});

describe('Render Heatmap chart for data configuration panel', () => {
  beforeEach(() => {
    renderHeatMapChart();
  });

  it('Render Heatmap chart and verify data config panel', () => {
    cy.get('[data-test-subj="explorer__vizDataConfig-panel"]').eq(0).should('contain', 'tags');
    cy.get('[data-test-subj="explorer__vizDataConfig-panel"]').eq(0).should('contain', 'count');
    cy.get('[data-test-subj="explorer__vizDataConfig-panel"]').eq(0).should('contain', 'avg bytes');
    cy.get('[data-test-subj="explorer__vizDataConfig-panel"]').eq(0).should('contain', 'host');
  });

  it('Render Heatmap chart and verify data config panel restrict user to select a duplicate field on dimension field', () => {
    cy.get('[data-test-subj="viz-config-delete-btn"]').eq(2).click();
    cy.get('[data-test-subj="viz-config-add-btn"]').eq(3).click();
    cy.get('[data-test-subj="comboBoxSearchInput"]').eq(0).click();
    cy.get('.euiComboBoxOption__content').contains('host');
  });

  it('Render Heatmap chart and verify data config panel Restrict user to select a duplicate field on Series field', () => {
    cy.get('[data-test-subj="viz-config-add-btn"]').eq(0).click();
    cy.get('[data-test-subj="comboBoxSearchInput"]').eq(0).click();
    cy.get('.euiComboBoxOption__content').contains('count');
    cy.get('.euiComboBoxOption__content').should('not.contain', 'tags');
  });

  it('Render Heatmap chart and verify data config panel no result found if metric is missing', () => {
    cy.get('[data-test-subj="viz-config-delete-btn"]').eq(3).click();
    cy.get('[data-test-subj="viz-config-delete-btn"]').eq(2).click();
    cy.get('.euiButton__text').contains('Update chart').click();
    cy.get('.euiTextColor.euiTextColor--subdued').contains('Invalid visualization data').should('exist');
    cy.get('[data-test-subj="viz-config-add-btn"]').eq(2).click();
    cy.get('[data-test-subj="comboBoxSearchInput"]').eq(0).click();
    cy.get('[data-test-subj="comboBoxOptionsList "]').contains('host').click();
    cy.get('[data-test-subj="panelCloseBtn"]').click({ force: true });
    cy.get('.euiButton__text').contains('Update chart').click().then(() => {
      cy.get('.main-svg').contains('Invalid visualization data').should('not.exist');
    });
  });
});

describe('Render Heatmap chart for panel options', () => {
  beforeEach(() => {
    renderHeatMapChart();
  });

  it('Render Heatmap chart and verify the title gets updated according to user input ', () => {
    cy.get('input[name="title"]').type('horizontal bar chart');
    cy.get('textarea[name="description"]').should('exist').click();
    cy.get('.gtitle').contains('horizontal bar chart').should('exist');
  });
});

describe('Render Heatmap chart for legend', () => {
  beforeEach(() => {
    renderHeatMapChart();
  });

  it('Render Heatmap chart and verify legends for Show and Hidden', () => {
    cy.get('.euiTitle.euiTitle--xxsmall').contains('Show colorscale');
    cy.get('[data-text="Show"]').eq(1).contains('Show');
    cy.get('[data-text="Show"] [data-test-subj="show"]').should('have.attr', 'checked');
    cy.get('[data-text="Hidden"]').eq(1).contains('Hidden').click();
    cy.get('[data-text="Hidden"] [data-test-subj="hidden"]').should('not.have.attr', 'checked');
  
  });
});

describe('Render Heatmap chart for color theme', () => {
  beforeEach(() => {
    renderHeatMapChart();
  });

  it('Render Heatmap chart and change color theme', () => {
    cy.get('[data-test-subj="comboBoxInput"]').eq(1).click({ force: true });
    cy.get('.euiComboBoxOption__content').contains('opacity').click({ force: true });
    cy.get('[data-test-subj="comboBoxInput"]').eq(1).contains('opacity').should('exist');
  });
});
