/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

import { suppressResizeObserverIssue } from '../../utils/constants';
import {
  delay,
  NEW_VISUALIZATION_NAME,
  PPL_FILTER,
  PPL_VISUALIZATION_CONFIGS,
  PPL_VISUALIZATIONS,
  PPL_VISUALIZATIONS_NAMES,
  TEST_PANEL,
} from '../../utils/panel_constants';

describe('Panels testing with Sample Data', { defaultCommandTimeout: 10000 }, () => {
  suppressResizeObserverIssue(); //needs to be in file once

  before(() => {
    cy.visit(`${Cypress.env('opensearchDashboards')}/app/home#/tutorial_directory/sampleData`);
    cy.get('div[data-test-subj="sampleDataSetCardflights"]')
      .contains(/(Add|View) data/)
      .trigger('mouseover')
      .click();
  });

  beforeEach(() => {
    eraseTestPanels();
    eraseSavedVisualizations();
  });

  after(() => {
    eraseTestPanels();
    eraseSavedVisualizations();
  });

  describe('Creating visualizations', () => {
    beforeEach(() => {
      moveToEventsHome();
    });

    it('Create first visualization in event analytics', () => {
      cy.get('[data-test-subj="eventHomeAction__explorer"]').click();
      cy.get('[id^=autocomplete-textarea]').focus().type(PPL_VISUALIZATIONS[0], {
        delay: 50,
      });
      cy.get('.euiButton__text').contains('Run').trigger('mouseover').click();
      cy.get('button[id="main-content-vis"]')
        .contains('Visualizations')
        .trigger('mouseover', { force: true })
        .click({ force: true });
      cy.get('[data-test-subj="eventExplorer__saveManagementPopover"]')
        .trigger('mouseover')
        .click({ force: true });
      cy.get('[data-test-subj="eventExplorer__querySaveName"]')
        .focus()
        .type(PPL_VISUALIZATIONS_NAMES[0]);

      cy.get('[data-test-subj="eventExplorer__querySaveConfirm"]').trigger('mouseover').click();
      cy.get('.euiToastHeader__title').contains('successfully').should('exist');
    });

    it('Create second visualization in event analytics', () => {
      cy.get('[data-test-subj="eventHomeAction__explorer"]').click();
      // Workaround until issue #1403 is fixed
      // Should be the following commented lines
      // cy.get('[id^=autocomplete-textarea]').focus().type(PPL_VISUALIZATIONS[1], {
      //   delay: 50,
      // });
      cy.get('[id^=autocomplete-textarea]').focus().invoke('val', PPL_VISUALIZATIONS[1]).trigger('input').trigger('change');
      cy.get('.euiButton__text').contains('Run').trigger('mouseover').click();
      cy.get('button[id="main-content-vis"]')
        .contains('Visualizations')
        .trigger('mouseover')
        .click({ force: true });
      cy.get('[data-test-subj="eventExplorer__saveManagementPopover"]')
        .trigger('mouseover')
        .click();
      cy.get('[data-test-subj="eventExplorer__querySaveName"]')
        .focus()
        .type(PPL_VISUALIZATIONS_NAMES[1]);
      cy.get('[data-test-subj="eventExplorer__querySaveConfirm"]').trigger('mouseover').click();
      cy.get('.euiToastHeader__title').contains('successfully').should('exist');
    });
  });

  describe('Testing panels table', () => {
    describe('Without Any Panels', () => {
      beforeEach(() => {
        moveToPanelHome();
      });

      it('Displays error toast for invalid panel name', () => {
        clickCreatePanelButton();
        confirmModal();
        expectToastWith('Invalid Dashboard Name');
      });

      it('Creates a panel and redirects to the panel', () => {
        clickCreatePanelButton();
        cy.get('input.euiFieldText').focus().type(TEST_PANEL);
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
        cy.reload();
        cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
        cy.get('.euiTableRow').should('have.length', 1);
        selectThePanel();
        openActionsDropdown();
        cy.get('button[data-test-subj="duplicateContextMenuItem"]').click();
        cy.get('button[data-test-subj="runModalButton"]').click();
        cy.get('[data-test-subj="breadcrumb"]').click({ force: true }); //Duplicate opens the panel, need to return
        cy.get('.euiTableRow').should('have.length', 2);
        const duplicateName = TEST_PANEL + ' (copy)';
        cy.contains(duplicateName).should('exist');
        cy.get('.euiLink')
          .contains(duplicateName)
          .should('exist')
          .then(($anchorElem) => {
            expectUuid(cy.wrap($anchorElem));
          });
      });

      it('Renames the panel', () => {
        cy.reload();
        cy.get('.euiTableCellContent')
          .should('exist')
          .then(($anchorElem) => {
            expectLegacyId(cy.wrap($anchorElem));
          });
        cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
        cy.get('.euiCheckbox__input[title="Select this row"]').first().click();
        openActionsDropdown();
        cy.get('button[data-test-subj="renameContextMenuItem"]').click();
        cy.get('input.euiFieldText').focus().type(' (rename)');
        cy.get('button[data-test-subj="runModalButton"]').click();
        const renamed = testPanelTableCell();
        expectLegacyId(renamed);
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
        // Search for orignal Legacy Panel
        cy.get('[aria-label="Clear input"]').click();
        cy.get('input[data-test-subj="operationalPanelSearchBar"]').focus().type(TEST_PANEL);
        cy.get('a.euiLink').contains(TEST_PANEL).should('exist');
        cy.get('.euiTableRow').should('have.length', 1);
        // Search for the Saved Object panel
        cy.get('[aria-label="Clear input"]').click();
        cy.get('input[data-test-subj="operationalPanelSearchBar"]').focus().type('Saved Object');
        cy.get('a.euiLink').contains('Saved Object').should('exist');
        cy.get('.euiTableRow').should('have.length', 1);
      });

      it('Deletes the panel', () => {
        cy.reload();
        cy.get('[data-test-subj="tableHeaderSortButton"]').first().click();// Page needs click before checking box
        cy.get('[data-test-subj="checkboxSelectAll"]').click({ force: true })
        openActionsDropdown();
        cy.get('button[data-test-subj="deleteContextMenuItem"]').click({ force: true });
        
        cy.get('button[data-test-subj="popoverModal__deleteButton"]').should('be.disabled');
        cy.get('input.euiFieldText[placeholder="delete"]').focus().type('delete');
        cy.get('button[data-test-subj="popoverModal__deleteButton"]').should('not.be.disabled');
        cy.get('button[data-test-subj="popoverModal__deleteButton"]').click();
        cy.get('h2[data-test-subj="customPanels__noPanelsHome"]').should('exist');
      });
    });

    describe('with a SavedObjects Panel', () => {
      beforeEach(() => {
        createSavedObjectPanel();
        moveToPanelHome();
        cy.reload();
        cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
      });

      it('Duplicates the panel', () => {
        selectThePanel();
        openActionsDropdown();
        cy.get('button[data-test-subj="duplicateContextMenuItem"]').click();
        cy.get('button[data-test-subj="runModalButton"]').click();
        const duplicateName = TEST_PANEL + ' (copy)';
        cy.get('[data-test-subj="breadcrumb"]').click({ force: true }); //reload page
        cy.get('.euiTableRow').should('have.length', 2);
        cy.contains(duplicateName).should('exist');
        cy.get('.euiLink')
          .contains(duplicateName)
          .should('exist')
          .then(($anchorElem) => {
            expectUuid(cy.wrap($anchorElem));
          });
      });

      it('Renames a saved-objects panel', () => {
        cy.get('[data-test-subj="tableHeaderSortButton"]').first().click();// Page needs click before checking box
        selectThePanel();
        openActionsDropdown();
        cy.get('button[data-test-subj="renameContextMenuItem"]').click();
        cy.get('input.euiFieldText').focus().type(' (rename)');
        cy.get('button[data-test-subj="runModalButton"]').click();
      });

      it('Deletes the panel', () => {
        createSavedObjectPanel();
        cy.get('a[data-test-subj="breadcrumb last"]').click(); //refresh so panel appears
        cy.get('input[data-test-subj="checkboxSelectAll"]').click();
        openActionsDropdown();
        cy.get('button[data-test-subj="deleteContextMenuItem"]').click({ force: true });
        cy.get('button[data-test-subj="popoverModal__deleteButton"]').should('be.disabled');
        cy.get('input.euiFieldText[placeholder="delete"]').focus().type('delete');
        cy.get('button[data-test-subj="popoverModal__deleteButton"]').should('not.be.disabled');
        cy.get('button[data-test-subj="popoverModal__deleteButton"]').click({ force: true });
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
        cy.get('[data-test-subj="dashboardEditBtn"]')
          .eq(0)
          .click();
        cy.get('[data-test-subj="dashboardEditDashboard"]').click();
        cy.location('pathname').should('eq', '/app/observability-dashboards');
        cy.location('hash').should('include', '/edit');
      });

      it('Redirects to observability dashboard from OSD dashboards with create', () => {
        moveToOsdDashboards();
        cy.location('pathname')
          .should('eq', '/app/dashboards')
          .then(() => {
            cy.get('div#createMenuPopover').click();
          });
        cy.get('[data-test-subj="contextMenuItem-observability-panel"]').click();
        cy.location('pathname').should('eq', '/app/observability-dashboards');
        cy.location('hash').should('include', '/create');
      });
    });
  });

  describe('Testing a panel', () => {
    const test_name = `test_${new Date().getTime()}`;

    beforeEach(() => {
      createSavedObjectPanel(test_name).as('thePanel');
      cy.then(function () {
        moveToThePanel(this.thePanel.id);
      });
    });

    it('Opens visualization flyout from empty panel', () => {
      cy.get('button[data-test-subj="addVisualizationButton"]').eq(1).click();
      cy.get('button[data-test-subj="selectExistingVizContextMenuItem"]').click();
      cy.get('button[data-test-subj="closeFlyoutButton"]').click();
    });

    it('Redirects to correct page on breadcrumb click', () => {
      cy.get('a[data-test-subj="breadcrumb last"]').click();
      cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
      cy.then(function () {
        cy.get('h1[data-test-subj="panelNameHeader"]')
          .contains(test_name)
          .should('exist');
      });
    });

    it('Duplicate the open panel', () => {
      cy.get('button[data-test-subj="panelActionContextMenu"]').click();
      cy.get('button[data-test-subj="duplicatePanelContextMenuItem"]').click();
      cy.then(function () {
        cy.get(`input.euiFieldText[value="${this.thePanel.attributes.title} (copy)"]`).should(
          'exist'
        );
      });
      cy.get('button[data-test-subj="runModalButton"]').click();
      cy.then(function () {
        cy.get('h1[data-test-subj="panelNameHeader"]')
          .contains(this.thePanel.attributes.title + ' (copy)')
          .should('exist');
      });
    });

    it('Rename the open panel', () => {
      cy.then(function () {
        cy.get('[data-test-subj="breadcrumb"]').click({ force: true });
        cy.get('input[data-test-subj="operationalPanelSearchBar"]')
          .focus()
          .type(this.thePanel.attributes.title);
        cy.get('a.euiLink').contains(this.thePanel.attributes.title).click();
        cy.get('button[data-test-subj="panelActionContextMenu"]').click();
        cy.get('button[data-test-subj="renamePanelContextMenuItem"]').click();
        cy.get(`input.euiFieldText[value="${this.thePanel.attributes.title}"]`)
          .focus()
          .clear({ force: true })
          .focus()
          .type('Renamed Panel');
      });
      cy.get('button[data-test-subj="runModalButton"]').click();
      cy.get('h1[data-test-subj="panelNameHeader"]').contains('Renamed Panel').should('exist');
    });

    // Skipping for now as it's flaky (failed on 34th run)
    it.skip('Change date filter of the panel', () => {
      cy.intercept('**').as('putRequest');
      cy.get('[data-test-subj="superDatePickerToggleQuickMenuButton"]').click({
        force: true,
      });
      cy.wait('@putRequest');
      cy.get('button[data-test-subj="superDatePickerCommonlyUsed_This_year"]').click({
        force: true,
      });
      cy.get('[data-test-subj="superDatePickerShowDatesButton"]')
        .contains('This year')
        .should('exist');
    });

    it('Add existing visualization #1', () => {
      createVisualization(
        PPL_VISUALIZATIONS_NAMES[0],
        PPL_VISUALIZATIONS[0],
        PPL_VISUALIZATION_CONFIGS[0]
      ).as('vis1');
      cy.get('button[data-test-subj="addVisualizationButton"]').eq(0).click();
      cy.get('button[data-test-subj="selectExistingVizContextMenuItem"]').click();
      cy.get('select').select(PPL_VISUALIZATIONS_NAMES[0]);
      cy.get('button[aria-label="refreshPreview"]').trigger('mouseover').click();
      cy.get('button[data-test-subj="addFlyoutButton"]').click({ force: true });
      cy.get('.euiToastHeader__title').contains('successfully').should('exist');
    });

    it('Add existing visualization #2', () => {
      createVisualization(
        PPL_VISUALIZATIONS_NAMES[1],
        PPL_VISUALIZATIONS[1],
        PPL_VISUALIZATION_CONFIGS[1]
      ).as('vis1');
      cy.get('button[data-test-subj="addVisualizationButton"]').eq(0).click();
      cy.get('button[data-test-subj="selectExistingVizContextMenuItem"]').click();
      cy.get('select').select(PPL_VISUALIZATIONS_NAMES[1]);
      cy.get('button[aria-label="refreshPreview"]').trigger('mouseover').click();
      cy.get('button[data-test-subj="addFlyoutButton"]').click({ force: true });
      cy.get('.euiToastHeader__title').contains('successfully').should('exist');
    });

    it('Add ppl filter to panel', () => {
      createVisualization(
        PPL_VISUALIZATIONS_NAMES[0],
        PPL_VISUALIZATIONS[0],
        PPL_VISUALIZATION_CONFIGS[0]
      ).as('vis1');

      cy.then(function () {
        addVisualizationsToPanel(this.thePanel, [this.vis1.id]);
        moveToThePanel(this.thePanel.id);
        cy.get('[data-test-subj="breadcrumb"]').click({ force: true });
        cy.get('input[data-test-subj="operationalPanelSearchBar"]')
          .focus()
          .type(this.thePanel.attributes.title);
        cy.get('a.euiLink').contains(this.thePanel.attributes.title).click();
      });

      cy.get('.euiButtonEmpty[data-test-subj="superDatePickerToggleQuickMenuButton"]').click({
        force: true,
      });
      cy.get('[data-test-subj="superDatePickerQuickMenu"')
        .first()
        .within(() => {
          cy.get('input[aria-label="Time value"]').type('2', { force: true });
          cy.get('select[aria-label="Time unit"]').select('years');
          cy.get('button').contains('Apply').click();
        });

      cy.get('[data-test-subj="searchAutocompleteTextArea"]')
        .trigger('mouseover')
        .click({ force: true })
        .focus()
        .type(PPL_FILTER, { force: true, delay: 500 });
      cy.get('button[data-test-subj="superDatePickerApplyTimeButton"]').click({ force: true });
      cy.get('.euiButton__text').contains('Refresh').trigger('mouseover').click();
      cy.get('.xtick').should('contain', 'Munich Airport');
      cy.get('.xtick').contains('Zurich Airport').should('not.exist');
      cy.get('.xtick').contains('BeatsWest').should('not.exist');
      cy.get('.xtick').contains('Logstash Airways').should('not.exist');
      cy.get('.xtick').contains('OpenSearch Dashboards Airlines').should('not.exist');
    });

    it('Drag and drop a visualization', () => {
      createVisualization(
        PPL_VISUALIZATIONS_NAMES[1],
        PPL_VISUALIZATIONS[1],
        PPL_VISUALIZATION_CONFIGS[1]
      ).as('vis1');

      cy.then(function () {
        addVisualizationsToPanel(this.thePanel, [this.vis1.id]);
        moveToThePanel(this.thePanel.id);
        cy.get('[data-test-subj="breadcrumb"]').click({ force: true });
        cy.get('input[data-test-subj="operationalPanelSearchBar"]')
          .focus()
          .type(this.thePanel.attributes.title);
        cy.get('a.euiLink').contains(this.thePanel.attributes.title).click();
      });

      cy.get('button[data-test-subj="editPanelButton"]').click();

      cy.get('h5[data-test-subj="visualizationHeader"]')
        .contains(PPL_VISUALIZATIONS_NAMES[1])
        .trigger('mousedown', { which: 1 })
        .trigger('mousemove', { clientX: 1100, clientY: 0 })
        .trigger('mouseup', { force: true });

      cy.get('button[data-test-subj="savePanelButton"]').click();
      cy.get('div.react-grid-layout>div')
        .eq(0)
        .invoke('attr', 'style')
        .should('match', new RegExp('(.*)transform: translate((.*)10px)(.*)'));
    });

    it('Resize a visualization', () => {
      createVisualization(
        PPL_VISUALIZATIONS_NAMES[1],
        PPL_VISUALIZATIONS[1],
        PPL_VISUALIZATION_CONFIGS[1]
      ).as('vis1');

      cy.then(function () {
        addVisualizationsToPanel(this.thePanel, [this.vis1.id]);
        moveToThePanel(this.thePanel.id);
        cy.get('[data-test-subj="breadcrumb"]').click({ force: true });
        cy.get('input[data-test-subj="operationalPanelSearchBar"]')
          .focus()
          .type(this.thePanel.attributes.title);
        cy.get('a.euiLink').contains(this.thePanel.attributes.title).click();
      });

      cy.get('button[data-test-subj="editPanelButton"]').click();

      cy.get('.react-resizable-handle')
        .eq(0)
        .trigger('mousedown', { which: 1 })
        .trigger('mousemove', { clientX: 2000, clientY: 800 })
        .trigger('mouseup', { force: true });

      cy.get('button[data-test-subj="savePanelButton"]').click();
      cy.get('div.react-grid-layout>div').eq(0).invoke('height').should('match', new RegExp('470'));
    });

    it('Delete a visualization', () => {
      createVisualization(
        PPL_VISUALIZATIONS_NAMES[1],
        PPL_VISUALIZATIONS[1],
        PPL_VISUALIZATION_CONFIGS[1]
      ).as('vis1');

      cy.then(function () {
        addVisualizationsToPanel(this.thePanel, [this.vis1.id]);
        moveToThePanel(this.thePanel.id);
        cy.get('[data-test-subj="breadcrumb"]').click({ force: true });
        cy.get('input[data-test-subj="operationalPanelSearchBar"]')
          .focus()
          .type(this.thePanel.attributes.title);
        cy.get('a.euiLink').contains(this.thePanel.attributes.title).click();
      });

      cy.get('h5[data-test-subj="visualizationHeader"]')
        .contains(PPL_VISUALIZATIONS_NAMES[1])
        .should('exist');
      cy.get('button[data-test-subj="editPanelButton"]').click();
      cy.get('.visualization-action-button > .euiIcon').eq(0).trigger('mouseover').click();
      cy.get('button[data-test-subj="savePanelButton"]').click();
      cy.get('[data-test-subj="addFirstVisualizationText"]').should('exist');
    });

    it('Duplicate a visualization', () => {
      createVisualization(
        PPL_VISUALIZATIONS_NAMES[0],
        PPL_VISUALIZATIONS[0],
        PPL_VISUALIZATION_CONFIGS[0]
      ).as('vis1');

      cy.then(function () {
        addVisualizationsToPanel(this.thePanel, [this.vis1.id]);
        moveToThePanel(this.thePanel.id);
        cy.get('[data-test-subj="breadcrumb"]').click({ force: true });
        cy.get('input[data-test-subj="operationalPanelSearchBar"]')
          .focus()
          .type(this.thePanel.attributes.title);
        cy.get('a.euiLink').contains(this.thePanel.attributes.title).click();
      });

      cy.get('h5[data-test-subj="visualizationHeader"]')
        .contains(PPL_VISUALIZATIONS_NAMES[0])
        .should('exist');
      cy.get('button[aria-label="actionMenuButton"]').trigger('mouseover').click();
      cy.get('button[data-test-subj="duplicateVizContextMenuItem"]').click();
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
      createVisualization(
        PPL_VISUALIZATIONS_NAMES[1],
        PPL_VISUALIZATIONS[1],
        PPL_VISUALIZATION_CONFIGS[1]
      ).as('vis1');

      createVisualization(
        PPL_VISUALIZATIONS_NAMES[2],
        PPL_VISUALIZATIONS[2],
        PPL_VISUALIZATION_CONFIGS[2]
      ).as('vis2');

      cy.then(function () {
        addVisualizationsToPanel(this.thePanel, [this.vis1.id]);
        moveToThePanel(this.thePanel.id);
        cy.get('[data-test-subj="breadcrumb"]').click({ force: true });
        cy.get('input[data-test-subj="operationalPanelSearchBar"]')
          .focus()
          .type(this.thePanel.attributes.title);
        cy.get('a.euiLink').contains(this.thePanel.attributes.title).click({ force: true });
      });

      cy.get('button[aria-label="actionMenuButton"]').eq(0).click();
      cy.get('button[data-test-subj="replaceVizContextMenuItem"]').click();
      cy.get('select').select(PPL_VISUALIZATIONS_NAMES[2]);
      cy.get('button[aria-label="refreshPreview"]').trigger('mouseover').click();
      cy.get('.plot-container').should('exist');
      cy.get('button[data-test-subj="addFlyoutButton"]').click({ force: true });
      cy.get('.euiToastHeader__title').contains('successfully').should('exist');
      cy.get('h5[data-test-subj="visualizationHeader"]')
        .contains(PPL_VISUALIZATIONS_NAMES[2])
        .should('exist');
    });

    it('Add new visualization to panel', () => {
      cy.clearLocalStorage();
      cy.window().then((win) => win.sessionStorage.clear());
      cy.reload();
      
      cy.get('button[data-test-subj="addVisualizationButton"]').eq(0).click();
      cy.get('button[data-test-subj="createNewVizContextMenuItem"]').click();

      cy.url().should('match', new RegExp('(.*)#/explorer'));
      cy.get('[id^=autocomplete-textarea]')
      .focus()
      .clear()
      .type(PPL_VISUALIZATIONS[0], { force: true, delay: 50 });
      cy.get('.euiButton__text').contains('Run').trigger('mouseover').click();
      cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');

      cy.get('button[id="main-content-vis"]')
        .contains('Visualizations')
        .trigger('mouseover')
        .click();
      cy.get('[data-test-subj="eventExplorer__saveManagementPopover"]')
        .trigger('mouseover')
        .click();

      cy.then(function () {
        cy.get('[data-test-subj="eventExplorer__querySaveComboBox"]').type(
          this.thePanel.attributes.title
        );
        cy.get(`input[value="${this.thePanel.attributes.title}"]`).trigger('mouseover').click();
      });

      cy.get('[data-test-subj="eventExplorer__querySaveName"]')
        .focus()
        .type(PPL_VISUALIZATIONS_NAMES[2]);
      cy.get('[data-test-subj="eventExplorer__querySaveConfirm"]').trigger('mouseover').click();
      cy.get('.euiToastHeader__title').contains('successfully').should('exist');

      cy.then(function () {
        moveToThePanel(this.thePanel.id);
      });

      cy.get('h5[data-test-subj="visualizationHeader"]')
        .contains(PPL_VISUALIZATIONS_NAMES[2])
        .should('exist');
    });

    it('Check visualization edit button', () => {
      createVisualization(
        PPL_VISUALIZATIONS_NAMES[0],
        PPL_VISUALIZATIONS[0],
        PPL_VISUALIZATION_CONFIGS[0]
      ).as('vis1');

      cy.then(function () {
        addVisualizationsToPanel(this.thePanel, [this.vis1.id]);
        moveToThePanel(this.thePanel.id);
        cy.get('[data-test-subj="breadcrumb"]').click({ force: true });
        cy.get('input[data-test-subj="operationalPanelSearchBar"]')
          .focus()
          .type(this.thePanel.attributes.title);
        cy.get('a.euiLink').contains(this.thePanel.attributes.title).click();
      });

      cy.get('h5[data-test-subj="visualizationHeader"]')
        .contains(PPL_VISUALIZATIONS_NAMES[0])
        .should('exist');
      cy.get('button[aria-label="actionMenuButton"]').eq(0).trigger('mouseover').click();
      cy.get('button[data-test-subj="editVizContextMenuItem"]').click();
      cy.url().should('match', new RegExp('(.*)#/explorer'));

      cy.get('[data-test-subj="eventExplorer__saveManagementPopover"]')
        .trigger('mouseover')
        .click();
      cy.get('[data-test-subj="eventExplorer__querySaveName"]')
        .clear({ force: true })
        .type(NEW_VISUALIZATION_NAME, { force: true });
      cy.get('[data-test-subj="eventExplorer__querySaveConfirm"]').trigger('mouseover').click();
      cy.get('.euiToastHeader__title').contains('successfully').should('exist');

      cy.then(function () {
        moveToThePanel(this.thePanel.id);
      });

      cy.get('h5[data-test-subj="visualizationHeader"]')
        .contains(NEW_VISUALIZATION_NAME)
        .should('exist');
    });
  });
});

