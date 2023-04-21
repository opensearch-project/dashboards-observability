/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

import { suppressResizeObserverIssue } from '../utils/constants';
import {
  delay,
  NEW_VISUALIZATION_NAME,
  PPL_FILTER,
  PPL_VISUALIZATIONS,
  PPL_VISUALIZATIONS_NAMES,
  TEST_PANEL,
} from '../utils/panel_constants';

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
    suppressResizeObserverIssue();
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
    suppressResizeObserverIssue();
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

describe.only('Testing panels table', () => {
  beforeEach(() => {
    eraseTestPanels();
    moveToPanelHome();
  });

  describe('Without Any Panels', () => {
    beforeEach(() => {
      moveToPanelHome();
    });

    it.skip('Displays error toast for invalid panel name', () => {
      clickCreatePanelButton();
      confirmModal();
      expectToastWith('Invalid Dashboard name');
    });

    it('Creates a panel and redirects to the panel', () => {
      clickCreatePanelButton();
      cy.get('input.euiFieldText').focus().type(TEST_PANEL, {
        delay: 50,
      });
      cy.get('button[data-test-subj="runModalButton"]').click();
      cy.contains(TEST_PANEL).should('exist');
    });
  });

  describe('with a Legacy Panel', () => {
    beforeEach(() => {
      createLegacyPanel();
      moveToPanelHome();
    });

    it('Duplicates a legacy panel', () => {
      cy.get('.euiTableRow').should('have.length', 1);
      selectThePanel();
      openActionsDropdown();
      cy.get('button[data-test-subj="duplicateContextMenuItem"]').click();
      cy.get('button[data-test-subj="runModalButton"]').click();
      cy.get('.euiTableRow').should('have.length', 2);
      const duplicateName = TEST_PANEL + ' (copy)';
      cy.contains(duplicateName).should('exist');
      const duplicate = cy.get('.euiLink').contains(duplicateName);
      expectUuid(duplicate);
    });

    it('Renames the panel', () => {
      createLegacyPanel();
      cy.reload();
      const cell = cy.get('.euiTableCellContent');
      expectLegacyId(cell);
      selectThePanel();
      openActionsDropdown();
      cy.get('button[data-test-subj="renameContextMenuItem"]').click();
      cy.get('input.euiFieldText').focus().type(' (rename)');
      cy.get('button[data-test-subj="runModalButton"]').click();
      const renamed = testPanelTableCell();
      expectUuid(renamed);
    });

    it('Deletes the panel', () => {
      cy.get('input[data-test-subj="checkboxSelectAll"]').click();
      openActionsDropdown();
      cy.get('button[data-test-subj="deleteContextMenuItem"]').click();
      cy.get('button[data-test-subj="popoverModal__deleteButton"]').should('be.disabled');

      cy.get('input.euiFieldText[placeholder="delete"]').focus().type('delete', {
        delay: 50,
      });
      cy.get('button[data-test-subj="popoverModal__deleteButton"]').should('not.be.disabled');
      cy.get('button[data-test-subj="popoverModal__deleteButton"]').click();
      cy.get('h2[data-test-subj="customPanels__noPanelsHome"]').should('exist');
    });

    it('Searches panels', () => {
      createLegacyPanel('Legacy Named');
      createSavedObjectPanel('Saved Object');
      cy.reload();
      cy.get('input[data-test-subj="operationalPanelSearchBar"]')
        .focus()
        .type('this panel should not exist', {
          delay: 50,
        });

      cy.get('.euiTableCellContent__text').contains('No items found').should('exist');

      // Search for oriignal Legacy Panel
      cy.get('[aria-label="Clear input"]').click();
      cy.get('input[data-test-subj="operationalPanelSearchBar"]').focus().type(TEST_PANEL, {
        delay: 50,
      });

      cy.get('a.euiLink').contains(TEST_PANEL).should('exist');
      cy.get('.euiTableRow').should('have.length', 1);

      // Search for teh Saved Object panel
      cy.get('[aria-label="Clear input"]').click();
      cy.get('input[data-test-subj="operationalPanelSearchBar"]').focus().type('Saved Object', {
        delay: 50,
      });

      cy.get('a.euiLink').contains('Saved Object').should('exist');
      cy.get('.euiTableRow').should('have.length', 1);
    });
  });

  describe('with a SavedObjects Panel', () => {
    beforeEach(() => {
      createSavedObjectPanel();
      moveToPanelHome();
      cy.get('.euiTableRow').should('have.length', 1);
    });

    it('Duplicates the panel', () => {
      selectThePanel();
      openActionsDropdown();
      cy.get('button[data-test-subj="duplicateContextMenuItem"]').click();
      cy.get('button[data-test-subj="runModalButton"]').click();
      const duplicateName = TEST_PANEL + ' (copy)';
      cy.get('.euiTableRow').should('have.length', 2);
      cy.contains(duplicateName).should('exist');
      const duplicate = cy.get('.euiLink').contains(duplicateName);
      expectUuid(duplicate);
    });

    it('Renames a saved-objects panel', () => {
      selectThePanel();
      openActionsDropdown();
      cy.get('button[data-test-subj="renameContextMenuItem"]').click();
      cy.get('input.euiFieldText').focus().type(' (rename)', {
        delay: 50,
      });
      cy.get('button[data-test-subj="runModalButton"]').click();
    });

    it('Deletes the panel', () => {
      createSavedObjectPanel();
      cy.get('input[data-test-subj="checkboxSelectAll"]').click();
      openActionsDropdown();
      cy.get('button[data-test-subj="deleteContextMenuItem"]').click();
      cy.get('button[data-test-subj="popoverModal__deleteButton"]').should('be.disabled');

      cy.get('input.euiFieldText[placeholder="delete"]').focus().type('delete', {
        delay: 50,
      });
      cy.get('button[data-test-subj="popoverModal__deleteButton"]').should('not.be.disabled');
      cy.get('button[data-test-subj="popoverModal__deleteButton"]').click();
      cy.get('h2[data-test-subj="customPanels__noPanelsHome"]').should('exist');
    });

    it('Redirects to observability dashboard from OSD dashboards', () => {
      moveToOsdDashboards();
      cy.location('pathname').should('eq', '/app/dashboards');
      cy.get('[data-test-subj="dashboardListingTitleLink-Test-Panel"]').click();
      cy.location('pathname').should('eq', '/app/observability-dashboards');
    });

    it('Redirects to observability dashboard from OSD dashboards with edit', () => {
      moveToOsdDashboards();
      cy.location('pathname').should('eq', '/app/dashboards');
      cy.get('[data-test-subj="dashboardListingTitleLink-Test-Panel"]')
        .closest('tr')
        .get('span.euiToolTipAnchor > button.euiButtonIcon')
        .eq(0)
        .click();
      cy.location('pathname').should('eq', '/app/observability-dashboards');
      cy.location('hash').should('include', '/edit');
    });

    it('Redirects to observability dashboard from OSD dashboards with create', () => {
      moveToOsdDashboards();
      cy.location('pathname').should('eq', '/app/dashboards');
      cy.get('div#createMenuPopover').click();
      cy.get('[data-test-subj="contextMenuItem-observability-panel"]').click();
      cy.location('pathname').should('eq', '/app/observability-dashboards');
      cy.location('hash').should('include', '/create');
    });
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

    suppressResizeObserverIssue();
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
    suppressResizeObserverIssue();
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
    openActionsDropdown();
    clickDeleteAction();
    cy.get('button.euiButton--danger').should('be.disabled');
    cy.get('input.euiFieldText[placeholder="delete"]').focus().type('delete', {
      delay: 50,
    });
    cy.get('button.euiButton--danger').should('not.be.disabled');
    cy.get('button[data-test-subj="popoverModal__deleteButton"]').click();

    cy.get('.euiTextAlign').contains('No Operational Panels').should('exist');
  });
});

