/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />
import {
  delay,
  TEST_QUERIES,
  TESTING_PANEL,
  SAVE_QUERY1,
  SAVE_QUERY2,
  SAVE_QUERY3,
  SAVE_QUERY4,
  querySearch,
  YEAR_TO_DATE_DOM_ID,
  landOnEventHome,
  landOnEventExplorer,
  landOnEventVisualizations,
  landOnPanels,
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
  FIELD_AGENT
} from '../utils/event_analytics/constants';
import { suppressResizeObserverIssue, COMMAND_TIMEOUT_LONG } from '../utils/constants';
import { clearQuerySearchBoxText } from '../utils/event_analytics/helpers';

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
    suppressResizeObserverIssue();
    cy.get('.euiBreadcrumb[href="observability-logs#/"]').click(), { timeout: COMMAND_TIMEOUT_LONG };
    cy.get('.euiTitle').contains('Logs').should('exist');
  });
});

describe('Search a query on event home', () => {
  it('Search a query and redirect to explorer to display query output', () => {
    landOnEventHome();

    cy.get('[data-test-subj="searchAutocompleteTextArea"]').type(TEST_QUERIES[0].query);
    cy.get('[data-test-subj="superDatePickerToggleQuickMenuButton"]').click();
    cy.get('[data-test-subj="superDatePickerCommonlyUsed_Year_to date"]').click();
    cy.get('[data-test-subj="superDatePickerApplyTimeButton"]').contains('Refresh').click();
    cy.window()
      .its('store')
      .invoke('getState')
      .then((state) => {
        expect(Object.values(state.queries)[0]['rawQuery'].trim()).equal(TEST_QUERIES[0].query);
        expect(Object.values(state.queries)[0]['selectedDateRange'][0]).equal('now/y');
        expect(Object.values(state.queries)[0]['selectedDateRange'][1]).equal('now');
      });

    cy.url().should('contain', '#/explorer');
    cy.get('[data-test-subj="searchAutocompleteTextArea"]').contains(TEST_QUERIES[0].query);
  });
});

describe('Open flyout for a data row to see details', () => {
  beforeEach(() => {
    landOnEventExplorer();
    clearQuerySearchBoxText('searchAutocompleteTextArea');
    querySearch(TEST_QUERIES[0].query, TEST_QUERIES[0].dateRangeDOM);
  });

  it('Should be able to open flyout and see data, json and traces', () => {
    cy.get('[data-test-subj="docTable"] tbody tr button.euiButtonIcon').first().click();
    suppressResizeObserverIssue();
    cy.get('.observability-flyout').should('exist');
    cy.get('.observability-flyout .osdDocViewer .euiTabs span.euiTab__content')
      .contains('Table')
      .should('be.visible');
    cy.get('.observability-flyout .osdDocViewer .euiTabs span.euiTab__content')
      .contains('JSON')
      .should('be.visible');
    cy.get('.observability-flyout .osdDocViewer .euiTabs span.euiTab__content')
      .contains('Traces')
      .should('be.visible');
  });

  it('Should be able to see surrounding docs', () => {
    cy.get('.observability-flyout span.euiButton__text')
      .contains('View surrounding events')
      .should('be.visible')
      .click();
    cy.get('.observability-flyout #surroundingFyout')
      .contains('View surrounding events')
      .should('exist');
  });
});

