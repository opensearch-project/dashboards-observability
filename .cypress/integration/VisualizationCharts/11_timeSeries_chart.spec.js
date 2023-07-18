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
const timeInterval = 1;
const labelSize = 20;
const rotateLevel = 45;
const lineWidth = 7;
const lineWidthUpdated = 7;
const fillOpacity = 10;
const fillOpacityUpdated = 90;
const numberOfColor = 24;

const renderTimeSeriesChart = () => {
  landOnEventVisualizations();
  querySearch(TEST_QUERIES[4].query, TEST_QUERIES[4].dateRangeDOM);
  cy.get('[data-test-subj="comboBoxInput"]').click();
  cy.get('[data-test-subj="comboBoxOptionsList "] button span').contains('Time series').click({ force: true });
};

describe('Adding sample data for visualizations', () => {
  it('Adds sample flights data for visualizations to use', () => {
    cy.visit(`${Cypress.env('opensearchDashboards')}/app/home#/tutorial_directory/sampleData`);
    cy.get('div[data-test-subj="sampleDataSetCardlogs"]')
      .contains(/(Add|View) data/)
      .click();
  });
});

describe('Render Time series chart and verify default behaviour ', () => {
  beforeEach(() => {
    renderTimeSeriesChart();
  });

  it('Render Time series chart and verify by default the data gets render', () => {
    cy.get('.xy').should('exist');
  });

  it('Render Time series chart and verify you see data configuration panel and chart panel', () => {
    cy.get('.euiPanel.euiPanel--paddingSmall').should('have.length', numberOfWindow);
    cy.get('.euiTitle.euiTitle--xxsmall').contains('Configuration').should('exist');
    cy.get('.euiTitle.euiTitle--xxsmall').contains('dimensions').should('exist');
    cy.get('.euiTitle.euiTitle--xxsmall').contains('breakdowns').should('exist');
    cy.get('.euiButton__text').contains('Update chart').should('exist');

    cy.get('.euiIEFlexWrapFix').contains('Panel options').click();
    cy.get('.euiIEFlexWrapFix').contains('Legend').click();
    cy.get('.euiIEFlexWrapFix').contains('Chart styles').click();
  });

  it('Render Time series chart and verify the data configuration panel and chart panel are collapsable', () => {
    cy.get('.euiPanel.euiPanel--paddingSmall').should('have.length', numberOfWindow);
    cy.get('[aria-label="Press to toggle this panel"]').eq(0).click({ force: true });
    cy.get('[aria-label="Press to toggle this panel"]').eq(1).click({ force: true });
  });
});

describe('Render Time series chart for data configuration panel', () => {
  beforeEach(() => {
    renderTimeSeriesChart();
  });

  it('Render Time series chart and verify data config panel', () => {
    cy.get('[data-test-subj="explorer__vizDataConfig-panel"]').eq(0).should('contain', 'tags');
    cy.get('[data-test-subj="explorer__vizDataConfig-panel"]').eq(0).should('contain', 'count');
    cy.get('[data-test-subj="explorer__vizDataConfig-panel"]').eq(0).should('contain', 'avg bytes');
    cy.get('[data-test-subj="explorer__vizDataConfig-panel"]').eq(0).should('contain', 'host');
  });

  it('Render Time series chart and verify data config panel restrict user to select a duplicate field on dimension field', () => {
    cy.get('[data-test-subj="viz-config-delete-btn"]').eq(2).click();
    cy.get('[data-test-subj="viz-config-add-btn"]').eq(4).click();
    cy.get('[data-test-subj="comboBoxSearchInput"]').eq(0).click();
    cy.get('.euiComboBoxOption__content').contains('host');
  });

  it('Render Time series chart and verify data config panel Restrict user to select a duplicate field on Series field', () => {
    cy.get('[data-test-subj="viz-config-add-btn"]').eq(0).click();
    cy.get('[data-test-subj="comboBoxSearchInput"]').eq(0).click();
    cy.get('.euiComboBoxOption__content').contains('count');
    cy.get('.euiComboBoxOption__content').should('not.contain', 'tags');
  });

  it('Render Time series chart and verify data config panel no result found if metric is missing', () => {
    cy.get('[data-test-subj="viz-config-delete-btn"]').eq(3).click();
    cy.get('[data-test-subj="viz-config-delete-btn"]').eq(2).click();
    cy.get('.euiButton__text').contains('Update chart').click();
    cy.get('.euiTextColor.euiTextColor--subdued').contains('Invalid visualization data').should('exist');
    cy.get('[data-test-subj="viz-config-add-btn"]').eq(3).click();
    cy.get('[data-test-subj="comboBoxSearchInput"]').eq(0).click();
    cy.get('[data-test-subj="comboBoxOptionsList "]').contains('timestamp').click();
    cy.get('[data-test-subj="valueFieldNumber"]').eq(0).click().type(timeInterval);
    cy.get('[data-test-subj="comboBoxSearchInput"]').eq(1).click();
    cy.get('[data-test-subj="comboBoxOptionsList "]').contains('Hour').click();
    cy.get('[data-test-subj="panelCloseBtn"]').click({ force: true });
    cy.get('.euiButton__text').contains('Update chart').click().then(() => {
      cy.get('.main-svg').contains('Invalid visualization data').should('not.exist');
    });
  });
});

