/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

import {
  delay,
  TEST_NOTEBOOK,
  MARKDOWN_TEXT,
  SAMPLE_URL,
  SQL_QUERY_TEXT,
  PPL_QUERY_TEXT,
  NOTEBOOK_TEXT,
  OPENSEARCH_URL,
  COMMAND_TIMEOUT_LONG,
} from '../utils/constants';

import { SAMPLE_PANEL } from '../utils/panel_constants';

import { skipOn } from '@cypress/skip-test';

import { v4 as uuid4 } from 'uuid';

const moveToEventsHome = () => {
  cy.visit(`${Cypress.env('opensearchDashboards')}/app/observability-logs#/`);
};

const moveToPanelHome = () => {
  cy.visit(`${Cypress.env('opensearchDashboards')}/app/observability-dashboards#/`);
};

const moveToTestNotebook = () => {
  cy.visit(`${Cypress.env('opensearchDashboards')}/app/observability-notebooks#/`, {
    timeout: 6000,
  });
  cy.get('.euiTableCellContent')
    .contains(TEST_NOTEBOOK, {
      timeout: 6000,
    })
    .click();
};

describe('Adding sample data and visualization', () => {
  it('Adds sample flights data for visualization paragraph', () => {
    cy.visit(`${Cypress.env('opensearchDashboards')}/app/home#/tutorial_directory/sampleData`);
    cy.get('div[data-test-subj="sampleDataSetCardflights"]')
      .contains(/(Add|View) data/)
      .click();
  });

  it('Add sample observability data', () => {
    moveToEventsHome();
    cy.get('button[data-test-subj="eventHomeAction"]').trigger('mouseover').click();
    cy.get('button[data-test-subj="eventHomeAction__addSamples"]').trigger('mouseover').click();
    cy.get('.euiModalHeader__title[data-test-subj="confirmModalTitleText"]')
      .contains('Add samples')
      .should('exist');
    cy.get('button[data-test-subj="confirmModalConfirmButton"]').trigger('mouseover').click();
    cy.intercept('POST', '/addSamplePanels').as('addSamples');

    cy.get('.euiToastHeader__title').should('contain', 'successfully');
  });
});

describe('Testing notebooks table', () => {
  beforeEach(() => {
    cy.visit(`${Cypress.env('opensearchDashboards')}/app/observability-notebooks#/`);
  });

  it('Notebooks table empty state', () => {
    cy.get('#notebookArea').contains('Notebooks (0)').should('exist');
    cy.get('.euiTextAlign.euiTextAlign--center').contains('No notebooks');
    cy.get('.euiButton__text').eq(2).contains('Create notebook');
    cy.get('.euiButton__text').eq(3).contains('Add samples');
  });

  it('Displays error toast for invalid notebook name', () => {
    cy.get('.euiButton__text').contains('Create notebook').click();
    cy.get('.euiButton__text')
      .contains(/^Create$/)
      .click();
    cy.get('.euiToastHeader__title').contains('Invalid notebook name').should('exist');
  });

  it('Creates a notebook and redirects to the notebook', () => {
    cy.get('.euiButton__text').contains('Create notebook').click();
    cy.get('input.euiFieldText').type(TEST_NOTEBOOK);
    cy.get('.euiButton__text')
      .contains(/^Create$/)
      .click();
    cy.contains(TEST_NOTEBOOK).should('exist');
  });

  it('Duplicates and renames a notebook', () => {
    cy.get('.euiCheckbox__input[title="Select this row"]').eq(0).click();
    cy.get('.euiButton__text').contains('Actions').click();
    cy.get('.euiContextMenuItem__text').contains('Duplicate').click();
    cy.get('.euiButton__text').contains('Duplicate').click();

    cy.get('.euiCheckbox__input[title="Select this row"]').eq(1).click();
    cy.get('.euiCheckbox__input[title="Select this row"]').eq(0).click();
    cy.get('.euiButton__text').contains('Actions').click();
    cy.get('.euiContextMenuItem__text').contains('Rename').click();
    cy.get('input.euiFieldText').type(' (rename)');
    cy.get('.euiButton__text').contains('Rename').click();
  });

  it('Searches existing notebooks', () => {
    cy.get('input.euiFieldSearch').type('this notebook should not exist');
    cy.get('.euiTableCellContent__text').contains('No items found').should('exist');
    cy.get('.euiFormControlLayoutClearButton').click();
    cy.get('input.euiFieldSearch').type(TEST_NOTEBOOK + ' (copy) (rename)');

    cy.get('a.euiLink')
      .contains(TEST_NOTEBOOK + ' (copy) (rename)')
      .should('exist');
  });

  it('Notebooks table columns headers and pagination', () => {
    cy.get('.euiTitle.euiTitle--small').contains('Notebooks').should('exist');
    cy.get('.euiTableCellContent__text[title="Name"]').should('exist');
    cy.get('.euiTableCellContent__text[title="Last updated"]').should('exist');
    cy.get('.euiTableCellContent__text[title="Created"]').should('exist');
    cy.get('[data-test-subj="tablePaginationPopoverButton"]').should('exist');
  });

  it('"Learn more" link under Notebooks header', () => {
    cy.get('.euiTitle.euiTitle--small').contains('Notebooks');
    cy.get('.euiTextColor.euiTextColor--subdued').contains(NOTEBOOK_TEXT);
    cy.get('a.euiLink.euiLink--primary').contains('Learn more').click();
    cy.get(`a[href="${OPENSEARCH_URL}"]`).should('exist');
  });

  it('Deletes notebooks', () => {
    cy.get('.euiCheckbox__input[data-test-subj="checkboxSelectAll"]').click();
    cy.get('.euiButton__text').contains('Actions').click();
    cy.get('.euiContextMenuItem__text').contains('Delete').click();

    cy.get('button.euiButton--danger').should('be.disabled');

    cy.get('input.euiFieldText[placeholder="delete"]').type('delete');
    cy.get('button.euiButton--danger').should('not.be.disabled');
    cy.get('.euiButton__text').contains('Delete').click();

    cy.get('.euiTextAlign').contains('No notebooks').should('exist');

    // keep a notebook for testing
    cy.get('.euiButton__text').contains('Create notebook').click();
    cy.get('input.euiFieldText').type(TEST_NOTEBOOK);
    cy.get('.euiButton__text')
      .contains(/^Create$/)
      .click();
  });
});