describe('Add/delete/switch explorer top level tabs', () => {
  before(() => {
    landOnEventExplorer();
    suppressResizeObserverIssue();
  });
  
  it('Add a new tab', () => {
    cy.get('[data-test-subj="eventExplorer__topLevelTabbing"]')
      .find('button.euiTab')
      .then((lists) => {
        const initialLength = Cypress.$(lists).length;
        cy.get('[data-test-subj="eventExplorer__addNewTab"]').click();
        cy.get('[data-test-subj="eventExplorer__topLevelTabbing"]')
          .find('button.euiTab')
          .should('have.length', initialLength + 1);
      });
  });

  it('Click to switch to anther tab', () => {
    cy.get('[data-test-subj="eventExplorer__addNewTab"]').click();
    cy.get('[data-test-subj="eventExplorer__topLevelTabbing"]')
      .find('button.euiTab')
      .first()
      .click();
    suppressResizeObserverIssue();
    cy.get('[data-test-subj="eventExplorer__topLevelTabbing"]')
      .find('button.euiTab')
      .first()
      .should('have.class', 'euiTab-isSelected');
  });

  it('Close a tab', () => {
    cy.get('[data-test-subj="eventExplorer__addNewTab"]').click();
    cy.get('[data-test-subj="eventExplorer__topLevelTabbing"]')
      .find('button.euiTab')
      .then((lists) => {
        const initialLength = Cypress.$(lists).length;
        cy.get('[data-test-subj="eventExplorer__topLevelTabbing"] button.euiTab')
          .first()
          .find('[data-test-subj="eventExplorer__tabClose"]')
          .click();
        cy.get('[data-test-subj="eventExplorer__topLevelTabbing"]')
          .find('button.euiTab')
          .should('have.length', initialLength - 1);
      });
  });

  it('Close current selected tab', () => {
    cy.get('[data-test-subj="eventExplorer__addNewTab"]').click();
    cy.get('[data-test-subj="eventExplorer__addNewTab"]').click();
    cy.get('[data-test-subj="eventExplorer__topLevelTabbing"]')
      .find('button.euiTab')
      .then((lists) => {
        const initialLength = Cypress.$(lists).length;
        suppressResizeObserverIssue();
        cy.get('[data-test-subj="eventExplorer__topLevelTabbing"] button.euiTab').eq(1).click();
        cy.get('button.euiTab-isSelected [data-test-subj="eventExplorer__tabClose"]').click();
        cy.get('[data-test-subj="eventExplorer__topLevelTabbing"]')
          .find('button.euiTab')
          .should('have.length', initialLength - 1);
      });
  });

  it('Close another unselected tab', () => {
    cy.get('[data-test-subj="eventExplorer__addNewTab"]').click();
    cy.get('[data-test-subj="eventExplorer__addNewTab"]').click();
    cy.get('[data-test-subj="eventExplorer__topLevelTabbing"]')
      .find('button.euiTab')
      .then((lists) => {
        const initialLength = Cypress.$(lists).length;
        cy.get('button.euiTab').first().find('[data-test-subj="eventExplorer__tabClose"]').click();
        cy.get('[data-test-subj="eventExplorer__topLevelTabbing"]')
          .find('button.euiTab')
          .should('have.length', initialLength - 1);
      });
  });
});

describe('Click actions test', () => {
  beforeEach(() => {
    landOnEventHome();
    suppressResizeObserverIssue();
  });

  it('Actions - click event explorer', () => {
    cy.get('[data-test-subj="eventHomeAction"]').click();
    cy.get('[data-test-subj="eventHomeAction__explorer"]').click();
    cy.url().should('contain', '#/explorer');
  });

  it('Actions - add sample data', () => {
    cy.get('[data-test-subj="eventHomeAction"]').click();
    cy.get('[data-test-subj="eventHomeAction__addSamples"]').click();
    cy.get('[data-test-subj="confirmModalConfirmButton"]').click();
    cy.get('.euiToastHeader__title').should('contain', 'successfully');
  });

  it('Actions - delete saved queries', () => {
    cy.get('[data-test-subj^="checkboxSelectRow"]').first().check();
    cy.get('[data-test-subj="eventHomeAction"]').click();
    cy.get('[data-test-subj="eventHomeAction__delete"]').click();
    cy.get('[data-test-subj="popoverModal__deleteTextInput"]').type('delete');
    cy.get('[data-test-subj="popoverModal__deleteButton"').click();
    cy.get('.euiToastHeader__title').should('contain', 'successfully');
  });
});