const moveToOsdDashboards = () => {
  cy.visit(`${Cypress.env('opensearchDashboards')}/app/dashboards#/`);
};

const moveToEventsHome = () => {
  cy.visit(`${Cypress.env('opensearchDashboards')}/app/observability-logs#/`);
};

const moveToPanelHome = () => {
  cy.visit(`${Cypress.env('opensearchDashboards')}/app/observability-dashboards#/`, {
    timeout: 3000,
  });
};

const testPanelTableCell = (name = TEST_PANEL) => cy.get('.euiTableCellContent').contains(name);

const moveToThePanel = (panelId) => {
  cy.visit(`${Cypress.env('opensearchDashboards')}/app/observability-dashboards#/${panelId}`, {
    timeout: 3000,
  });
};

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

const eraseSavedObjectPanels = () => {
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
      response.body.saved_objects.map((soPanel) => {
        cy.request({
          method: 'DELETE',
          failOnStatusCode: false,
          url: `api/saved_objects/observability-panel/${soPanel.id}`,
          headers: {
            'content-type': 'application/json;charset=UTF-8',
            'osd-xsrf': true,
          },
        });
      });
    });
};

const eraseSavedVisualizations = () => {
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
      response.body.saved_objects.map((visualizations) => {
        cy.request({
          method: 'DELETE',
          failOnStatusCode: false,
          url: `api/saved_objects/observability-visualization/${visualizations.id}`,
          headers: {
            'content-type': 'application/json;charset=UTF-8',
            'osd-xsrf': true,
          },
        });
      });
    });
};

