/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

import { delay, setTimeFilter, SPAN_ID, TRACE_ID } from '../utils/constants';

describe('Testing traces table empty state', () => {
  beforeEach(() => {
    cy.visit('app/observability-traces#/traces', {
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });
  });

  it('Renders empty state', () => {
    cy.contains(' (0)').should('exist');
    cy.contains('No matches').should('exist');
  });
});

describe('Testing traces table', () => {
  beforeEach(() => {
    cy.visit('app/observability-traces#/traces', {
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });
    setTimeFilter();
  });

  it('Renders the traces table', () => {
    cy.contains(' (108)').should('exist');
    cy.contains('03/25/2021 10:23:45').should('exist');
    cy.contains('03f9c770db5ee2f1caac0...').should('exist');
    cy.contains('224.99').should('exist');

    // test data contains output from data-prepper 0.8, which doesn't have fields denormalized
    // Trace Analytics should be able to handle the discrepancy if some fields cannot be parsed
    cy.contains('Invalid date').should('exist');
    cy.contains('-').should('exist');
  });

  it('Sorts the traces table', () => {
    cy.get('.euiTableRow').first().contains('-').should('exist');
    cy.get('.euiTableCellContent').contains('Trace group').click();
    cy.get('.euiTableRow').first().contains('/**').should('exist');
  });

  it('Searches correctly', () => {
    cy.get('input[type="search"]').focus().type(`${TRACE_ID}{enter}`);
    cy.get('.euiButton__text').contains('Refresh').click();
    cy.contains(' (1)').should('exist');
    cy.contains('03/25/2021 10:21:22').should('exist');
  });
});

describe('Testing trace view', () => {
  beforeEach(() => {
    cy.visit(`app/observability-traces#/traces`, {
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });
    setTimeFilter();
    cy.get('input[type="search"]').focus().type(`${TRACE_ID}`);
    cy.get('.euiButton__text').contains('Refresh').click();
    cy.get('.euiTableRow').should('have.length.lessThan', 3);//Replaces wait
    cy.get('[data-test-subj="trace-link"]').eq(0).click();
  });

  it('Renders the trace view', () => {
    cy.contains('43.75%').should('exist');
    cy.contains('42.58%').should('exist');
    cy.contains('03/25/2021 10:21:22').should('exist');
    cy.contains(TRACE_ID).should('exist');

    cy.get('div.js-plotly-plot').should('have.length.gte', 2);
    cy.get('text[data-unformatted="database <br>mysql.APM "]').should('exist');
    cy.contains(`"${SPAN_ID}"`).should('exist');
  });

  it('Has working breadcrumbs', () => {
    cy.get(`.euiBreadcrumb[href="#/traces/${TRACE_ID}"]`).click();
    cy.get('h2.euiTitle').contains(TRACE_ID).should('exist');
    cy.get('.euiBreadcrumb[href="#/traces"]').click();
    cy.get('.euiBreadcrumb[href="#/"]').click();
    cy.get('.euiBreadcrumb[href="observability-logs#/"]').click();
    cy.get('.euiTitle').contains('Logs').should('exist');
  });

  it('Renders data grid, flyout and filters', () => {
    cy.get('.euiButton__text[title="Span list"]').click({ force: true });
    cy.contains('2 columns hidden').should('exist');

    cy.get('.euiLink').contains(SPAN_ID).trigger('mouseover', { force: true });
    cy.get('button[data-datagrid-interactable="true"]').eq(0).click({ force: true });
    cy.get('button[data-datagrid-interactable="true"]').eq(0).click({ force: true }); // first click doesn't go through eui data grid

    cy.contains('Span detail').should('exist');
    cy.contains('Span attributes').should('exist');
    cy.get('.euiTextColor').contains('Span ID').trigger('mouseover');
    cy.get('.euiButtonIcon[aria-label="span-flyout-filter-icon"').click({ force: true });

    cy.get('.euiBadge__text').contains('spanId: ').should('exist');
    cy.contains('Spans (1)').should('exist');
  });
});

describe('Testing traces table', () => {
  beforeEach(() => {
    cy.visit('app/observability-traces#/traces', {
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });
    setTimeFilter();
  });

  it('Renders the traces table and verify Table Column, Pagination and Rows Data ', () => {
    cy.get('.euiTableCellContent__text').contains('Trace ID').should('exist');
    cy.get('.euiTableCellContent__text').contains('Trace group').should('exist');
    cy.get('.euiTableCellContent__text').contains('Duration (ms)').should('exist');
    cy.get('.euiTableCellContent__text').contains('Percentile in trace group').should('exist');
    cy.get('.euiTableCellContent__text').contains('Errors').should('exist');
    cy.get('.euiTableCellContent__text').contains('Last updated').should('exist');
    cy.get('[data-test-subj="pagination-button-next"]').click();
    cy.contains('client_pay_order').should('exist');
    cy.get('[data-test-subj="pagination-button-previous"]').click();
    cy.contains('224.99').should('exist');
    cy.get('.euiButtonEmpty').contains('5').click();
    cy.contains('690d3c7af1a78cf89c43e...').should('exist');
    cy.contains('5be8370207cbb002a165d...').click();
    cy.contains('client_create_order').should('exist');
    cy.get('path[style*="rgb(116, 146, 231)"]').should('exist');
    cy.go('back');
    cy.get('.euiButtonEmpty__text').contains('Rows per page').click();
    cy.get('.euiContextMenuItem__text').contains('15 rows').click();
    let expected_row_count=15;
    cy.get('.euiTable--auto')
    .find("tr")
    .then((row) => {
      let total=row.length-1;
      expect(total).to.equal(expected_row_count);
    });
  });
});

describe('Testing switch mode to jaeger', () => {
  beforeEach(() => {
    cy.visit('app/observability-traces#/traces', {
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });
    setTimeFilter();
    cy.get("[data-test-subj='indexPattern-switch-link']").click();
    cy.get("[data-test-subj='jaeger-mode']").click();
  });

  it('Verifies columns and data', () => {
    cy.contains('08ee9fd9bf964384').should('exist');
    cy.contains('0.012').should('exist');
    cy.contains('No').should('exist');
    cy.contains('01/24/2023 08:33:35').should('exist');
    cy.contains('Latency (ms)').should('exist');
    cy.contains('Trace ID').should('exist');
    cy.contains('Errors').should('exist');
    cy.contains('Last updated').should('exist');
  });

  it('Verifies Trace View', () => {
    cy.contains('08ee9fd9bf964384').click();
    cy.contains("Time spent by service").should('exist');
    cy.get("[data-test-subj='span-gantt-chart-panel']").should('exist');
  })
});
