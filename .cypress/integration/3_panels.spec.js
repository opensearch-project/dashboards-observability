/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

import {
  delay,
  TEST_PANEL,
  PPL_VISUALIZATIONS,
  PPL_VISUALIZATIONS_NAMES,
  NEW_VISUALIZATION_NAME,
  PPL_FILTER,
  SAMPLE_PANEL,
  SAMPLE_VISUALIZATIONS_NAMES,
} from '../utils/panel_constants';

import { supressResizeObserverIssue } from '../utils/constants';

const moveToEventsHome = () => {
  cy.visit(`${Cypress.env('opensearchDashboards')}/app/observability-dashboards#/event_analytics/`);
  cy.wait(delay * 3);
};

const moveToPanelHome = () => {
  cy.visit(
    `${Cypress.env('opensearchDashboards')}/app/observability-dashboards#/operational_panels/`
  );
  cy.wait(delay * 3);
};

const moveToTestPanel = () => {
  moveToPanelHome();
  cy.get('.euiTableCellContent').contains(TEST_PANEL).trigger('mouseover').click();
  cy.wait(delay * 3);
  cy.get('h1').contains(TEST_PANEL).should('exist');
};

describe('Adding sample data and visualization', () => {
  it('Adds sample flights data for visualization paragraph', () => {
    cy.visit(`${Cypress.env('opensearchDashboards')}/app/home#/tutorial_directory/sampleData`);
    cy.get('div[data-test-subj="sampleDataSetCardflights"]')
      .contains(/(Add|View) data/)
      .trigger('mouseover')
      .click();
    cy.wait(delay * 3);
  });
});

describe('Creating visualizations', () => {
  beforeEach(() => {
    moveToEventsHome();
  });

  it('Create first visualization in event analytics', () => {
    cy.get('[id^=autocomplete-textarea]').focus().type(PPL_VISUALIZATIONS[0], {
      delay: 50,
    });
    cy.get('.euiButton__text').contains('Refresh').trigger('mouseover').click();
    cy.wait(delay);
    supressResizeObserverIssue();
    cy.get('button[id="main-content-vis"]').contains('Visualizations').trigger('mouseover').click();
    cy.wait(delay * 2);
    cy.get('[data-test-subj="eventExplorer__saveManagementPopover"]').trigger('mouseover').click();
    cy.wait(1000);
    cy.get('[data-test-subj="eventExplorer__querySaveName"]')
      .focus()
      .type(PPL_VISUALIZATIONS_NAMES[0], {
        delay: 50,
      });
    cy.get('[data-test-subj="eventExplorer__querySaveConfirm"]').trigger('mouseover').click();
    cy.wait(delay);
    cy.get('.euiToastHeader__title').contains('successfully').should('exist');
  });

  it('Create second visualization in event analytics', () => {
    cy.get('[id^=autocomplete-textarea]').focus().type(PPL_VISUALIZATIONS[1], {
      delay: 50,
    });
    cy.get('.euiButton__text').contains('Refresh').trigger('mouseover').click();
    cy.wait(delay);
    supressResizeObserverIssue();
    cy.get('button[id="main-content-vis"]').contains('Visualizations').trigger('mouseover').click();
    cy.wait(delay);
    cy.get('[data-test-subj="eventExplorer__saveManagementPopover"]').trigger('mouseover').click();
    cy.wait(1000);
    cy.get('[data-test-subj="eventExplorer__querySaveName"]')
      .focus()
      .type(PPL_VISUALIZATIONS_NAMES[1], {
        delay: 50,
      });
    cy.get('[data-test-subj="eventExplorer__querySaveConfirm"]').trigger('mouseover').click();
    cy.wait(delay);
    cy.get('.euiToastHeader__title').contains('successfully').should('exist');
  });
});