describe('Test reporting integration if plugin installed', () => {
  beforeEach(() => {
    cy.visit(`${Cypress.env('opensearchDashboards')}/app/observability-notebooks#/`);
    cy.get('.euiTableCellContent').contains(TEST_NOTEBOOK).click();
    cy.wait(delay); //page needs to process before checking
    cy.get('body').then(($body) => {
      skipOn($body.find('#reportingActionsButton').length <= 0);
    });
  });

  it('Create in-context PDF report from notebook', () => {
    cy.get('#reportingActionsButton').click();
    cy.get('button.euiContextMenuItem:nth-child(1)').contains('Download PDF').click();
    cy.get('#downloadInProgressLoadingModal').should('exist');
  });

  it('Create in-context PNG report from notebook', () => {
    cy.get('#reportingActionsButton').click();
    cy.get('button.euiContextMenuItem:nth-child(2)').contains('Download PNG').click();
    cy.get('#downloadInProgressLoadingModal').should('exist');
  });

  it('Create on-demand report definition from context menu', () => {
    cy.get('#reportingActionsButton').click();
    cy.get('button.euiContextMenuItem:nth-child(3)').contains('Create report definition').click();
    cy.location('pathname', { timeout: 60000 }).should('include', '/reports-dashboards');
    cy.get('#reportSettingsName').type('Create notebook on-demand report');
    cy.get('#createNewReportDefinition').click({ force: true });
  });

  it('View reports homepage from context menu', () => {
    cy.get('#reportingActionsButton').click();
    cy.get('button.euiContextMenuItem:nth-child(4)').contains('View reports').click();
    cy.location('pathname', { timeout: 60000 }).should('include', '/reports-dashboards');
  });
});