describe('Saves a query on explorer page', () => {
  it('Saves a visualization on visualization tab of explorer page', () => {
    landOnEventExplorer();
    querySearch(TEST_QUERIES[1].query, TEST_QUERIES[1].dateRangeDOM);
    suppressResizeObserverIssue();
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
    suppressResizeObserverIssue();
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
    landOnEventExplorer();
    suppressResizeObserverIssue();
    querySearch(TEST_QUERIES[0].query, TEST_QUERIES[0].dateRangeDOM);

    cy.get('.tab-title').contains('Events').click();
    cy.get('[data-test-subj="eventExplorer__saveManagementPopover"]').click();
    cy.get('[data-test-subj="eventExplorer__querySaveName"]').type(SAVE_QUERY1);
    cy.get('[data-test-subj="eventExplorer__querySaveConfirm"]', { timeout: COMMAND_TIMEOUT_LONG }).click();

    cy.get('.euiToastHeader__title', { timeout: COMMAND_TIMEOUT_LONG })
      .contains('successfully')
      .should('exist');

    landOnEventHome();

    cy.get('[data-test-subj="eventHome__savedQueryTableName"]').first().contains(SAVE_QUERY1);
  });

  it('Click on a saved query from event analytics home', () => {
    landOnEventExplorer();
    suppressResizeObserverIssue();
    querySearch(TEST_QUERIES[0].query, TEST_QUERIES[0].dateRangeDOM);

    cy.get('.tab-title').contains('Events').click();
    cy.get('[data-test-subj="eventExplorer__saveManagementPopover"]').click();
    cy.get('[data-test-subj="eventExplorer__querySaveName"]').type(SAVE_QUERY4);
    cy.get('[data-test-subj="eventExplorer__querySaveConfirm"]', { timeout: COMMAND_TIMEOUT_LONG }).click();
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
    suppressResizeObserverIssue();
  });
});

describe('Override timestamp for an index', () => {
  it('Click override button to override default timestamp', () => {
    landOnEventExplorer();
    suppressResizeObserverIssue();
    clearQuerySearchBoxText('searchAutocompleteTextArea');
    cy.get('[data-test-subj="searchAutocompleteTextArea"]').type(TEST_QUERIES[2].query);
    cy.get('[data-test-subj="superDatePickerApplyTimeButton"]').contains('Refresh').click();
    cy.get('.tab-title').contains('Events').click();
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
    landOnEventExplorer();
    suppressResizeObserverIssue();
    querySearch(TEST_QUERIES[0].query, YEAR_TO_DATE_DOM_ID);
    cy.get('[data-test-subj="fieldToggle-AvgTicketPrice"]').click();
    cy.get('[data-test-subj="field-AvgTicketPrice"]').should('exist');
    cy.get('[data-test-subj="docTable"]').find('th').contains('_source').should('not.exist');
    cy.get('[data-test-subj="fieldToggle-AvgTicketPrice"]').click();
    cy.get('[data-test-subj="field-AvgTicketPrice"]').should('exist');
    cy.get('[data-test-subj="docTable"]').find('th').contains('_source').should('exist');
  });
});

describe('Search fields in the sidebar', () => {
  it('Search a field', () => {
    landOnEventExplorer();
    suppressResizeObserverIssue();
    querySearch(TEST_QUERIES[0].query, YEAR_TO_DATE_DOM_ID);
    cy.get('[data-test-subj="eventExplorer__sidebarSearch"]').type('C');
    cy.get('[data-test-subj="field-Cancelled"]').should('exist');
    cy.get('[data-test-subj="field-AvgTicketPrice"]').should('not.exist');
    cy.get('[data-test-subj="field-DestAirportID"]').should('not.exist');
    cy.get('[data-test-subj="field-Carrier"]').should('exist');
  });
});

describe('Delete saved objects', () => {
  it('Delete visualizations/queries from event analytics', () => {
    suppressResizeObserverIssue();
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
    landOnEventExplorer();
    suppressResizeObserverIssue();
    querySearch(TEST_QUERIES[2].query, YEAR_TO_DATE_DOM_ID);
  });

  it('Click a numerical field to view field insights', () => {
    cy.get('[data-test-subj="field-bytes-showDetails"]').click();
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
    cy.get('[data-test-subj="field-host-showDetails"]').click();
    cy.get('[data-test-subj="sidebarField__fieldInsights"] button').should('contain', 'Top values');
    cy.get('[data-test-subj="sidebarField__fieldInsights"] button').should(
      'contain',
      'Rare values'
    );
  });
});

describe('Switch on and off livetail', () => {
  it('Switch on and off in live tail', () => {
    landOnEventExplorer();
    suppressResizeObserverIssue();
    cy.get('[data-test-subj="searchAutocompleteTextArea"]').type(TEST_QUERIES[1].query);
    cy.get('[data-test-subj=eventLiveTail]').click();
    cy.get('[data-test-subj=eventLiveTail__delay10s]').click();
    cy.get('.euiToastHeader__title').should('contain', 'On');
    cy.get('[data-test-subj=eventLiveTail__off').click();
    cy.get('.euiToastHeader__title').should('contain', 'Off');
  });
});