describe('Testing panels table', () => {
  beforeEach(() => {
    moveToPanelHome();
  });

  it('Displays error toast for invalid panel name', () => {
    cy.get('button[data-test-subj="customPanels__createNewPanels"]').click();
    cy.get('button[data-test-subj="runModalButton"]').click();
    cy.get('.euiToastHeader__title').contains('Invalid Operational Panel name').should('exist');
  });

  it('Creates a panel and redirects to the panel', () => {
    cy.get('button[data-test-subj="customPanels__createNewPanels"]').click();
    cy.get('input.euiFieldText').focus().type(TEST_PANEL, {
      delay: 50,
    });
    cy.get('button[data-test-subj="runModalButton"]').click();
    cy.contains(TEST_PANEL).should('exist');
  });

  it('Duplicates a panel', () => {
    cy.get('.euiCheckbox__input[title="Select this row"]').eq(0).trigger('mouseover').click();
    cy.get('button[data-test-subj="operationalPanelsActionsButton"]').click();
    cy.get('button[data-test-subj="duplicateContextMenuItem"]').click();
    cy.get('button[data-test-subj="runModalButton"]').click();
  });

  it('Renames a panel', () => {
    cy.get('.euiCheckbox__input[title="Select this row"]').eq(0).trigger('mouseover').click();
    cy.get('button[data-test-subj="operationalPanelsActionsButton"]').click();
    cy.get('button[data-test-subj="renameContextMenuItem"]').click();
    cy.get('input.euiFieldText').focus().type(' (rename)', {
      delay: 50,
    });
    cy.get('button[data-test-subj="runModalButton"]').click();
  });

  it('Searches existing panel', () => {
    cy.get('input[data-test-subj="operationalPanelSearchBar"]')
      .focus()
      .type('this panel should not exist', {
        delay: 50,
      });

    cy.get('.euiTableCellContent__text').contains('No items found').should('exist');

    cy.get('[aria-label="Clear input"]').click();
    cy.get('input[data-test-subj="operationalPanelSearchBar"]')
      .focus()
      .type(TEST_PANEL + ' (copy) (rename)', {
        delay: 50,
      });

    cy.get('a.euiLink')
      .contains(TEST_PANEL + ' (copy) (rename)')
      .should('exist');
  });

  it('Deletes panels', () => {
    cy.get('input[data-test-subj="checkboxSelectAll"]').click();
    cy.get('button[data-test-subj="operationalPanelsActionsButton"]').click();
    cy.get('button[data-test-subj="deleteContextMenuItem"]').click();
    cy.get('button[data-test-subj="popoverModal__deleteButton"]').should('be.disabled');

    cy.get('input.euiFieldText[placeholder="delete"]').focus().type('delete', {
      delay: 50,
    });
    cy.get('button[data-test-subj="popoverModal__deleteButton"]').should('not.be.disabled');
    cy.get('button[data-test-subj="popoverModal__deleteButton"]').click();
    cy.get('h2[data-test-subj="customPanels__noPanelsHome"]').should('exist');
  });

  it('Create a panel for testing', () => {
    // keep a panel for testing
    cy.get('button[data-test-subj="customPanels__createNewPanels"]').click();
    cy.get('input.euiFieldText').focus().type(TEST_PANEL, {
      delay: 50,
    });
    cy.get('button[data-test-subj="runModalButton"]').click();
  });
});

