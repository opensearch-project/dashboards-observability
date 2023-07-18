/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { COMMAND_TIMEOUT_LONG, suppressResizeObserverIssue, delay } from '../constants';

export const clearQuerySearchBoxText = (testSubjectName) => {
  cy.get(`[data-test-subj="${testSubjectName}"]`, {
    timeout: COMMAND_TIMEOUT_LONG,
  }).clear({ force: true });
};

export const querySearch = (query, rangeSelected) => {
  cy.get('[data-test-subj="searchAutocompleteTextArea"]', { timeout: COMMAND_TIMEOUT_LONG })
    .clear()
    .focus()
    .type(query);
  suppressResizeObserverIssue();
  cy.get('[data-test-subj="superDatePickerToggleQuickMenuButton"]').click();
  cy.get(rangeSelected).click();
  cy.get('[data-test-subj="superDatePickerApplyTimeButton"]').contains('Refresh').click();
};

export const landOnEventHome = () => {
  cy.visit(`${Cypress.env('opensearchDashboards')}/app/observability-logs/`);
};

export const landOnEventExplorer = () => {
  cy.visit(
    `${Cypress.env('opensearchDashboards')}/app/observability-logs#/explorer`
  );
};

export const landOnEventVisualizations = () => {
  cy.visit(
    `${Cypress.env('opensearchDashboards')}/app/observability-logs#/explorer`
  );
  suppressResizeObserverIssue(); // have to add
  cy.get('button[id="main-content-vis"]').contains('Visualizations').click();
};

export const landOnPanels = () => {
  cy.visit(
    `${Cypress.env('opensearchDashboards')}/app/observability-dashboards#/`
  );
  cy.wait(delay);
};

const vis_name_sub_string = Math.floor(Math.random() * 100);
export const saveVisualizationAndVerify = () => {
  cy.get('[data-test-subj="eventExplorer__saveManagementPopover"]').click();
  cy.get('[data-test-subj="eventExplorer__querySaveComboBox"]').click();
  cy.get('.euiPopover__panel .euiFormControlLayoutIcons [data-test-subj="comboBoxToggleListButton"]')
    .eq(0)
    .click({ force: true });
  cy.get('.euiPopover__panel input')
    .eq(1)
    .type(`Test visualization` + vis_name_sub_string, { force: true });
  cy.get('[data-test-subj="eventExplorer__querySaveConfirm"]').click({ force: true });
  cy.wait(delay);
  cy.get('.euiHeaderBreadcrumbs a').eq(1).click({ force: true });
  cy.get('.euiFlexGroup .euiFormControlLayout__childrenWrapper input')
    .eq(0)
    .type(`Test visualization` + vis_name_sub_string)
    .type('{enter}');
  cy.get('.euiBasicTable .euiTableCellContent button').eq(0).click();
};

export const deleteVisualization = () => {
  cy.get('a[href = "#/"]').click();
  cy.get('.euiFlexGroup .euiFormControlLayout__childrenWrapper input')
    .eq(0)
    .type(`Test visualization` + vis_name_sub_string)
    .type('{enter}');
  cy.get('input[data-test-subj = "checkboxSelectAll"]').click();
  cy.get('.euiButtonContent.euiButtonContent--iconRight.euiButton__content').click();
  cy.get('.euiContextMenuItem .euiContextMenuItem__text').eq(0).click();
  cy.get('input[placeholder = "delete"]').clear().type('delete');
  cy.get('button[data-test-subj = "popoverModal__deleteButton"]').click();
  cy.get('.euiToastHeader').should('exist');
};