describe('Live tail stop automatically', () => {
  it('Moving to other tab should stop live tail automatically', () => {
    landOnEventExplorer();
    suppressResizeObserverIssue();
    clearQuerySearchBoxText('searchAutocompleteTextArea');
    cy.get('[data-test-subj="searchAutocompleteTextArea"]').type(TEST_QUERIES[1].query);
    cy.get('[data-test-subj=eventLiveTail]').click();
    cy.get('[data-test-subj=eventLiveTail__delay10s]').click();
    cy.get('.euiToastHeader__title').contains('On').should('exist');
  });

  it('Add a new tab', () => {
    suppressResizeObserverIssue();
    cy.get('[data-test-subj="eventExplorer__topLevelTabbing"]')
      .find('button.euiTab')
      .then((lists) => {
        const initialLength = Cypress.$(lists).length;
        cy.get('[data-test-subj="eventExplorer__addNewTab"]').click();
        cy.get('[data-test-subj="eventExplorer__topLevelTabbing"]')
          .find('button.euiTab')
          .should('have.length', initialLength + 1);
      });
  });

  it('Click to switch to another tab', () => {
    cy.get('[data-test-subj="eventExplorer__addNewTab"]', {
      timeout: COMMAND_TIMEOUT_LONG,
    }).click();
    cy.get('[data-test-subj="eventExplorer__topLevelTabbing"]', { timeout: COMMAND_TIMEOUT_LONG })
      .find('button.euiTab')
      .first()
      .click();
    suppressResizeObserverIssue();

    cy.get('[data-test-subj="eventExplorer__topLevelTabbing"]')
      .find('button.euiTab')
      .first()
      .should('have.class', 'euiTab-isSelected');
  });

  it('Close current selected tab', () => {
    suppressResizeObserverIssue();
    cy.get('[data-test-subj="eventExplorer__addNewTab"]', {
      timeout: COMMAND_TIMEOUT_LONG,
    }).click();
    cy.get('[data-test-subj="eventExplorer__addNewTab"]', {
      timeout: COMMAND_TIMEOUT_LONG,
    }).click();
    cy.get('[data-test-subj="eventExplorer__topLevelTabbing"]')
      .find('button.euiTab')
      .then((lists) => {
        const initialLength = Cypress.$(lists).length;
        cy.get('[data-test-subj="eventExplorer__topLevelTabbing"] button.euiTab').eq(1).click();
        cy.get('button.euiTab-isSelected [data-test-subj="eventExplorer__tabClose"]').click();
        suppressResizeObserverIssue();
        cy.get('[data-test-subj="eventExplorer__topLevelTabbing"]')
          .find('button.euiTab')
          .should('have.length', initialLength - 1);
      });
  });

  it('Live tail should be stopped', () => {
    cy.get('.euiButton__text').contains('Live');
  });
});

describe('Visualizing data', () => {
  beforeEach(() => {
    landOnEventVisualizations();
    suppressResizeObserverIssue();
    querySearch(TEST_QUERIES[2].query, YEAR_TO_DATE_DOM_ID);
  });

  it('Visualize pie chart', () => {
    cy.get('[data-test-subj="comboBoxInput"]').click();
    cy.get('[data-test-subj="comboBoxOptionsList "] span').contains(VIS_TYPE_PIE).click();
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
    cy.get('[data-test-subj="comboBoxInput"]').click();
    cy.get('[data-test-subj="comboBoxOptionsList "] span').contains(VIS_TYPE_VBAR).click();
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
    cy.get('[data-test-subj="visualizeEditorRenderButton"]', { timeout: COMMAND_TIMEOUT_LONG }).click();
    suppressResizeObserverIssue();

    cy.get('.infolayer .legendtext').as('legandTxt');
    cy.get('@legandTxt').should('contain', BAR_LEG_TEXT_1);
    cy.get('@legandTxt').should('contain', BAR_LEG_TEXT_2);
    cy.get('@legandTxt').should('contain', BAR_LEG_TEXT_3);
  });
});