describe('Testing a panel', () => {
  it('Move to test panel', () => {
    moveToTestPanel();
  });

  it('Opens visualization flyout from empty panel', () => {
    cy.get('button[data-test-subj="addVisualizationButton"]').eq(1).click();
    cy.get('button[data-test-subj="selectExistingVizContextMenuItem"]').click();
    cy.get('button[data-test-subj="closeFlyoutButton"]').click();
  });

  it('Redirects to correct page on breadcrumb click', () => {
    moveToTestPanel();
    cy.get('a[data-test-subj="breadcrumb last"]').click();

    cy.get('h1[data-test-subj="panelNameHeader"]').contains(TEST_PANEL).should('exist');
    cy.get('a[data-test-subj="breadcrumb"]').contains('Operational panels').click();

    cy.get('a[data-test-subj="breadcrumb last"]').contains('Operational panels').should('exist');
    cy.get('a[data-test-subj="breadcrumb first"]').contains('Observability').click();

    cy.get('a[data-test-subj="breadcrumb"]').contains('Event analytics').should('exist');
  });

  it('Duplicate the open panel', () => {
    moveToTestPanel();
    cy.get('button[data-test-subj="panelActionContextMenu"]').click();

    cy.get('button[data-test-subj="duplicatePanelContextMenuItem"]').click();

    cy.get(`input.euiFieldText[value="${TEST_PANEL} (copy)"]`).should('exist');
    cy.get('button[data-test-subj="runModalButton"]').click();
    cy.get('h1[data-test-subj="panelNameHeader"]')
      .contains(TEST_PANEL + ' (copy)')
      .should('exist');
  });

  it('Rename the open panel', () => {
    cy.get('button[data-test-subj="panelActionContextMenu"]').click();

    cy.get('button[data-test-subj="renamePanelContextMenuItem"]').click();

    cy.get(`input.euiFieldText[value="${TEST_PANEL} (copy)"]`)
      .focus()
      .clear({ force: true })
      .focus()
      .type('Renamed Panel', {
        delay: 200,
      });
    cy.get('button[data-test-subj="runModalButton"]').click();
    cy.get('h1[data-test-subj="panelNameHeader"]').contains('Renamed Panel').should('exist');
  });

  it('Change date filter of the panel', () => {
    moveToTestPanel();
    cy.get('.euiButtonEmpty[data-test-subj="superDatePickerToggleQuickMenuButton"]').click({
      force: true,
    });
    cy.get('button[data-test-subj="superDatePickerCommonlyUsed_This_year"]').click();
    cy.get('button[data-test-subj="superDatePickerShowDatesButton"]')
      .contains('This year')
      .should('exist');
  });

  it('Add existing visualization #1', () => {
    cy.get('button[data-test-subj="addVisualizationButton"]').eq(0).click();

    cy.get('button[data-test-subj="selectExistingVizContextMenuItem"]').click();

    cy.get('select').select(PPL_VISUALIZATIONS_NAMES[0]);
    cy.get('button[aria-label="refreshPreview"]').trigger('mouseover').click();
    cy.wait(delay * 2);
    cy.get('.plot-container').should('exist');
    cy.get('button[data-test-subj="addFlyoutButton"]').click();

    cy.get('.euiToastHeader__title').contains('successfully').should('exist');
  });

  it('Add existing visualization #2', () => {
    cy.get('button[data-test-subj="addVisualizationButton"]').eq(0).click();

    cy.get('button[data-test-subj="selectExistingVizContextMenuItem"]').click();

    cy.get('select').select(PPL_VISUALIZATIONS_NAMES[1]);
    cy.get('button[aria-label="refreshPreview"]').trigger('mouseover').click();
    cy.wait(delay * 2);
    cy.get('.plot-container').should('exist');
    cy.get('button[data-test-subj="addFlyoutButton"]').click();

    cy.get('.euiToastHeader__title').contains('successfully').should('exist');
  });

  it('Add ppl filter to panel', () => {
    cy.get('[data-test-subj="searchAutocompleteTextArea"]')
      .trigger('mouseover')
      .click()
      .wait(3000)
      .focus()
      .type(PPL_FILTER, {
        delay: 500,
      });

    cy.get('button[data-test-subj="superDatePickerApplyTimeButton"]').click();
    cy.wait(delay * 3);
    cy.get('.xtick').should('contain', 'OpenSearch-Air');
    cy.get('.xtick').should('contain', 'Munich Airport');
    cy.get('.xtick').contains('Zurich Airport').should('not.exist');
    cy.get('.xtick').contains('BeatsWest').should('not.exist');
    cy.get('.xtick').contains('Logstash Airways').should('not.exist');
    cy.get('.xtick').contains('OpenSearch Dashboards Airlines').should('not.exist');
  });

  it('Drag and drop a visualization', () => {
    cy.get('button[data-test-subj="editPanelButton"]').click();

    cy.get('h5[data-test-subj="visualizationHeader"]')
      .contains(PPL_VISUALIZATIONS_NAMES[1])
      .trigger('mousedown', { which: 1 })
      .trigger('mousemove', { clientX: 1100, clientY: 0 })
      .trigger('mouseup', { force: true });

    cy.get('button[data-test-subj="savePanelButton"]').click();
    cy.wait(delay * 3);
    cy.get('div.react-grid-layout>div')
      .eq(1)
      .invoke('attr', 'style')
      .should('match', new RegExp('(.*)transform: translate((.*)10px)(.*)'));
  });

  it('Resize a visualization', () => {
    cy.get('button[data-test-subj="editPanelButton"]').click();

    cy.get('.react-resizable-handle')
      .eq(1)
      .trigger('mousedown', { which: 1 })
      .trigger('mousemove', { clientX: 2000, clientY: 800 })
      .trigger('mouseup', { force: true });

    cy.get('button[data-test-subj="savePanelButton"]').click();
    cy.wait(delay * 3);
    cy.get('div.react-grid-layout>div').eq(1).invoke('height').should('match', new RegExp('470'));
  });

  it('Delete a visualization', () => {
    cy.get('h5[data-test-subj="visualizationHeader"]')
      .contains(PPL_VISUALIZATIONS_NAMES[1])
      .should('exist');
    cy.get('button[data-test-subj="editPanelButton"]').click();

    cy.get('.visualization-action-button > .euiIcon').eq(1).trigger('mouseover').click();

    cy.get('button[data-test-subj="savePanelButton"]').click();
    cy.wait(delay * 3);
    cy.get('h5[data-test-subj="visualizationHeader"]')
      .contains(PPL_VISUALIZATIONS_NAMES[1])
      .should('not.exist');
  });

  it('Duplicate a visualization', () => {
    cy.get('h5[data-test-subj="visualizationHeader"]')
      .contains(PPL_VISUALIZATIONS_NAMES[0])
      .should('exist');
    cy.get('button[aria-label="actionMenuButton"]').trigger('mouseover').click();
    cy.get('button[data-test-subj="duplicateVizContextMenuItem"]').click();
    cy.wait(delay * 2);
    cy.get('.euiToastHeader__title').contains('successfully').should('exist');

    cy.get('h5[data-test-subj="visualizationHeader"]')
      .eq(0)
      .contains(PPL_VISUALIZATIONS_NAMES[0])
      .should('exist');
    cy.get('h5[data-test-subj="visualizationHeader"]')
      .eq(1)
      .contains(PPL_VISUALIZATIONS_NAMES[0])
      .should('exist');
  });

  it('Replace a visualization', () => {
    cy.get('button[aria-label="actionMenuButton"]').eq(1).click();
    cy.get('button[data-test-subj="replaceVizContextMenuItem"]').click();
    cy.get('select').select(PPL_VISUALIZATIONS_NAMES[1]);
    cy.get('button[aria-label="refreshPreview"]').trigger('mouseover').click();
    cy.wait(delay * 3);
    cy.get('.plot-container').should('exist');
    cy.get('button[data-test-subj="addFlyoutButton"]').click();

    cy.get('.euiToastHeader__title').contains('successfully').should('exist');
    cy.wait(delay);
    cy.get('h5[data-test-subj="visualizationHeader"]')
      .contains(PPL_VISUALIZATIONS_NAMES[0])
      .should('exist');
    cy.get('h5[data-test-subj="visualizationHeader"]')
      .contains(PPL_VISUALIZATIONS_NAMES[1])
      .should('exist');
  });

  it('add new visualization to panel', () => {
    cy.get('button[data-test-subj="addVisualizationButton"]').eq(0).click();
    cy.get('button[data-test-subj="createNewVizContextMenuItem"]').click();
    cy.url().should('match', new RegExp('(.*)#/event_analytics/explorer'));
    cy.get('a[data-test-subj="eventExplorer__addNewTab"]').click();
    cy.get('[id^=autocomplete-textarea]').focus().type(PPL_VISUALIZATIONS[2], {
      delay: 50,
    });
    cy.get('button[data-test-subj="superDatePickerApplyTimeButton"]').click();

    supressResizeObserverIssue();
    cy.get('button[id="main-content-vis"]').contains('Visualizations').trigger('mouseover').click();
    cy.wait(delay * 2);
    cy.get('[data-test-subj="eventExplorer__saveManagementPopover"]').trigger('mouseover').click();
    cy.wait(1000);
    cy.get('[data-test-subj="eventExplorer__querySaveComboBox"]').type(TEST_PANEL, {
      delay: 50,
    });
    cy.wait(1000);
    cy.get(`input[value="${TEST_PANEL}"]`).trigger('mouseover').click();
    cy.get('[data-test-subj="eventExplorer__querySaveName"]')
      .focus()
      .type(PPL_VISUALIZATIONS_NAMES[2], {
        delay: 50,
      });
    cy.get('[data-test-subj="eventExplorer__querySaveConfirm"]').trigger('mouseover').click();

    cy.get('.euiToastHeader__title').contains('successfully').should('exist');
    moveToTestPanel();
    cy.get('h5[data-test-subj="visualizationHeader"]')
      .contains(PPL_VISUALIZATIONS_NAMES[0])
      .should('exist');
    cy.get('h5[data-test-subj="visualizationHeader"]')
      .contains(PPL_VISUALIZATIONS_NAMES[1])
      .should('exist');
    cy.get('h5[data-test-subj="visualizationHeader"]')
      .contains(PPL_VISUALIZATIONS_NAMES[2])
      .should('exist');
  });

  it('Check visualization edit button', () => {
    moveToTestPanel();
    cy.get('h5[data-test-subj="visualizationHeader"]')
      .contains(PPL_VISUALIZATIONS_NAMES[0])
      .should('exist');
    cy.get('button[aria-label="actionMenuButton"]').eq(0).trigger('mouseover').click();
    supressResizeObserverIssue();
    cy.get('button[data-test-subj="editVizContextMenuItem"]').click();
    cy.wait(delay * 3);
    cy.url().should('match', new RegExp('(.*)#/event_analytics/explorer'));
    cy.wait(delay);

    cy.get('[data-test-subj="eventExplorer__saveManagementPopover"]').trigger('mouseover').click();
    cy.wait(1000);
    cy.get('[data-test-subj="eventExplorer__querySaveName"]')
      .clear({ force: true })
      .type(NEW_VISUALIZATION_NAME, {
        delay: 200,
      });
    cy.get('[data-test-subj="eventExplorer__querySaveConfirm"]').trigger('mouseover').click();

    cy.get('.euiToastHeader__title').contains('successfully').should('exist');
    moveToTestPanel();
    cy.get('h5[data-test-subj="visualizationHeader"]')
      .contains(NEW_VISUALIZATION_NAME)
      .should('exist');
    cy.get('h5[data-test-subj="visualizationHeader"]')
      .contains(PPL_VISUALIZATIONS_NAMES[1])
      .should('exist');
    cy.get('h5[data-test-subj="visualizationHeader"]')
      .contains(PPL_VISUALIZATIONS_NAMES[2])
      .should('exist');
  });
});