describe('Render Time series chart for panel options', () => {
  beforeEach(() => {
    renderTimeSeriesChart();
  });

  it('Render Time series chart and verify the title gets updated according to user input ', () => {
    cy.get('input[name="title"]').type('horizontal bar chart');
    cy.get('textarea[name="description"]').should('exist').click();
    cy.get('.gtitle').contains('horizontal bar chart').should('exist');
  });
});

describe('Render Time series chart for legend', () => {
  beforeEach(() => {
    renderTimeSeriesChart();
  });

  it('Render Time series chart and verify legends for Show and Hidden', () => {
    cy.get('#configPanel__legend').contains('Legend');
    cy.get('.euiTitle.euiTitle--xxsmall').contains('Show legend');
    cy.get('[data-text="Show"]').eq(0).contains('Show');
    cy.get('[data-text="Show"] [data-test-subj="show"]').should('have.attr', 'checked');
    cy.get('[data-text="Hidden"]').eq(0).contains('Hidden').click();
    cy.get('[data-text="Hidden"] [data-test-subj="hidden"]').should('not.have.attr', 'checked');
    cy.get('[data-unformatted="max(bytes)"]').should('not.exist');
  });

  it('Render Time series chart and verify legends for position Right and Bottom', () => {
    cy.get('[data-text="Right"]').should('have.text', 'Right');
    cy.get('[data-text="Right"] [data-test-subj="v"]').should('have.attr', 'checked');
    cy.get('[data-text="Bottom"]').should('have.text', 'Bottom').click();
    cy.get('[data-text="Bottom"] [data-test-subj="h"]').should('not.have.attr', 'checked');
  });
});

describe('Render Time series chart for chart style options', () => {
  beforeEach(() => {
    renderTimeSeriesChart();
  });

  it('Render Time series chart and increase Label Size ', () => {
    cy.get('[data-test-subj="valueFieldNumber"]').eq(1).click().type(labelSize);
    cy.get('textarea[name="description"]').should('exist').click();
    cy.get('[data-unformatted="0"]').should('have.css', 'font-size', '20px');
  });

  it('Render Time series chart and "Rotate bar labels"', () => {
    cy.get('input[type="range"]')
      .eq(2)
      .then(($el) => $el[0].stepUp(rotateLevel))
      .trigger('change', { force: true });
    cy.get('.euiRangeSlider').eq(2).should('have.value', rotateLevel);
  });

  it('Render Time series chart and change "Line Width"', () => {
    cy.get('input[type="range"]')
      .eq(0)
      .then(($el) => $el[0].stepUp(lineWidth))
      .trigger('change', { force: true });
    cy.get('.euiRangeSlider').eq(0).should('have.value', lineWidthUpdated);
  });

  it('Render Time series chart and change "Fill Opacity"', () => {
    cy.get('input[type="range"]')
      .eq(1)
      .then(($el) => $el[0].stepDown(fillOpacity))
      .trigger('change', { force: true });
    cy.get('.euiRangeSlider').eq(1).should('have.value', fillOpacityUpdated);
  });
});

describe('Render Time series chart threshold', () => {
  beforeEach(() => {
    renderTimeSeriesChart();
  });

  it('Render Time series chart and "Add color theme"', () => {
    cy.get('.euiButton__text').contains('+ Add threshold').click({ force: true });
    cy.get('[data-test-subj="nameFieldText"]').type('ThresholdTestLine',{ force: true })
    cy.get('[data-unformatted="ThresholdTestLine"]').should('exist');
  });
});