const moveToOsdDashboards = () => {
  cy.visit(`${Cypress.env('opensearchDashboards')}/app/dashboards#/`);
  cy.wait(delay * 3);
};

const moveToEventsHome = () => {
  cy.visit(`${Cypress.env('opensearchDashboards')}/app/observability-logs#/`);
  cy.wait(6000);
};

const moveToPanelHome = () => {
  cy.visit(`${Cypress.env('opensearchDashboards')}/app/observability-dashboards#/`, {
    timeout: 3000,
  });
  cy.wait(delay * 3);
};

const testPanelTableCell = (name = TEST_PANEL) => cy.get('.euiTableCellContent').contains(name);

const moveToTestPanel = () => {
  moveToPanelHome();
  testPanelTableCell().trigger('mouseover').click();
  cy.wait(delay * 3);
  cy.get('h1').contains(TEST_PANEL).should('exist');
};

const TEST_PANEL_RX = new RegExp(TEST_PANEL + '.*');

const eraseLegacyPanels = () => {
  cy.request({
    method: 'GET',
    failOnStatusCode: false,
    url: 'api/observability/operational_panels/panels',
    headers: {
      'content-type': 'application/json;charset=UTF-8',
      'osd-xsrf': true,
    },
  }).then((response) => {
    console.log("legacy panels to erase", response.body)
    response.body.panels.map((panel) => {
      cy.request({
        method: 'DELETE',
        failOnStatusCode: false,
        url: `api/observability/operational_panels/panels/${panel.id}`,
        headers: {
          'content-type': 'application/json;charset=UTF-8',
          'osd-xsrf': true,
        },
      }).then((response) => {
        const deletedId = response.allRequestResponses[0]['Request URL'].split('/').slice(-1);
        console.log('erased panel', deletedId);
      });
    });
  });
};