describe('Testing paragraphs', () => {
  beforeEach(() => {
    moveToTestNotebook();
  });

  it('Goes into a notebook and creates paragraphs', () => {
    cy.get('.euiButton__text').contains('Add').click({ force: true });

    cy.get('.euiTextArea').should('exist');

    cy.get('.euiButton__text').contains('Run').click();
    cy.get('.euiTextColor').contains('Input is required.').should('exist');
    cy.get('.euiTextArea').clear();
    cy.get('.euiTextArea').type(MARKDOWN_TEXT);

    cy.get('.euiButton__text').contains('Run').click();
  });

  it('Has working breadcrumbs', () => {
    cy.get('.euiBreadcrumb').contains(TEST_NOTEBOOK).click();
    cy.get('.euiTitle').contains(TEST_NOTEBOOK).should('exist');
    cy.get('.euiBreadcrumb').contains('Notebooks').click();
    cy.get('.euiTitle').contains('Notebooks').should('exist');
    cy.get('.euiBreadcrumb').contains('Observability').click();
    cy.get('.euiTitle').contains('Logs').should('exist');
  });

  it('Paragraph actions layout', () => {
    cy.get('button[data-test-subj="notebook-paragraph-actions-button"]').should('exist').click();
    cy.get('.euiContextMenuPanelTitle').contains('Actions');
    cy.get('.euiContextMenuItem__text').eq(0).contains('Add paragraph to top');
    cy.get('.euiContextMenuItem__text').eq(1).contains('Add paragraph to bottom');
    cy.get('.euiContextMenuItem__text').eq(2).contains('Run all paragraphs');
    cy.get('.euiContextMenuItem__text').eq(3).contains('Clear all outputs');
    cy.get('.euiContextMenuItem__text').eq(4).contains('Delete all paragraphs');
  });

  it('Renders markdown', () => {
    cy.get('.euiTextArea').should('not.exist');
    cy.get(`a[href="${SAMPLE_URL}"]`).should('exist');
    cy.get('code').contains('POST').should('exist');
    cy.get('td').contains('b2').should('exist');
  });

  it('Shows output message', () => {
    cy.get('button[aria-label="Toggle show input"]').click();
    cy.get('.euiTextColor').contains('Last successful run').should('exist');

    cy.get('pre.input').eq(0).click();
    cy.get('.euiTextArea').type('Another text');

    cy.get('.euiTextColor').contains('Last successful run').should('exist');
  });

  it('Renders input only mode', () => {
    cy.get('.euiButton__text[title="Input only"]').click();

    cy.get('div.markdown-body').should('not.exist');
    cy.get('.euiLink').contains('View both').should('exist');
    cy.get('.euiLink').contains('View both').click();

    cy.get('code').contains('POST').should('exist');
    cy.get('.euiLink').contains('View both').should('not.exist');
  });

  it('Renders output only mode', () => {
    cy.get('.euiButton__text[title="Output only"]').click();

    cy.get('button[aria-label="Open paragraph menu"]').should('not.exist');
    cy.get('button[aria-label="Toggle show input"]').should('not.exist');
    cy.get('code').contains('POST').should('exist');
  });

  it('Duplicates paragraphs', () => {
    cy.get('.euiButtonIcon[aria-label="Open paragraph menu"]').eq(0).click();
    cy.get('.euiContextMenuItem__text').contains('Duplicate').eq(0).click();
    cy.get('.euiButton__text').contains('Run').click();

    cy.get(`a[href="${SAMPLE_URL}"]`).should('have.length.gte', 2);
  });

  it('Adds a dashboards visualization paragraph', () => {
    cy.contains('Add paragraph').click();
    cy.get('.euiContextMenuItem__text').contains('Visualization').click();

    cy.get('.euiButton__text').contains('Run').click();
    cy.get('.euiTextColor').contains('Visualization is required.').should('exist');
    cy.wait(delay);
    cy.get('.euiButton__text').contains('Browse').click();
    cy.wait(delay);
    cy.get('.euiFieldSearch')
      .focus()
      .type('[Flights] Flight Count and Average Ticket Price{enter}');
    cy.get('.euiButton__text').contains('Select').click();
    cy.get('.euiButton__text').contains('Run').click();
    cy.get('div.visualization').should('exist');
  });

  it('Adds a SQL query paragraph', () => {
    cy.contains('Add paragraph').click();
    cy.get('.euiContextMenuItem__text').contains('Code block').click(),
      { timeout: COMMAND_TIMEOUT_LONG };
    cy.wait(delay); //SQL_QUERY_TEXT will sometimes fail to type without this delay

    cy.get('.euiTextArea').type(SQL_QUERY_TEXT);
    cy.get('.euiButton__text').contains('Run').click();

    cy.get('b').contains('select * from opensearch_dashboards_sample_data_flights limit 20');

    cy.get('.euiDataGrid__overflow').should('exist');
  });

  it('Renders very long markdown as wrapped', () => {
    cy.contains('Add paragraph').click();
    cy.get('.euiContextMenuItem__text').contains('Code block').click(),
      { timeout: COMMAND_TIMEOUT_LONG };
    cy.wait(delay); //SQL_QUERY_TEXT will sometimes fail to type without this delay

    const testWord = uuid4().replace(/-/gi, '').repeat(10);
    cy.get('.euiTextArea').type(`%md\n${testWord}`);
    cy.get('.euiButton__text').contains('Run').click();

    cy.get('p')
      .contains(testWord)
      .then((element) => {
        const clientWidth = element[0].clientWidth;
        const scrollWidth = element[0].scrollWidth;
        console.log('paragraph', { clientWidth, scrollWidth });
        expect(scrollWidth, 'Output Text has not been wrapped').to.be.at.most(clientWidth);
      });
  });

  it('Renders very long query as wrapped', () => {
    cy.contains('Add paragraph').click();
    cy.get('.euiContextMenuItem__text').contains('Code block').click(),
      { timeout: COMMAND_TIMEOUT_LONG };
    cy.wait(delay); //SQL_QUERY_TEXT will sometimes fail to type without this delay

    const testWord = uuid4().replace(/-/gi, '').repeat(10);
    cy.get('.euiTextArea').type(`%sql\nSELECT 1 AS ${testWord}`);
    cy.get('.euiButton__text').contains('Run').click();

    cy.get('b')
      .contains(testWord)
      .then((element) => {
        const clientWidth = element[0].clientWidth;
        const scrollWidth = element[0].scrollWidth;
        expect(scrollWidth, 'Output Text has not been wrapped').to.be.at.most(clientWidth);
      });
  });

  it('Adds an observability visualization paragraph', () => {
    cy.contains('Add paragraph').click();
    cy.get('.euiContextMenuItem__text').contains('Visualization').click();

    cy.get('.euiButton__text').contains('Run').click();
    cy.get('.euiTextColor').contains('Visualization is required.').should('exist');

    cy.wait(delay);
    cy.get('.euiButton__text').contains('Browse').click({ force: true });
    cy.wait(delay);
    cy.get('.euiFieldSearch').focus().type('[Logs] Count total requests by tags{enter}');
    cy.get('.euiButton__text').contains('Select').click();
    cy.get('.euiButton__text').contains('Run').click();
    cy.get('h5').contains('[Logs] Count total requests by tags').should('exist');
  });

  it('Adds a PPL query paragraph', () => {
    cy.contains('Add paragraph').click();
    cy.get('.euiContextMenuItem__text').contains('Code block').click(),
      { timeout: COMMAND_TIMEOUT_LONG };
    cy.wait(delay); //PPL_QUERY_TEXT will sometimes fail to type without this delay

    cy.get('.euiTextArea').type(PPL_QUERY_TEXT);
    cy.get('.euiButton__text').contains('Run').click();

    cy.get('b').contains('source=opensearch_dashboards_sample_data_flights');

    cy.get('.euiDataGrid__overflow').should('exist');
  });

  it('Clears outputs', () => {
    cy.wait(delay); // need to wait for paragraphs to load first
    cy.get('[data-test-subj="notebook-paragraph-actions-button"]').click();
    cy.get('.euiContextMenuItem__text').contains('Clear all outputs').click();
    cy.get('.euiButton__text').contains('Clear').click();

    cy.get(`a[href="${SAMPLE_URL}"]`).should('not.exist');
  });

  it('Runs all paragraphs', () => {
    cy.wait(delay); // need to wait for paragraphs to load first
    cy.get('[data-test-subj="notebook-paragraph-actions-button"]').click();
    cy.get('.euiContextMenuItem__text').contains('Run all paragraphs').click();

    cy.get(`a[href="${SAMPLE_URL}"]`).should('exist');
  });

  it('Adds paragraph to top and bottom', () => {
    cy.wait(delay); // need to wait for paragraphs to load first
    cy.get('[data-test-subj="notebook-paragraph-actions-button"]').click();

    cy.get('.euiContextMenuItem__text').contains('Add paragraph to top').click();
    cy.get('.euiContextMenuItem__text').contains('Code block').click();
    cy.wait(delay);
    cy.get('[data-test-subj="notebook-paragraph-actions-button"]').click();
    cy.get('.euiContextMenuItem__text').contains('Add paragraph to bottom').click();
    cy.get('.euiContextMenuItem__text').contains('Code block').click();

    cy.get('.euiText').contains('[4] Visualization').should('exist');
    cy.get('.euiText').contains('[5] Code block').should('exist');
  });

  it('Moves paragraphs', () => {
    cy.get('.euiButtonIcon[aria-label="Open paragraph menu"').eq(0).click();
    cy.get('.euiContextMenuItem-isDisabled').should('have.length.gte', 2);
    cy.get('.euiContextMenuItem__text').contains('Move to bottom').click();

    cy.get('.euiText').contains('[3] Visualization').should('exist');
  });

  it('Duplicates and renames the notebook', () => {
    cy.wait(delay);
    cy.get('[data-test-subj="notebook-notebook-actions-button"]').click();
    cy.get('.euiContextMenuItem__text').contains('Duplicate notebook').click();
    cy.get('.euiButton__text').contains('Duplicate').click();

    cy.get('[data-test-subj="notebook-notebook-actions-button"]').click();
    cy.get('.euiContextMenuItem__text').contains('Rename notebook').click();
    cy.get('input.euiFieldText[data-autofocus="true"]').type(' (rename)');
    cy.get('.euiButton__text').last().contains('Rename').click();
    cy.reload();
    cy.wait(delay);

    cy.get('.euiTitle')
      .contains(TEST_NOTEBOOK + ' (rename)')
      .should('exist');
    cy.get(`a[href="${SAMPLE_URL}"]`).should('have.length.gte', 2);
  });

  it('Deletes paragraphs', () => {
    cy.get('[data-test-subj="notebook-paragraph-actions-button"]').click();
    cy.get('.euiContextMenuItem__text').contains('Delete all paragraphs').click();
    cy.get('.euiButton__text').contains('Delete').click();

    cy.get('.euiTextAlign').contains('No paragraphs').should('exist');
  });

  it('Deletes notebook', () => {
    cy.get('[data-test-subj="notebook-notebook-actions-button"]').click();
    cy.get('.euiContextMenuItem__text').contains('Delete notebook').click();

    cy.get('button.euiButton--danger').should('be.disabled');

    cy.get('input.euiFieldText[placeholder="delete"]').type('delete');
    cy.get('button.euiButton--danger').should('not.be.disabled');
    cy.get('.euiButton__text').contains('Delete').click();

    cy.get('.euiButton__text').contains('Create notebook').should('exist');
  });

  it('Cleans up test notebooks', () => {
    cy.get('[data-test-subj="notebook-notebook-actions-button"]').click();
    cy.get('.euiContextMenuItem__text').contains('Delete notebook').click();

    cy.get('button.euiButton--danger').should('be.disabled');

    cy.get('input.euiFieldText[placeholder="delete"]').type('delete');
    cy.get('button.euiButton--danger').should('not.be.disabled');
    cy.get('.euiButton__text').contains('Delete').click();

    cy.get('.euiText').contains('No notebooks').should('exist');
  });
});