describe('Clean up all test data', () => {
  it('Delete visualizations from event analytics', () => {
    moveToEventsHome();
    cy.get('[data-test-subj="tablePaginationPopoverButton"]').trigger('mouseover').click();
    cy.get('button[data-test-subj="tablePagination-50-rows"]').click();
    cy.get('.euiCheckbox__input[data-test-subj="checkboxSelectAll"]').trigger('mouseover').click();
    cy.get('button[data-test-subj="eventHomeAction"]').click();

    cy.get('button[data-test-subj="eventHomeAction__delete"]').click();
    cy.get('button.euiButton--danger').should('be.disabled');
    cy.get('input.euiFieldText[placeholder="delete"]').focus().type('delete', {
      delay: 50,
    });
    cy.get('button.euiButton--danger').should('not.be.disabled');
    cy.get('button[data-test-subj="popoverModal__deleteButton"]').click();
    cy.get('.euiTextAlign').contains('No Queries or Visualizations').should('exist');
  });

  it('Deletes test panel', () => {
    moveToPanelHome();
    cy.get('.euiCheckbox__input[data-test-subj="checkboxSelectAll"]').trigger('mouseover').click();
    cy.get('button[data-test-subj="operationalPanelsActionsButton"]').click();
    cy.get('button[data-test-subj="deleteContextMenuItem"]').click();
    cy.get('button.euiButton--danger').should('be.disabled');
    cy.get('input.euiFieldText[placeholder="delete"]').focus().type('delete', {
      delay: 50,
    });
    cy.get('button.euiButton--danger').should('not.be.disabled');
    cy.get('button[data-test-subj="popoverModal__deleteButton"]').click();

    cy.get('.euiTextAlign').contains('No Operational Panels').should('exist');
  });
});
