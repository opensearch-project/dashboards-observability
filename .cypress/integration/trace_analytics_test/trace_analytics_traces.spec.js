/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

import {
  setTimeFilter,
  SPAN_ID,
  TRACE_ID,
  SPAN_ID_TREE_VIEW,
  INVALID_URL,
} from '../../utils/constants';

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
    cy.get("[data-test-subj='indexPattern-switch-link']").click();
    cy.get("[data-test-subj='data_prepper-mode']").click();
    setTimeFilter();
    cy.get('[data-test-subj="trace-table-mode-selector"]').click();
    cy.get('.euiSelectableListItem__content').contains('Traces').click();
  });

  it('Renders the traces table', () => {
    cy.get("[data-test-subj='trace-table-mode-selector']").contains('108').should('exist');
    cy.contains('Apr 20, 2021 @ 13:33:53.509').should('exist');
    cy.contains('d5bc99166e521eec173bcb7f9b0d3c43').should('exist');

    // test data contains output from data-prepper 0.8, which doesn't have fields denormalized
    // Trace Analytics should be able to handle the discrepancy if some fields cannot be parsed
    cy.contains('-').should('exist');
  });

  it('Sorts the traces table', () => {
    cy.get('.euiDataGridRowCell__expandFlex').contains('-').should('exist');
    cy.get('.euiDataGridHeaderCell__content').contains('Trace group').click();
    cy.get('.euiDataGridRowCell--lastColumn')
      .last()
      .contains('Apr 20, 2021 @ 13:33:51.191')
      .should('exist');
  });

  it('Searches correctly', () => {
    cy.get('input[type="search"]').first().focus().type(`${TRACE_ID}{enter}`);
    cy.get('[data-test-subj="superDatePickerApplyTimeButton"]').click();
    cy.get("[data-test-subj='trace-table-mode-selector']").contains('1').should('exist');
    cy.contains('147.77').should('exist');
    cy.contains('Mar 25, 2021 @ 10:21:22.896').should('exist');
  });
});

