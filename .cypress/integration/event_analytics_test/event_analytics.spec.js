/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />
import {
  TEST_QUERIES,
  TESTING_PANEL,
  SAVE_QUERY1,
  SAVE_QUERY2,
  SAVE_QUERY3,
  SAVE_QUERY4,
  YEAR_TO_DATE_DOM_ID,
  HOST_TEXT_1,
  HOST_TEXT_2,
  HOST_TEXT_3,
  HOST_TEXT_4,
  BAR_LEG_TEXT_1,
  BAR_LEG_TEXT_2,
  BAR_LEG_TEXT_3,
  VIS_TYPE_PIE,
  VIS_TYPE_VBAR,
  FIELD_HOST,
  FIELD_AGENT,
} from '../../utils/event_analytics/constants';
import { COMMAND_TIMEOUT_LONG } from '../../utils/constants';
import {
  querySearch,
  landOnEventHome,
  landOnEventExplorer,
  landOnEventVisualizations,
  landOnPanels,
  clearQuerySearchBoxText,
  selectDefaultDataSource
} from '../../utils/event_analytics/helpers';

const prepareDefaultSearchOnExplorer = () => {
  landOnEventExplorer();
  selectDefaultDataSource();
  clearQuerySearchBoxText('searchAutocompleteTextArea');
};

describe('Adding sample data and visualization', () => {
  it('Adds sample flights data for event analytics', () => {
    cy.visit(`${Cypress.env('opensearchDashboards')}/app/home#/tutorial_directory/sampleData`);
    cy.get('div[data-test-subj="sampleDataSetCardflights"]')
      .contains(/(Add|View) data/)
      .click();
  });
});

describe('Has working breadcrumbs', () => {
  it('Redirect to correct page on breadcrumb click', () => {
    landOnEventExplorer();
    cy.get('.euiBreadcrumb[href="observability-logs#/"]', {
      timeout: COMMAND_TIMEOUT_LONG,
    }).click();
    cy.get('.euiTitle').contains('Logs').should('exist');
  });
});