const eraseTestPanels = () => {
  eraseLegacyPanels();
  eraseSavedObjectPanels();
};

const uuidRx = /[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}/;

const clickCreatePanelButton = () =>
  cy.get('a[data-test-subj="customPanels__createNewPanels"]').click();

const createSavedObjectPanel = (newName = TEST_PANEL) => {
  return cy
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
    .then((response) => response.body);
};

const addVisualizationsToPanel = (panel, additionalVisualizationIds) => {
  const additionalVisualizations = additionalVisualizationIds.map((id, idx) => {
    return {
      savedVisualizationId: `observability-visualization:${id}`,
      w: 6,
      x: 0,
      h: 4,
      y: idx,
      id: `panel_viz_${id}`,
    };
  });

  panel.attributes.visualizations = [
    ...panel.attributes.visualizations,
    ...additionalVisualizations,
  ];
  cy.request({
    method: 'PUT',
    failOnStatusCode: false,
    url: `api/saved_objects/observability-panel/${panel.id}`,
    headers: {
      'content-type': 'application/json;charset=UTF-8',
      'osd-xsrf': true,
    },
    body: {
      attributes: panel.attributes,
    },
  });
};

const createVisualization = (newName, query, vizConfig) => {
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
          title: newName,
          description: '',
          version: 1,
          createdTimeMs: new Date().getTime(),
          savedVisualization: {
            query: query,
            selected_date_range: {
              start: 'now-2y',
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
            name: newName,
            description: '',
            type: 'bar',
            user_configs: vizConfig,
            subType: 'visualization',
          },
        },
      },
    })
    .then((response) => response.body);
};

const createLegacyPanel = (newName = TEST_PANEL) => {
  cy.request({
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

const openActionsDropdown = () => {
  cy.get('button[data-test-subj="operationalPanelsActionsButton"]').click();
};

const selectThePanel = () => {
  cy.get('.euiCheckbox__input[title="Select this row"]').then(() => {
    cy.get('.euiCheckbox__input[title="Select this row"]').check({ force: true });
  });
};

const expectToastWith = (title) => {
  cy.get('.euiToastHeader__title').contains(title).should('exist');
};

const confirmModal = () => {
  cy.get('button[data-test-subj="runModalButton"]').click();
};