describe('clean up all test data', () => {
  it('Delete visualizations from event analytics', () => {
    moveToEventsHome();
    cy.get('[data-test-subj="tablePaginationPopoverButton"]').trigger('mouseover').click();
    cy.get('.euiContextMenuItem__text').contains('50 rows').trigger('mouseover').click();
    cy.get('.euiCheckbox__input[data-test-subj="checkboxSelectAll"]').trigger('mouseover').click();
    cy.get('.euiButton__text').contains('Actions').trigger('mouseover').click();
    cy.get('.euiContextMenuItem__text').contains('Delete').trigger('mouseover').click();
    cy.get('button.euiButton--danger').should('be.disabled');
    cy.get('input.euiFieldText[placeholder="delete"]').focus().type('delete', { delay: 50 });
    cy.get('button.euiButton--danger').should('not.be.disabled');
    cy.get('.euiButton__text').contains('Delete').trigger('mouseover').click();
    cy.get('.euiTextAlign').contains('No Queries or Visualizations').should('exist');
  });

  it('Deletes test panel', () => {
    moveToPanelHome();
    cy.get('.euiCheckbox__input[data-test-subj="checkboxSelectAll"]').trigger('mouseover').click();
    cy.get('.euiButton__text').contains('Actions').trigger('mouseover').click();
    cy.get('.euiContextMenuItem__text').contains('Delete').trigger('mouseover').click();
    cy.get('button.euiButton--danger').should('be.disabled');
    cy.get('input.euiFieldText[placeholder="delete"]').focus().type('delete', { delay: 50 });
    cy.get('button.euiButton--danger').should('not.be.disabled');
    cy.get('.euiButton__text').contains('Delete').trigger('mouseover').click();
  });
});