const eraseSavedObjectPaenls = () => {
  return cy
    .request({
      method: 'get',
      failOnStatusCode: false,
      url: 'api/saved_objects/_find?type=observability-panel',
      headers: {
        'content-type': 'application/json;charset=UTF-8',
        'osd-xsrf': true,
      },
    })
    .then((response) => {
      console.log("saved objects to erase", response.body)
      response.body.saved_objects.map((soPanel) => {
        cy.request({
          method: 'DELETE',
          failOnStatusCode: false,
          url: `api/saved_objects/observability-panel/${soPanel.id}`,
          headers: {
            'content-type': 'application/json;charset=UTF-8',
            'osd-xsrf': true,
          },
        }).then((response) => {
          const deletedId = response;
          console.log('erased SO Panel', response)
        });
      });
    });
};

const eraseTestPanels = () => {
  eraseLegacyPanels();
  eraseSavedObjectPaenls();
};
const uuidRx =
  /[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}/;

const clickCreatePanelButton = () =>
  cy.get('a[data-test-subj="customPanels__createNewPanels"]').click();

const createSavedObjectPanel = (newName = TEST_PANEL) => {
  const result = cy
    .request({
      method: 'POST',
      failOnStatusCode: false,
      url: 'api/saved_objects/observability-panel',
      headers: {
        'content-type': 'application/json;charset=UTF-8',
        'osd-xsrf': true,
      },
      body: {
        attributes: {
          title: newName,
          description: '',
          dateCreated: 1681127334085,
          dateModified: 1681127334085,
          timeRange: {
            to: 'now',
            from: 'now-1d',
          },
          queryFilter: {
            query: '',
            language: 'ppl',
          },
          visualizations: [],
          applicationId: '',
        },
      },
    })
    .then((response) => console.log(response));
};

const createLegacyPanel = (newName = TEST_PANEL) => {
  const result = cy.request({
    method: 'POST',
    failOnStatusCode: false,
    url: 'api/observability/operational_panels/panels',
    headers: {
      'content-type': 'application/json;charset=UTF-8',
      'osd-xsrf': true,
    },
    body: { panelName: newName },
  });
};

const expectUuid = (anchorElem) => {
  anchorElem.invoke('attr', 'href').should('match', uuidRx);
};

const expectLegacyId = (anchorElem) => {
  anchorElem.invoke('attr', 'href').should('not.match', uuidRx);
};

const clickDeleteAction = () => {
  cy.get('button[data-test-subj="deleteContextMenuItem"]').click();
};

const openActionsDropdown = () => {
  cy.get('button[data-test-subj="operationalPanelsActionsButton"]').click();
};

const selectThePanel = () => {
  // cy.get('.euiCheckbox__input[title="Select this row"]').then(() => {
  cy.get('.euiCheckbox__input[title="Select this row"]').check({ force: true });
  cy.get('.euiTableRow-isSelected').should('exist')
  // });
};

const expectToastWith = (title) => {
  cy.get('.euiToastHeader__title').contains(title).should('exist');
};

const confirmModal = () => {
  cy.get('button[data-test-subj="runModalButton"]').click();
};
