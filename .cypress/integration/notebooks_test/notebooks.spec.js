/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

import {
  TEST_NOTEBOOK,
  MARKDOWN_TEXT,
  SAMPLE_URL,
  SQL_QUERY_TEXT,
  PPL_QUERY_TEXT,
  NOTEBOOK_TEXT,
  OPENSEARCH_URL,
} from '../../utils/constants';

import { v4 as uuid4 } from 'uuid';

const moveToEventsHome = () => {
  cy.visit(`${Cypress.env('opensearchDashboards')}/app/observability-logs#/`);
};

const moveToPanelHome = () => {
  cy.visit(`${Cypress.env('opensearchDashboards')}/app/observability-dashboards#/`);
};

const moveToNotebookHome = () => {
  cy.visit(`${Cypress.env('opensearchDashboards')}/app/observability-notebooks#/`);
};

const moveToTestNotebook = () => {
  cy.visit(`${Cypress.env('opensearchDashboards')}/app/observability-notebooks#/`, {
    timeout: 6000,
  });

  // Reload page to load notebooks if they are not flushed in OpenSearch index yet.
  cy.reload();

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
    moveToNotebookHome();
  });

  it('Notebooks table empty state', () => {
    cy.get('h3[data-test-subj="notebookTableTitle"]').contains('Notebooks (0)').should('exist');
    cy.get('div[data-test-subj="notebookEmptyTableText"]').contains('No notebooks');
    cy.get('a[data-test-subj="notebookEmptyTableCreateBtn"]').contains('Create notebook');
    cy.get('button[data-test-subj="notebookEmptyTableAddSamplesBtn"]').contains('Add sample notebooks');
  });

  it('Displays error toast for invalid notebook name', () => {
    cy.get('a[data-test-subj="createNotebookPrimaryBtn"]').click();
    cy.get('button[data-test-subj="custom-input-modal-confirm-button"]').click();
    cy.get('div[data-test-subj="euiToastHeader"]')
      .contains('Invalid notebook name')
      .should('exist');
  });

  it('Creates a notebook and redirects to the notebook', () => {
    cy.get('a[data-test-subj="createNotebookPrimaryBtn"]').click();
    cy.get('input[data-test-subj="custom-input-modal-input"]').focus().type(TEST_NOTEBOOK);
    cy.get('button[data-test-subj="custom-input-modal-confirm-button"]').click();
    cy.contains(TEST_NOTEBOOK).should('exist');
  });

  it('Searches existing notebooks', () => {
    cy.get('input.euiFieldSearch').focus().type('this notebook should not exist');
    cy.get('.euiTableCellContent__text').contains('No items found').should('exist');
    cy.get('.euiFormControlLayoutClearButton').click();
    cy.get('input.euiFieldSearch')
      .focus()
      .type(TEST_NOTEBOOK);

    cy.get('a.euiLink')
      .contains(TEST_NOTEBOOK)
      .should('exist');
  });

  it('Notebooks table columns headers and pagination', () => {
    cy.get('h3[data-test-subj="notebookTableTitle"]').should('exist');
    cy.get('.euiTableCellContent__text[title="Name"]').should('exist');
    cy.get('.euiTableCellContent__text[title="Last updated"]').should('exist');
    cy.get('.euiTableCellContent__text[title="Created"]').should('exist');
    cy.get('[data-test-subj="tablePaginationPopoverButton"]').should('exist');
  });

  it('Deletes all notebooks', () => {
    cy.get('input[data-test-subj="checkboxSelectAll"]').click();
    cy.get('button[data-test-subj="notebookTableActionBtn"]').click();
    cy.get('button[data-test-subj="deleteNotebookBtn"]').click();
    cy.get('button[data-test-subj="delete-notebook-modal-delete-button"]').should('be.disabled');
    cy.get('input[data-test-subj="delete-notebook-modal-input"]').focus().type('delete');
    cy.get('button[data-test-subj="delete-notebook-modal-delete-button"]').should(
      'not.be.disabled'
    );
    cy.get('button[data-test-subj="delete-notebook-modal-delete-button"]').click();
    moveToNotebookHome();
    cy.get('div[data-test-subj="notebookEmptyTableText"]').should('exist');
  });
});