describe('Testing trace view', () => {
  beforeEach(() => {
    cy.visit(`app/observability-traces#/traces`, {
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });
    cy.get("[data-test-subj='indexPattern-switch-link']").click();
    cy.get("[data-test-subj='data_prepper-mode']").click();
    setTimeFilter();
    cy.get('input[type="search"]').first().focus().clear().type(`${TRACE_ID}`);
    cy.get('[data-test-subj="superDatePickerApplyTimeButton"]').click();
    cy.get('.euiTableRow').should('have.length.lessThan', 3); //Replaces wait
    cy.get('[data-test-subj="trace-table-mode-selector"]').click();
    cy.get('.euiSelectableListItem__content').contains('Traces').click();
    cy.get('.euiDataGridRowCell--firstColumn').eq(0).click();
  });

  after(() => {
    cy.visit(`app/observability-traces#/traces`, {
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });
    cy.get("[data-test-subj='indexPattern-switch-link']").click();
    cy.get("[data-test-subj='data_prepper-mode']").click();
    cy.get('input[type="search"]').first().focus().clear();
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
    cy.get('.euiBreadcrumb').contains(TRACE_ID).click();
    cy.get('.euiBreadcrumb').contains('Traces').click();
    cy.get('.euiBreadcrumb').contains('Trace analytics').click();
    cy.get('.euiBreadcrumb').contains('Observability').click();
    cy.get('.euiTitle').contains('Logs').should('exist');
  });

  it('Renders data grid, flyout and filters', () => {
    cy.get('.panel-title-count').contains('(11)').should('exist');
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

describe('Testing trace view invalid url', () => {
  beforeEach(() => {
    cy.visit(`app/observability-traces#/traces?traceId=${INVALID_URL}`, {
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });
  });

  it('Handles a invalid trace url', () => {
    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
    cy.contains(`${INVALID_URL}`).should('exist');
    cy.get('.euiCallOut.euiCallOut--danger')
      .should('exist')
      .within(() => {
        cy.get('.euiCallOutHeader__title').should(
          'contain.text',
          `Error loading Trace Id: ${INVALID_URL}`
        );
        cy.get('p').should(
          'contain.text',
          'The Trace Id is invalid or could not be found. Please check the URL or try again.'
        );
      });
  });
});

describe('Testing traces table', () => {
  beforeEach(() => {
    cy.visit('app/observability-traces#/traces', {
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });
    cy.get("[data-test-subj='indexPattern-switch-link']").click();
    cy.get("[data-test-subj='data_prepper-mode']").click();
    setTimeFilter();
    cy.get('[data-test-subj="trace-table-mode-selector"]').click();
    cy.get('.euiSelectableListItem__content').contains('Traces').click();
  });

  it('Renders the traces table and verify Table Column, Pagination and Rows Data ', () => {
    cy.get('.euiDataGridHeaderCell__content').contains('Trace Id').should('exist');
    cy.get('.euiDataGridHeaderCell__content').contains('Trace group').should('exist');
    cy.get('.euiDataGridHeaderCell__content').contains('Duration (ms)').should('exist');
    cy.get('.euiDataGridHeaderCell__content').contains('Percentile in trace group').should('exist');
    cy.get('.euiDataGridHeaderCell__content').contains('Errors').should('exist');
    cy.get('.euiDataGridHeaderCell__content').contains('Last updated').should('exist');
    cy.contains('client_pay_order').should('exist');
    cy.get('[data-test-subj="pagination-button-next"]').click();
    cy.contains('client_pay_order').should('not.exist');
    cy.get('[data-test-subj="pagination-button-previous"]').click();
    cy.get('.euiDataGridHeaderCell__content').contains('Last updated').click();
    cy.get('.euiListGroupItem__label').contains('Sort A-Z').click();
    cy.contains('56.88').should('exist');
  });
});

describe('Testing traces tree view', () => {
  beforeEach(() => {
    cy.visit('app/observability-traces#/traces', {
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });
    cy.get("[data-test-subj='indexPattern-switch-link']").click();
    cy.get("[data-test-subj='data_prepper-mode']").click();
    setTimeFilter();
    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
    cy.get('input[type="search"]')
      .first()
      .focus()
      .clear()
      .type(`02feb3a4f611abd81f2a53244d1278ae{enter}`);
    cy.get('[data-test-subj="superDatePickerApplyTimeButton"]').click();
    cy.get('.euiLink').contains('02feb3a4f611abd81f2a53244d1278ae').click();
    cy.get('h1.overview-content').contains('02feb3a4f611abd81f2a53244d1278ae').should('exist');
  });

  it('Verifies tree view and table toggle functionality with expand/collapse logic', () => {
    cy.get('.euiButtonGroup').contains('Tree view').click();
    cy.get('body').then(($body) => {
      if ($body.find('button[aria-label="remove current filter"]').length > 0) {
        cy.get('button[aria-label="remove current filter"]').click();
      }
    });
    cy.contains('Expand all').should('exist');
    cy.contains('Collapse all').should('exist');
    //Waiting time for render to complete
    cy.get("[data-test-subj='treeExpandAll']").click();
    cy.get("[data-test-subj='treeCollapseAll']").click();

    cy.get("[data-test-subj='spanId-flyout-button']")
      .should('have.length', 6)
      .then((initialSpanIds) => {
        const initialCount = initialSpanIds.length;
        expect(initialCount).to.equal(6);

        cy.get("[data-test-subj='treeExpandAll']").click();

        cy.get("[data-test-subj='spanId-flyout-button']").then((expandedSpanIds) => {
          const expandedCount = expandedSpanIds.length;
          expect(expandedCount).to.equal(10);
        });

        cy.get("[data-test-subj='treeCollapseAll']").click();

        cy.get("[data-test-subj='spanId-flyout-button']").then((collapsedSpanIds) => {
          const collapsedCount = collapsedSpanIds.length;
          expect(collapsedCount).to.equal(6); // Collapsed rows should match the initial count
        });
      });
  });

  it('Verifies tree view expand arrow functionality', () => {
    cy.get('.euiButtonGroup').contains('Tree view').click();
    cy.contains('Expand all').should('exist');
    cy.contains('Collapse all').should('exist');
    // Waiting time for render to complete
    cy.get("[data-test-subj='treeExpandAll']").click();
    cy.get("[data-test-subj='treeCollapseAll']").click();

    cy.get("[data-test-subj='spanId-flyout-button']").then((initialSpanIds) => {
      const initialCount = initialSpanIds.length;
      expect(initialCount).to.equal(6);

      // Find and click the first tree view expand arrow
      cy.get("[data-test-subj='treeViewExpandArrow']").first().click();

      // Check the number of Span IDs after expanding the arrow (should be 7)
      cy.get("[data-test-subj='spanId-flyout-button']").then((expandedSpanIds) => {
        const expandedCount = expandedSpanIds.length;
        expect(expandedCount).to.equal(7);
      });
    });
  });

  it('Verifies span flyout', () => {
    cy.get('.euiButtonGroup').contains('Tree view').click();
    cy.contains('Expand all').should('exist');
    cy.contains('Collapse all').should('exist');
    // Waiting time for render to complete
    cy.get("[data-test-subj='treeExpandAll']").click();
    cy.get("[data-test-subj='treeCollapseAll']").click();

    // Open flyout for a span
    cy.get("[data-test-subj='spanId-flyout-button']").contains(SPAN_ID_TREE_VIEW).click();
    cy.contains('Span detail').should('exist');
    cy.contains('Span attributes').should('exist');
  });

  it('Handles toggling between full screen and regular modes', () => {
    cy.get('.euiButtonGroup').contains('Tree view').click();
    cy.contains('Expand all').should('exist');
    cy.contains('Collapse all').should('exist');
    // Waiting time for render to complete
    cy.get("[data-test-subj='treeExpandAll']").click();
    cy.get("[data-test-subj='treeCollapseAll']").click();

    cy.get('[data-test-subj="fullScreenButton"]').click();
    cy.get('.euiButtonEmpty__text').should('contain.text', 'Exit full screen');
    cy.get('[data-test-subj="fullScreenButton"]').click();
    cy.get('.euiButtonEmpty__text').should('contain.text', 'Full screen');
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
    cy.get('input[type="search"]').first().focus().clear();
    cy.get('[data-test-subj="superDatePickerApplyTimeButton"]').click();
  });

  it('Verifies columns and data', () => {
    cy.contains('08ee9fd9bf964384').should('exist');
    cy.contains('0.012').should('exist');
    cy.contains('No').should('exist');
    cy.contains('01/24/2023 08:33:35').should('exist');
    cy.contains('Latency (ms)').should('exist');
    cy.contains('Trace Id').should('exist');
    cy.contains('Errors').should('exist');
    cy.contains('Last updated').should('exist');
  });

  it('Verifies Trace View', () => {
    cy.contains('08ee9fd9bf964384').should('exist');
    cy.contains('08ee9fd9bf964384').click();
    cy.contains('Time spent by service').should('exist');
    cy.get("[data-test-subj='span-gantt-chart-panel']").should('exist');
  });

  it('Checks tree view for specific traceId in Jaeger mode', () => {
    cy.contains('15b0b4004a651c4c').click();
    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');

    cy.get('.euiButtonGroup').contains('Tree view').click();
    cy.get("[data-test-subj='treeExpandAll']").should('exist');
    cy.get("[data-test-subj='treeCollapseAll']").should('exist');

    // Waiting time for render to complete
    cy.get("[data-test-subj='treeExpandAll']").click();
    cy.get("[data-test-subj='treeCollapseAll']").click();

    cy.get("[data-test-subj='treeViewExpandArrow']").should('have.length', 1);
    cy.get("[data-test-subj='treeExpandAll']").click();
    cy.get("[data-test-subj='treeViewExpandArrow']").should('have.length.greaterThan', 1);
  });
});

describe('Testing traces Custom source features', () => {
  beforeEach(() => {
    cy.visit('app/observability-traces#/traces', {
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });
    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
    cy.get("[data-test-subj='indexPattern-switch-link']").click();
    cy.get("[data-test-subj='data_prepper-mode']").click();
    setTimeFilter();
    cy.get('[data-test-subj="trace-table-mode-selector"]').click();
    cy.get('.euiSelectableListItem__content').contains('All Spans').click();
  });

  it('Renders the traces custom source all spans as default, clicks trace view redirection ', () => {
    cy.get('.euiDataGridHeaderCell__content').contains('Span Id').should('exist');
    cy.get('.euiDataGridHeaderCell__content').contains('Trace Id').should('exist');
    cy.get('.euiDataGridHeaderCell__content').contains('Parent Span Id').should('exist');
    cy.get('.euiDataGridHeaderCell__content').contains('Trace group').should('exist');
    cy.get('.euiDataGridHeaderCell__content').contains('Duration (ms)').should('exist');
    cy.get('.euiDataGridHeaderCell__content').contains('Errors').should('exist');
    cy.get('.euiDataGridHeaderCell__content').contains('Last updated').should('exist');

    cy.get('a.euiLink.euiLink--primary').first().click();
    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
    cy.get('.overview-content').should('contain.text', 'd5bc99166e521eec173bcb7f9b0d3c43');
  });

  it('Renders all spans column attributes as hidden, shows column when added', () => {
    cy.get('span.euiButtonEmpty__text').contains('60 columns hidden').should('exist');
    cy.get('span.euiButtonEmpty__text').contains('60 columns hidden').click();
    cy.get('button[name="span.attributes.http@url"]').click();
    cy.get('button[name="span.attributes.http@url"]').should('have.attr', 'aria-checked', 'true');
    cy.get('.euiDataGridHeaderCell__content').contains('span.attributes.http@url').should('exist');
  });

  it('Verifies column sorting and pagination works correctly', () => {
    cy.contains('Duration (ms)').click();
    cy.contains('Sort Z-A').click();

    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
    cy.contains('467.03 ms').should('exist');

    cy.get('[data-test-subj="pagination-button-next"]').click();
    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
    cy.contains('399.10 ms').should('exist');

    cy.get('[data-test-subj="pagination-button-previous"]').click();
    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
    cy.contains('467.03 ms').should('exist');
  });

  it('Renders the traces custom source traces, clicks trace view redirection', () => {
    cy.get('[data-test-subj="trace-table-mode-selector"]').click();
    cy.get('.euiSelectableListItem').contains('Traces').click();
    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');

    cy.get('.euiDataGridHeaderCell__content').contains('Trace Id').should('exist');
    cy.get('.euiDataGridHeaderCell__content').contains('Trace group').should('exist');
    cy.get('.euiDataGridHeaderCell__content').contains('Duration (ms)').should('exist');
    cy.get('.euiDataGridHeaderCell__content').contains('Percentile in trace group').should('exist');
    cy.get('.euiDataGridHeaderCell__content').contains('Errors').should('exist');
    cy.get('.euiDataGridHeaderCell__content').contains('Last updated').should('exist');

    cy.get('a.euiLink.euiLink--primary').first().click();
    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
    cy.get('.overview-content').should('contain.text', 'd5bc99166e521eec173bcb7f9b0d3c43');
  });
});