describe('Saves a query on explorer page', () => {
  it('Saves a visualization on visualization tab of explorer page', () => {
    prepareDefaultSearchOnExplorer();
    querySearch(TEST_QUERIES[1].query, TEST_QUERIES[1].dateRangeDOM);
    cy.get('button[id="main-content-vis"]').contains('Visualizations').click();
    cy.get('[data-test-subj="eventExplorer__saveManagementPopover"]').click();
    cy.get('[data-test-subj="eventExplorer__querySaveName"]')
      .focus()
      .type(SAVE_QUERY2, { force: true });
    cy.get('[data-test-subj="eventExplorer__querySaveConfirm"]').click({ force: true });
    cy.get('.euiToastHeader__title').contains('successfully').should('exist');
    landOnEventHome();
    cy.get('.euiFieldSearch').type(SAVE_QUERY2);
    cy.get('[data-test-subj="eventHome__savedQueryTableName"]').first().contains(SAVE_QUERY2);
  });

  it('Saves a visualization to an existing panel', () => {
    landOnPanels();
    cy.get('[data-test-subj="customPanels__createNewPanels"]').click();
    cy.get('input.euiFieldText').type(TESTING_PANEL);
    cy.get('.euiButton__text', { timeout: COMMAND_TIMEOUT_LONG })
      .contains(/^Create$/)
      .click();
    landOnEventExplorer();
    querySearch(TEST_QUERIES[1].query, TEST_QUERIES[1].dateRangeDOM);
    cy.get('button[id="main-content-vis"]', { timeout: COMMAND_TIMEOUT_LONG })
      .contains('Visualizations')
      .click();
    cy.get('[data-test-subj="eventExplorer__saveManagementPopover"]').click();
    cy.get('[data-test-subj="eventExplorer__querySaveName"]')
      .focus()
      .type(SAVE_QUERY3, { force: true });
    cy.get('[data-test-subj="eventExplorer__querySaveComboBox"]').type(TESTING_PANEL);
    cy.get(`input[value="${TESTING_PANEL}"]`).click();
    cy.get('[data-test-subj="eventExplorer__querySaveConfirm"]').click({ force: true });
    cy.get('.euiToastHeader__title').contains('successfully').should('exist');
  });

  it('Saves a query on event tab of explorer page', () => {
    prepareDefaultSearchOnExplorer();
    querySearch(TEST_QUERIES[0].query, TEST_QUERIES[0].dateRangeDOM);

    cy.get('.tab-title').contains('Events').click();
    cy.get('[data-test-subj="eventExplorer__saveManagementPopover"]').click();
    cy.get('[data-test-subj="eventExplorer__querySaveName"]').type(SAVE_QUERY1);
    cy.get('[data-test-subj="eventExplorer__querySaveConfirm"]', {
      timeout: COMMAND_TIMEOUT_LONG,
    }).click();

    cy.get('.euiToastHeader__title', { timeout: COMMAND_TIMEOUT_LONG })
      .contains('successfully')
      .should('exist');

    landOnEventHome();

    cy.get('[data-test-subj="eventHome__savedQueryTableName"]').first().contains(SAVE_QUERY1);
  });

  it('Click on a saved query from event analytics home', () => {
    prepareDefaultSearchOnExplorer();
    querySearch(TEST_QUERIES[0].query, TEST_QUERIES[0].dateRangeDOM);

    cy.get('.tab-title').contains('Events').click();
    cy.get('[data-test-subj="eventExplorer__saveManagementPopover"]').click();
    cy.get('[data-test-subj="eventExplorer__querySaveName"]').type(SAVE_QUERY4);
    cy.get('[data-test-subj="eventExplorer__querySaveConfirm"]', {
      timeout: COMMAND_TIMEOUT_LONG,
    }).click();
    cy.get('.euiToastHeader__title', { timeout: COMMAND_TIMEOUT_LONG })
      .contains('successfully')
      .should('exist');

    landOnEventHome();

    cy.get('[data-test-subj="eventHome__savedQueryTableName"]')
      .first()
      .contains(SAVE_QUERY4)
      .click();

    cy.url().should('contain', '#/explorer');
    cy.get('[data-test-subj="searchAutocompleteTextArea"]', {
      timeout: COMMAND_TIMEOUT_LONG,
    }).contains(TEST_QUERIES[0].query);
  });
});

describe('Override timestamp for an index', () => {
  it('Click override button to override default timestamp', () => {
    prepareDefaultSearchOnExplorer();
    cy.get('[data-test-subj="searchAutocompleteTextArea"]').type(TEST_QUERIES[2].query);
    cy.get('[data-test-subj="superDatePickerApplyTimeButton"]').contains('Refresh').click();
    cy.get('.tab-title').contains('Events').click();
    cy.get('[data-attr-field="utc_time"]').trigger('mouseenter');
    cy.get('[data-test-subj="eventExplorer__overrideDefaultTimestamp"]').click({ force: true });
    cy.get('[data-attr-field="utc_time"] [data-test-subj="eventFields__default-timestamp-mark"')
      .contains('Default Timestamp')
      .should('exist');
    cy.get(
      '[data-attr-field="timestamp"] [data-test-subj="eventFields__default-timestamp-mark"'
    ).should('not.exist');
  });
});