describe('Testing paragraphs', () => {
  before(() => {
    moveToNotebookHome();
    cy.get('a[data-test-subj="createNotebookPrimaryBtn"]').click();
    cy.get('input[data-test-subj="custom-input-modal-input"]').focus().type(TEST_NOTEBOOK);
    cy.get('button[data-test-subj="custom-input-modal-confirm-button"]').click();
    cy.get('h3[data-test-subj="notebookTableTitle"]').contains(TEST_NOTEBOOK).should('exist');
  });

  beforeEach(() => {
    moveToTestNotebook();
  });

  it('Creates a code paragraph', () => {
    cy.get('button[data-test-subj="emptyNotebookAddCodeBlockBtn"]').click();
    cy.get('textarea[data-test-subj="editorArea-0"]').should('exist');
    cy.get('button[data-test-subj="runRefreshBtn-0"]').contains('Run').click();
    cy.get('div[data-test-subj="paragraphInputErrorText"]')
      .contains('Input is required.')
      .should('exist');
  });

  it('Renders markdown', () => {
    cy.get('button[data-test-subj="paragraphToggleInputBtn"]').click();
    cy.get('.euiCodeBlock').click();
    cy.get('textarea[data-test-subj="editorArea-0"]').clear();
    cy.get('textarea[data-test-subj="editorArea-0"]').focus().type(MARKDOWN_TEXT);

    cy.get('button[data-test-subj="runRefreshBtn-0"]').click();
    cy.get('textarea[data-test-subj="editorArea-0"]').should('not.exist');
    cy.get(`a[href="${SAMPLE_URL}"]`).should('exist');
    cy.get('code').contains('POST').should('exist');
    cy.get('td').contains('b2').should('exist');
  });

  it('Has working breadcrumbs', () => {
    cy.get('a[data-test-subj="breadcrumb last"]').contains(TEST_NOTEBOOK).click();
    cy.get('h3[data-test-subj="notebookTableTitle"]').contains(TEST_NOTEBOOK).should('exist');
    cy.get('a[data-test-subj="breadcrumb"]').contains('Notebooks').click();
    cy.get('h3[data-test-subj="notebookTableTitle"]').should('exist');
    cy.get('a[data-test-subj="breadcrumb first"]').contains('Observability').click();
    cy.get('h1[data-test-subj="eventHomePageTitle"]').should('exist');
  });

  it('Paragraph actions layout', () => {
    cy.get('button[data-test-subj="notebook-paragraph-actions-button"]').should('exist').click();
    cy.get('.euiContextMenuItem__text').eq(0).contains('To top');
    cy.get('.euiContextMenuItem__text').eq(1).contains('To bottom');
  });

  it('Shows output message', () => {
    cy.get('button[data-test-subj="paragraphToggleInputBtn"]').click();
    cy.get('div[data-test-subj="lastRunText"]').should('exist');
    cy.get('.euiCodeBlock').click();
    cy.get('textarea[data-test-subj="editorArea-0"]').focus().type('Another text');
    cy.get('div[data-test-subj="lastRunText"]').should('exist');
  });

  it('Renders input only mode', () => {
    cy.get('input[data-test-subj="input_only"]').should('exist');
    cy.get('input[data-test-subj="input_only"]').click({ force: true });

    cy.get('div.markdown-body').should('not.exist');
    cy.get('button[data-test-subj="viewBothLink"]').should('exist');
    cy.get('button[data-test-subj="viewBothLink"]').click();

    cy.get('code').contains('POST').should('exist');
    cy.get('button[data-test-subj="viewBothLink"]').should('not.exist');
  });

  it('Renders output only mode', () => {
    cy.get('input[data-test-subj="output_only"]').should('exist');
    cy.get('input[data-test-subj="output_only"]').click({ force: true });
    cy.get('button[aria-label="Open paragraph menu"]').should('not.exist');
    cy.get('button[data-test-subj="paragraphToggleInputBtn"]').should('not.exist');
    cy.get('code').contains('POST').should('exist');
  });

  it('Duplicates paragraphs', () => {
    cy.get('.euiButtonIcon[aria-label="Open paragraph menu"]').eq(0).click();
    cy.get('button[data-test-subj="duplicateParagraphBtn"]').click();
    cy.get('button[data-test-subj="runRefreshBtn-1"]').click();

    cy.get(`a[href="${SAMPLE_URL}"]`).should('have.length.gte', 2);
  });

  it('Adds a dashboards visualization paragraph', () => {
    cy.intercept('GET', '**/api/saved_objects/_find?type=observability-visualization').as(
      'getObservabilityVisualization'
    );
    cy.get('button[data-test-subj="AddParagraphButton"]').click();
    cy.get('button[data-test-subj="AddVisualizationBlockBtn"]').click();
    cy.wait('@getObservabilityVisualization');

    cy.get('button[data-test-subj="runRefreshBtn-2"]').click();
    cy.get('div[data-test-subj="paragraphInputErrorText"]')
      .contains('Visualization is required.')
      .should('exist');

    cy.get('.euiButton__text').contains('Browse').click();
    cy.get('.euiModalHeader__title').contains('Browse visualizations').should('exist');
    cy.get('input[aria-label="Searchable Visualizations"]')
      .focus()
      .type('[Flights] Flight Count and Average Ticket Price{enter}');
    cy.get('button[data-test-subj="para-input-select-button"]').click();
    cy.get('button[data-test-subj="runRefreshBtn-2"]').click();
    cy.get('div.visualization').should('exist');
  });

  it('Adds a SQL query paragraph', () => {
    cy.get('button[data-test-subj="notebook-paragraph-actions-button"]').click();
    cy.get('span.euiContextMenuItem__text').contains('To top').click();
    cy.get('button.euiContextMenuItem').contains('Code block').click();

    cy.get('textarea[data-test-subj="editorArea-0"]').clear();
    cy.get('textarea[data-test-subj="editorArea-0"]').focus();
    cy.get('textarea[data-test-subj="editorArea-0"]').type(SQL_QUERY_TEXT);
    cy.get('button[data-test-subj="runRefreshBtn-0"]').click();

    cy.get('textarea[data-test-subj="editorArea-0"]').should('not.exist');
    cy.get('div[data-test-subj="queryOutputText"]')
      .contains('select * from opensearch_dashboards_sample_data_flights limit 20')
      .should('exist');

    cy.get('.euiDataGrid__overflow').should('exist');
  });

  it('Renders very long markdown as wrapped', () => {
    cy.get('button[data-test-subj="AddParagraphButton"]').click();
    cy.get('button[data-test-subj="AddCodeBlockBtn"]').click();

    const testWord = uuid4().replace(/-/gi, '').repeat(10);
    cy.get('textarea[data-test-subj="editorArea-4"]').clear();
    cy.get('textarea[data-test-subj="editorArea-4"]').focus();
    cy.get('textarea[data-test-subj="editorArea-4"]').type(`%md\n${testWord}`);
    cy.get('button[data-test-subj="runRefreshBtn-4"]').click();

    cy.get('textarea[data-test-subj="editorArea-4"]').should('not.exist');
    cy.get('div[data-test-subj="markdownOutputText"]')
      .contains(testWord)
      .then((element) => {
        const clientWidth = element[0].clientWidth;
        const scrollWidth = element[0].scrollWidth;
        expect(scrollWidth, 'Output Text has not been wrapped').to.be.at.most(clientWidth);
      });
  });

  it('Renders very long query as wrapped', () => {
    cy.get('button[data-test-subj="AddParagraphButton"]').click();
    cy.get('button[data-test-subj="AddCodeBlockBtn"]').click();

    const testWord = 'randomText' + uuid4().replace(/-/gi, '').repeat(10);
    cy.get('textarea[data-test-subj="editorArea-5"]').clear();
    cy.get('textarea[data-test-subj="editorArea-5"]').focus();
    cy.get('textarea[data-test-subj="editorArea-5"]').type(`%sql\nSELECT 1 AS ${testWord}`);
    cy.get('button[data-test-subj="runRefreshBtn-5"]').click();

    cy.get('textarea[data-test-subj="editorArea-5"]').should('not.exist');
    cy.get('div[data-test-subj="queryOutputText"]').contains(testWord).should('exist');
    cy.get('div[data-test-subj="queryOutputText"]')
      .contains(testWord)
      .then((element) => {
        const clientWidth = element[0].clientWidth;
        const scrollWidth = element[0].scrollWidth;
        expect(scrollWidth, 'Output Text has not been wrapped').to.be.at.most(clientWidth);
      });
  });

  it('Adds an observability visualization paragraph', () => {
    cy.get('button[data-test-subj="notebook-paragraph-actions-button"]').click();
    cy.get('span.euiContextMenuItem__text').contains('To top').click();
    cy.get('button.euiContextMenuItem').contains('Visualization').click();

    cy.get('button[data-test-subj="runRefreshBtn-0"]').click();
    cy.get('div[data-test-subj="paragraphInputErrorText"]')
      .contains('Visualization is required.')
      .should('exist');
    cy.get('div[data-test-subj="comboBoxInput"]').click();
    cy.get('input[data-test-subj="comboBoxSearchInput"]')
      .focus()
      .type('[Logs] Count total requests by tags');

    cy.get('.euiComboBoxOption__content').contains('[Logs] Count total requests by tags').click();
    cy.get('button[data-test-subj="runRefreshBtn-0"]').click();
    cy.get('h5').contains('[Logs] Count total requests by tags').should('exist');
  });

  it('Adds a PPL query paragraph', () => {
    cy.get('button[data-test-subj="AddParagraphButton"]').click();
    cy.get('button[data-test-subj="AddCodeBlockBtn"]').click();

    cy.get('textarea[data-test-subj="editorArea-7"]').clear();
    cy.get('textarea[data-test-subj="editorArea-7"]').focus();
    cy.get('textarea[data-test-subj="editorArea-7"]').type(PPL_QUERY_TEXT);
    cy.get('button[data-test-subj="runRefreshBtn-7"]').click();

    cy.get('textarea[data-test-subj="editorArea-7"]').should('not.exist');
    cy.get('div[data-test-subj="queryOutputText"]')
      .contains('source=opensearch_dashboards_sample_data_flights')
      .should('exist');

    cy.get('.euiDataGrid__overflow').should('exist');
  });

  it('Clears outputs', () => {
    cy.get('h3[data-test-subj="notebookTitle"]').contains(TEST_NOTEBOOK).should('exist');
    cy.get('[data-test-subj="notebook-paragraph-actions-button"]').should('exist');
    cy.get('[data-test-subj="notebook-paragraph-actions-button"]').click();
    cy.get('.euiContextMenuItem__text').contains('Clear all outputs').click();
    cy.get('button[data-test-subj="confirmModalConfirmButton"]').click();

    cy.get(`a[href="${SAMPLE_URL}"]`).should('not.exist');
  });

  it('Runs all paragraphs', () => {
    cy.get('h3[data-test-subj="notebookTitle"]').contains(TEST_NOTEBOOK).should('exist');
    cy.get('[data-test-subj="notebook-paragraph-actions-button"]').click();
    cy.get('.euiContextMenuItem__text').contains('Run all paragraphs').click();

    cy.get(`a[href="${SAMPLE_URL}"]`).should('exist');
  });

  it('Adds paragraph to top', () => {
    cy.get('h3[data-test-subj="notebookTitle"]').contains(TEST_NOTEBOOK).should('exist');

    cy.get('button[data-test-subj="notebook-paragraph-actions-button"]').click();
    cy.get('span.euiContextMenuItem__text').contains('To top').click();
    cy.get('button.euiContextMenuItem').contains('Code block').click();

    cy.get('.euiText').contains('[1] Code block').should('exist');
  });

  it('Adds paragraph to bottom', () => {
    cy.get('h3[data-test-subj="notebookTitle"]').contains(TEST_NOTEBOOK).should('exist');

    cy.get('button[data-test-subj="notebook-paragraph-actions-button"]').click();
    cy.get('span.euiContextMenuItem__text').contains('To To bottom').click();
    cy.get('button.euiContextMenuItem').contains('Code block').click();

    cy.get('.euiText').contains('[4] Visualization').should('exist');
    cy.get('.euiText').contains('[5] Code block').should('exist');
  });

  it('Moves paragraphs', () => {
    cy.get('h3[data-test-subj="notebookTitle"]').contains(TEST_NOTEBOOK).should('exist');
    cy.get('.euiButtonIcon[aria-label="Open paragraph menu"').eq(0).click();
    cy.get('.euiContextMenuItem-isDisabled').should('have.length.gte', 2);
    cy.get('.euiContextMenuItem__text').contains('Move to bottom').click();

    cy.get('.euiText').contains('[3] Visualization').should('exist');
  });

  it('Duplicates and renames the notebook', () => {
    cy.get('h3[data-test-subj="notebookTitle"]').contains(TEST_NOTEBOOK).should('exist');
    cy.get('[data-test-subj="notebook-notebook-actions-button"]').click();
    cy.get('.euiContextMenuItem__text').contains('Duplicate notebook').click();
    cy.get('.euiButton__text').contains('Duplicate').click();

    cy.get('[data-test-subj="notebook-notebook-actions-button"]').click();
    cy.get('.euiContextMenuItem__text').contains('Rename notebook').click();
    cy.get('input.euiFieldText[data-autofocus="true"]').focus().type(' (rename)');
    cy.get('.euiButton__text').last().contains('Rename').click();
    cy.reload();

    cy.get('.euiText')
      .contains(TEST_NOTEBOOK + ' (rename)')
      .should('exist');
    cy.get(`a[href="${SAMPLE_URL}"]`).should('have.length.gte', 2);
  });

  it('Deletes paragraphs', () => {
    cy.get('h3[data-test-subj="notebookTitle"]').contains(TEST_NOTEBOOK).should('exist');
    cy.get('[data-test-subj="notebook-paragraph-actions-button"]').click();
    cy.get('.euiContextMenuItem__text').contains('Delete all paragraphs').click();
    cy.get('button[data-test-subj="confirmModalConfirmButton"]').click();

    cy.get('button[data-test-subj="emptyNotebookAddCodeBlockBtn"]').should('exist');
  });

  it('Deletes notebook', () => {
    cy.get('[data-test-subj="notebook-notebook-actions-button"]').click();
    cy.get('.euiContextMenuItem__text').contains('Delete notebook').click();
    cy.get('button[data-test-subj="delete-notebook-modal-delete-button"]').should('be.disabled');

    cy.get('input[data-test-subj="delete-notebook-modal-input"]').focus().type('delete');
    cy.get('button[data-test-subj="delete-notebook-modal-delete-button"]').should(
      'not.be.disabled'
    );
    cy.get('button[data-test-subj="delete-notebook-modal-delete-button"]').click();
    cy.get('a[data-test-subj="createNotebookPrimaryBtn"]').should('exist');
  });
});

describe('clean up all test data', () => {
  it('Cleans up test notebooks', () => {
    moveToNotebookHome();
    cy.get('input[data-test-subj="checkboxSelectAll"]').click();
    cy.get('button[data-test-subj="notebookTableActionBtn"]').click();
    cy.get('button[data-test-subj="deleteNotebookBtn"]').click();
    cy.get('button[data-test-subj="delete-notebook-modal-delete-button"]').should('be.disabled');
    cy.get('input[data-test-subj="delete-notebook-modal-input"]').focus().type('delete');
    cy.get('button[data-test-subj="delete-notebook-modal-delete-button"]').should(
      'not.be.disabled'
    );
    cy.get('button[data-test-subj="delete-notebook-modal-delete-button"]').click();
    moveToNotebookHome();
    cy.get('div[data-test-subj="notebookEmptyTableText"]').should('exist');
  });

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

describe('link check ', () => {
  it('"Learn more" link under Notebooks header', () => {
    moveToNotebookHome();
    cy.get('h3[data-test-subj="notebookTableTitle"]').should('exist');
    cy.get('div[data-test-subj="notebookTableDescription"]').contains(NOTEBOOK_TEXT);
    cy.get('a.euiLink.euiLink--primary').contains('Learn more').click();
    cy.get(`a[href="${OPENSEARCH_URL}"]`).should('exist');
  });
});