describe('Toggle the sidebar fields', () => {
  it('Toggle fields between available and selected section', () => {
    prepareDefaultSearchOnExplorer();
    querySearch(TEST_QUERIES[0].query, YEAR_TO_DATE_DOM_ID);
    cy.get('[data-attr-field="AvgTicketPrice"]').trigger('mouseenter');
    cy.get('[data-test-subj="fieldToggle-AvgTicketPrice"]').click();
    cy.get('[data-test-subj="fieldList-selected"] [data-attr-field="AvgTicketPrice"]').should('exist');
    cy.get('[data-test-subj="dataGridHeaderCell-AvgTicketPrice"]').should('exist');
    cy.get('[data-attr-field="AvgTicketPrice"]').trigger('mouseenter');
    cy.get('[data-test-subj="fieldToggle-AvgTicketPrice"]').click();
    cy.get('[data-test-subj="fieldList-selected"] [data-attr-field="AvgTicketPrice"]').should('not.exist');
    cy.get('[data-test-subj="fieldList-unpopular"] [data-attr-field="AvgTicketPrice"]').should('exist');
    cy.get('[data-test-subj="dataGridHeaderCell-AvgTicketPrice"]').should('not.exist');
  });
});

describe('Search fields in the sidebar', () => {
  it('Search a field', () => {
    prepareDefaultSearchOnExplorer();
    querySearch(TEST_QUERIES[0].query, YEAR_TO_DATE_DOM_ID);
    cy.get('[data-test-subj="eventExplorer__sidebarSearch"]').type('C');
    cy.get('[data-attr-field="Carrier"]').should('exist');
    cy.get('[data-attr-field="DestCityName"]').should('exist');
    cy.get('[data-attr-field="DestCountry"]').should('exist');
    cy.get('[data-attr-field="OriginCityName"]').should('exist');
    cy.get('[data-attr-field="Carrier"]').should('exist');
    cy.get('[data-attr-field="AvgTicketPrice"]').should('not.exist');
    cy.get('[data-attr-field="DestAirportID"]').should('not.exist');
  });
});

describe('Delete saved objects', () => {
  it('Delete visualizations/queries from event analytics', () => {
    landOnEventHome();
    cy.get('[data-test-subj="tablePaginationPopoverButton"]').click();
    cy.get('.euiContextMenuItem__text').contains('50 rows').click();
    cy.get('.euiCheckbox__input[data-test-subj="checkboxSelectAll"]').click();
    cy.get('.euiButton__text').contains('Actions').click();
    cy.get('.euiContextMenuItem__text').contains('Delete').click();
    cy.get('button.euiButton--danger').should('be.disabled');
    cy.get('input.euiFieldText[placeholder="delete"]').type('delete');
    cy.get('button.euiButton--danger').should('not.be.disabled');
    cy.get('.euiButton__text').contains('Delete').click({ force: true });
    cy.get('.euiTextAlign').contains('No Queries or Visualizations').should('exist');
  });
});

describe('Click to view field insights', () => {
  beforeEach(() => {
    prepareDefaultSearchOnExplorer();
    querySearch(TEST_QUERIES[2].query, YEAR_TO_DATE_DOM_ID);
  });

  it('Click a numerical field to view field insights', () => {
    cy.get('[data-attr-field="bytes"]').trigger('mouseenter');
    cy.get('[data-attr-field="bytes"] [data-test-subj="explorerSidebarItem__fieldInspect"]').click();
    cy.get('[data-test-subj="sidebarField__fieldInsights"] button').should('contain', 'Top values');
    cy.get('[data-test-subj="sidebarField__fieldInsights"] button').should(
      'contain',
      'Rare values'
    );
    cy.get('[data-test-subj="sidebarField__fieldInsights"] button').should(
      'contain',
      'Average overtime'
    );
    cy.get('[data-test-subj="sidebarField__fieldInsights"] button').should(
      'contain',
      'Maximum overtime'
    );
    cy.get('[data-test-subj="sidebarField__fieldInsights"] button').should(
      'contain',
      'Minimum overtime'
    );
  });

  it('Click a non-numerical field to view insights', () => {
    cy.get('[data-attr-field="host"]').trigger('mouseenter');
    cy.get('[data-attr-field="host"] [data-test-subj="explorerSidebarItem__fieldInspect"]').click();
    cy.get('[data-test-subj="sidebarField__fieldInsights"] button').should('contain', 'Top values');
    cy.get('[data-test-subj="sidebarField__fieldInsights"] button').should(
      'contain',
      'Rare values'
    );
  });
});

describe('Live tail stop automatically', () => {
  beforeEach(() => {
    landOnEventExplorer();
  });

  it('Live tail should be stopped', () => {
    cy.get('.euiButton__text').contains('Live');
  });
});

describe('Visualizing data', () => {
  beforeEach(() => {
    landOnEventVisualizations();
    selectDefaultDataSource();
    clearQuerySearchBoxText('searchAutocompleteTextArea');
    querySearch(TEST_QUERIES[2].query, YEAR_TO_DATE_DOM_ID);
  });

  it('Visualize pie chart', () => {
    cy.get('[data-test-subj="visConfigPanel__visTypeSelector"]').click();
    cy.get('[data-test-subj="comboBoxOptionsList visConfigPanel__visTypeSelector-optionsList"] span').contains(VIS_TYPE_PIE).click();
    cy.get('[data-test-subj="vizConfigSection-series"]')
      .find('[data-test-subj="viz-config-add-btn"]')
      .click();
    cy.get('[data-test-subj="panelCloseBtn"]').click();
    cy.get('[data-test-subj="vizConfigSection-dimensions"]')
      .find('[data-test-subj="viz-config-add-btn"]')
      .click();
    cy.get('[data-test-subj="explorer__vizDataConfig-panel"]')
      .find('[data-test-subj="comboBoxInput"]')
      .click()
      .type(FIELD_HOST);
    cy.get(`input[value="${FIELD_HOST}"]`).click();
    cy.get('[data-test-subj="panelCloseBtn"]').click();
    cy.get('[data-test-subj="visualizeEditorRenderButton"]').click();
    cy.get('.infolayer .legendtext').as('legandTxt');
    cy.get('@legandTxt').should('contain', HOST_TEXT_1);
    cy.get('@legandTxt').should('contain', HOST_TEXT_2);
    cy.get('@legandTxt').should('contain', HOST_TEXT_3);
    cy.get('@legandTxt').should('contain', HOST_TEXT_4);
  });

  it('Visualize vertical bar chart', () => {
    cy.get('[data-test-subj="visConfigPanel__visTypeSelector"]').click();
    cy.get('[data-test-subj="comboBoxOptionsList visConfigPanel__visTypeSelector-optionsList"] span').contains(VIS_TYPE_VBAR).click();
    cy.get('[data-test-subj="vizConfigSection-series"]')
      .find('[data-test-subj="viz-config-add-btn"]')
      .click();
    cy.get('[data-test-subj="panelCloseBtn"]').click();
    cy.get('[data-test-subj="vizConfigSection-dimensions"]')
      .find('[data-test-subj="viz-config-add-btn"]')
      .click();
    cy.get('[data-test-subj="explorer__vizDataConfig-panel"]')
      .find('[data-test-subj="comboBoxInput"]')
      .click()
      .type(FIELD_HOST);
    cy.get(`input[value="${FIELD_HOST}"]`).click();
    cy.get('[data-test-subj="panelCloseBtn"]').click();
    cy.get('[data-test-subj="vizConfigSection-breakdowns"]')
      .find('[data-test-subj="viz-config-add-btn"]')
      .click();
    cy.get('[data-test-subj="explorer__vizDataConfig-panel"]')
      .find('[data-test-subj="comboBoxInput"]')
      .click()
      .type(FIELD_AGENT);
    cy.get(`input[value="${FIELD_AGENT}"]`).click();
    cy.get('[data-test-subj="panelCloseBtn"]').click();
    cy.get('[data-test-subj="visualizeEditorRenderButton"]', {
      timeout: COMMAND_TIMEOUT_LONG,
    }).click();

    cy.get('.infolayer .legendtext').as('legandTxt');
    cy.get('@legandTxt').should('contain', BAR_LEG_TEXT_1);
    cy.get('@legandTxt').should('contain', BAR_LEG_TEXT_2);
    cy.get('@legandTxt').should('contain', BAR_LEG_TEXT_3);
  });
});
