/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

import {
  expandServiceView,
  SERVICE_NAME,
  SERVICE_SPAN_ID,
  setTimeFilter,
  verify_traces_spans_data_grid_cols_exists,
  count_table_row,
  AUTH_SERVICE_SPAN_ID,
  INVALID_URL,
} from '../../utils/constants';
import { suppressResizeObserverIssue } from '../../utils/constants';

suppressResizeObserverIssue(); //needs to be in file once

describe('Testing services table empty state', () => {
  beforeEach(() => {
    cy.visit('app/observability-traces#/services', {
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

describe('Testing services table', () => {
  beforeEach(() => {
    cy.visit('app/observability-traces#/services', {
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });
    cy.get("[data-test-subj='indexPattern-switch-link']").click();
    cy.get("[data-test-subj='data_prepper-mode']").click();
    setTimeFilter();
  });

  it('Renders the services table', () => {
    cy.contains(' (8)').should('exist');
    cy.contains('analytics-service, frontend-client, recommendation').should('exist');
    cy.contains('186.95').should('exist');
    cy.contains('14.29%').should('exist');
  });

  it('Searches correctly', () => {
    cy.get('input[type="search"]').first().focus().type(`${SERVICE_NAME}{enter}`);
    cy.get('[data-test-subj="superDatePickerApplyTimeButton"]').click();
    cy.contains(' (1)').should('exist');
    cy.contains('3.57%').should('exist');

    cy.get('[data-test-subj="search-bar-input-box"]').should('be.visible').clear();
    cy.get('[data-test-subj="superDatePickerApplyTimeButton"]').should('be.visible').click();
    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
  });

  it('Verify columns in Services table', () => {
    cy.get('.euiFlexItem.euiFlexItem--flexGrowZero .panel-title')
      .contains('Services')
      .should('exist');
    cy.get('.euiTableCellContent__text[title="Name"]').should('exist');
    cy.get('.euiTableCellContent__text[title="Average duration (ms)"]').should('exist');
    cy.get('.euiTableCellContent__text[title="Error rate"]').should('exist');
    cy.get('.euiTableCellContent__text[title="Request rate"]').should('exist');
    cy.get('.euiTableCellContent__text[title="No. of connected services"]').should('exist');
    cy.get('.euiTableCellContent__text[title="Connected services"]').should('exist');
    cy.get('.euiTableCellContent__text[title="Traces"]').should('exist');
    cy.get('[data-test-subj="tablePaginationPopoverButton"]').click();
    cy.get('.euiIcon.euiIcon--medium.euiIcon--inherit.euiContextMenu__icon')
      .eq(0)
      .should('exist')
      .click();
    cy.get('[data-test-subj="pagination-button-next"]').should('exist').click();
    cy.get('.euiLink.euiLink--primary').contains('order').should('exist');
  });

  it('Navigate from Services to Traces', () => {
    cy.get('.euiTableCellContent__text[title="Traces"]').should('exist');
    cy.contains('74').should('exist');
    cy.get('[data-test-subj^="service-traces-redirection-btntrace_service_"]').first().click();
    cy.get('.euiText.euiText--medium .panel-title').should('exist');
    cy.get('.euiBadge__childButton[data-test-subj="filterBadge"]').should('exist');
    cy.get('button[aria-label="Remove filter"]').should('be.visible').first().click();
  });
});

describe('Testing service view empty state and invalid url', () => {
  it('Renders service view empty state and invalid url', () => {
    cy.visit(`app/observability-traces#/services?serviceId=${SERVICE_NAME}`, {
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });
    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
    cy.contains('frontend-client').should('exist');
    cy.contains('No matches').should('exist');

    // Renders service view invalid url state
    cy.visit(`app/observability-traces#/services?serviceId=${INVALID_URL}`, {
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });
    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
    cy.contains(`${INVALID_URL}`).should('exist');
    cy.get('.euiCallOut.euiCallOut--danger')
      .should('exist')
      .within(() => {
        cy.get('.euiCallOutHeader__title').should(
          'contain.text',
          `Error loading service: ${INVALID_URL}`
        );
        cy.get('p').should(
          'contain.text',
          'The service name is invalid or could not be found. Please check the URL or try again.'
        );
      });
    cy.contains('No matches').should('exist');
  });
});

describe('Testing service view', () => {
  beforeEach(() => {
    cy.visit(`app/observability-traces#/services`, {
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });
    cy.get("[data-test-subj='indexPattern-switch-link']").click();
    cy.get("[data-test-subj='data_prepper-mode']").click();
    setTimeFilter();
    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
    cy.get('input[type="search"]').first().focus().clear();
    cy.get('input[type="search"]').first().focus().type(`${SERVICE_NAME}`);
    cy.get('[data-test-subj="superDatePickerApplyTimeButton"]').click();
    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
    expandServiceView(0);
  });

  after(() => {
    cy.visit(`app/observability-traces#/services`, {
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });
    cy.get('[data-test-subj="search-bar-input-box"]').should('be.visible').clear();
    cy.get('[data-test-subj="superDatePickerApplyTimeButton"]').should('be.visible').click();
  });

  it('Renders service view', () => {
    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
    cy.get('h1.overview-content').contains(SERVICE_NAME).should('exist');
    cy.contains('178.6').should('exist');
    cy.contains('3.57%').should('exist');
    cy.get('div.vis-network').should('exist');
  });

  it('Renders spans data grid, flyout, filters', () => {
    cy.get("[data-test-subj='spanId-link']")
      .contains(SERVICE_SPAN_ID)
      .trigger('mouseover', { force: true });
    cy.get('button[data-datagrid-interactable="true"]').eq(0).click({ force: true });
    cy.contains('Span detail').should('exist');
    cy.contains('Span attributes').should('exist');
    cy.get('.euiTextColor').contains('Span ID').trigger('mouseover');
    cy.get('.euiButtonIcon[aria-label="span-flyout-filter-icon"').click({ force: true });
    cy.get('.euiBadge__text').contains('spanId: ').should('exist');
    cy.get('[data-test-subj="euiFlyoutCloseButton"]').click({ force: true });
    cy.contains('Spans (1)').should('exist');
  });

  it('Has working breadcrumbs', () => {
    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
    cy.get('.euiBreadcrumb').contains(SERVICE_NAME).click();
    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
    cy.get('h1.overview-content').contains(SERVICE_NAME).should('exist');
    cy.get('.euiBreadcrumb').contains('Services').click();
    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
    cy.get('[data-test-subj="breadcrumb last"]').contains('Services').should('exist');

    cy.get('.euiBreadcrumb').contains('Trace analytics').click();
    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
    cy.get('[data-test-subj="breadcrumb last"]').contains('Traces').should('exist');

    cy.get('.euiBreadcrumb').contains('Observability').click();
    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
    cy.get('.euiTitle').contains('Logs').should('exist');
  });
});

describe('Testing Service map', () => {
  beforeEach(() => {
    cy.visit('app/observability-traces#/services', {
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });
    cy.get("[data-test-subj='indexPattern-switch-link']").click();
    cy.get("[data-test-subj='data_prepper-mode']").click();
    setTimeFilter();
    cy.get('.euiTableRow').should('have.length.greaterThan', 7); //Replaces wait
  });

  it('Render Service map', () => {
    cy.get('.euiText.euiText--medium .panel-title').contains('Service map');
    cy.get('[data-test-subj="latency"]').should('exist');
    cy.get('.ytitle').contains('Average duration (ms)');
    cy.get('[data-text = "Errors"]').click();
    cy.contains('60%');
    cy.get('[data-text = "Duration"]').click();
    cy.contains('100');
    cy.get('.euiFormLabel.euiFormControlLayout__prepend').contains('Focus on').should('exist');
  });

  it('Render the vis-network div and canvas', () => {
    // Check the view where ServiceMap component is rendered
    cy.get('.euiText.euiText--medium .panel-title').contains('Service map');
    cy.get('.vis-network').should('exist');
    cy.get('.vis-network canvas').should('exist');

    // Check the canvas is not empty
    cy.get('.vis-network canvas')
      .should('have.attr', 'style')
      .and('include', 'position: relative')
      .and('include', 'touch-action: none')
      .and('include', 'user-select: none')
      .and('include', 'width: 100%')
      .and('include', 'height: 100%');

    cy.get('.vis-network canvas').should('have.attr', 'width').and('not.eq', '0');
    cy.get('.vis-network canvas').should('have.attr', 'height').and('not.eq', '0');
  });

  it('Click on a node to see the details', () => {
    cy.get('.euiText.euiText--medium .panel-title').contains('Service map');
    cy.get('.vis-network canvas').should('exist');

    // ensure rendering is complete before node click, replace wait
    cy.get('[data-text="Errors"]').click();
    cy.contains('60%');
    cy.get('[data-text="Duration"]').click();
    cy.contains('Average duration (ms)');
    cy.get("[data-test-subj='tableHeaderCell_average_latency_1']").click();

    // clicks on payment node
    cy.get('.vis-network canvas').click(707, 388);
    // checks the duration in node details popover
    cy.get('.euiText.euiText--small').contains('Average duration: 216.43ms').should('exist');
  });

  it('Tests focus functionality in Service map', () => {
    cy.get('.euiText.euiText--medium .panel-title').contains('Service map');
    cy.get('[data-test-subj="latency"]').should('exist');
    cy.get('.ytitle').contains('Average duration (ms)');

    // Test metric selection functionality
    cy.get('[data-text="Errors"]').click();
    cy.contains('60%');
    cy.get('[data-text="Duration"]').click();
    cy.contains('100');

    // Focus on "order" by selecting the first option
    cy.get('.euiFormLabel.euiFormControlLayout__prepend').contains('Focus on').should('exist');
    cy.get('[placeholder="Service name"]').click();
    cy.get('.euiSelectableList__list li').eq(0).click();

    // Verify the service map updates and focus is applied
    cy.get('.euiFormLabel.euiFormControlLayout__prepend').contains('Focus on').should('exist');
    cy.get('[placeholder="order"]').click();
    cy.get('.euiSelectableList__list li').should('have.length', 4); // Focused view with 4 options

    // Refresh to reset the focus
    cy.get('[data-test-subj="serviceMapRefreshButton"]').click();

    // Verify the service map is reset to the original state
    cy.get('[placeholder="Service name"]').should('have.value', '');
    cy.get('.euiSelectableList__list li').should('have.length', 8); // Original 8 options
  });
});

describe('Testing traces Spans table verify table headers functionality', () => {
  beforeEach(() => {
    cy.visit('app/observability-traces#/services', {
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });
    cy.get("[data-test-subj='indexPattern-switch-link']").click();
    cy.get("[data-test-subj='data_prepper-mode']").click();
    setTimeFilter();
  });

  it('Renders the spans table and verify columns headers', () => {
    cy.contains(' (8)').should('exist');
    cy.contains('analytics-service, frontend-client, recommendation').should('exist');
    cy.get('.euiLink.euiLink--primary').contains('authentication').should('exist');
    expandServiceView(1);
    cy.get('body').then(($body) => {
      if ($body.find('button[aria-label="remove current filter"]').length > 0) {
        cy.get('button[aria-label="remove current filter"]').click();
      }
    });
    cy.get('.panel-title').contains('Spans').should('exist');
    cy.get('.panel-title-count').contains('8').should('exist');
    verify_traces_spans_data_grid_cols_exists();
  });

  it('Toggle columns and verify the columns hidden text verify rows', () => {
    cy.get('.euiLink.euiLink--primary').contains('authentication').should('exist');
    expandServiceView(1);
    cy.get('[data-test-subj = "dataGridColumnSelectorButton"]').click({ force: true });
    cy.get('.panel-title-count').contains('8').should('exist');
    cy.get('.euiSwitch.euiSwitch--compressed.euiSwitch--mini .euiSwitch__button').eq(3).click();
    cy.get('[data-test-subj = "dataGridColumnSelectorButton"]')
      .click()
      .should('have.text', '2 columns hidden');
    count_table_row(8);
  });

  it('Show all button Spans table', () => {
    cy.get('.euiLink.euiLink--primary').contains('authentication').should('exist');
    expandServiceView(1);
    cy.get('[data-test-subj = "dataGridColumnSelectorButton"]').click();
    cy.get('.euiPopoverFooter .euiFlexItem.euiFlexItem--flexGrowZero')
      .eq(0)
      .should('have.text', 'Show all')
      .click();
    cy.get('.euiDataGrid__focusWrap').click().should('exist');
    verify_traces_spans_data_grid_cols_exists();
  });

  it('Hide all button Spans table', () => {
    cy.get('.euiLink.euiLink--primary').contains('authentication').should('exist');
    expandServiceView(1);
    cy.get('.euiTableRow').should('have.length.lessThan', 2); //Replace wait
    cy.get('[data-test-subj = "dataGridColumnSelectorButton"]').click();
    cy.get('.euiPopoverFooter .euiFlexItem.euiFlexItem--flexGrowZero')
      .eq(1)
      .should('have.text', 'Hide all')
      .click();
    cy.get('.euiDataGrid__focusWrap').click().should('exist');
    cy.get('[data-test-subj="dataGridColumnSelectorPopover"]').should(
      'have.text',
      '10 columns hidden'
    );
  });

  it('Render Spans table and change data table Density', () => {
    cy.get('.euiLink.euiLink--primary').contains('authentication').should('exist');
    expandServiceView(1);
    verify_traces_spans_data_grid_cols_exists();
    cy.get('[data-test-subj="service-dep-table"]').should('exist');
    cy.get('.euiButtonEmpty__text').contains('Density').click();
    cy.contains('.euiButtonContent', 'Compact density').find('.euiButtonContent__icon').click();
    cy.contains('.euiButtonContent', 'Normal density').find('.euiButtonContent__icon').click();
    cy.contains('.euiButtonContent', 'Expanded density').find('.euiButtonContent__icon').click();
  });

  it('Render Spans table and and click on sort', () => {
    cy.get('.euiLink.euiLink--primary').contains('authentication').should('exist');
    expandServiceView(1);
    verify_traces_spans_data_grid_cols_exists();
    cy.get('[data-test-subj="service-dep-table"]').should('exist');
    cy.get('[data-test-subj="dataGridColumnSortingButton"]')
      .contains('Sort fields')
      .should('exist')
      .click();
    cy.get('[data-test-subj="dataGridColumnSortingPopoverColumnSelection"]').click();
    cy.get('[data-test-subj="dataGridColumnSortingPopoverColumnSelection-durationInNanos').click();
    cy.get('[data-test-subj="dataGridColumnSortingButton"]').should('have.text', '1 fields sorted');
    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
    cy.get('[data-test-subj="dataGridHeaderCell-durationInNanos"]').should(
      'have.attr',
      'aria-sort',
      'ascending'
    );
    cy.get('button.euiLink.euiLink--primary').eq(5).contains('96e7fdedd82ab53c').click();
  });
});

describe('Testing traces Spans table and verify columns functionality', () => {
  beforeEach(() => {
    cy.visit('app/observability-traces#/services', {
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });
    cy.get("[data-test-subj='indexPattern-switch-link']").click();
    cy.get("[data-test-subj='data_prepper-mode']").click();
    setTimeFilter();
  });

  it('Renders the spans table and click on first span to verify details', () => {
    cy.get('.euiLink.euiLink--primary').contains('authentication').should('exist');
    expandServiceView(1);
    verify_traces_spans_data_grid_cols_exists();
    cy.contains(AUTH_SERVICE_SPAN_ID).click();
    cy.get('[data-test-subj="spanDetailFlyout"]').contains('Span detail').should('exist');
    cy.get('.euiFlyoutBody .panel-title').contains('Overview').should('exist');
    cy.get('.euiTextColor.euiTextColor--subdued').contains('Span ID').should('exist');
    cy.get('[data-test-subj="parentSpanId"]').contains('d03fecfa0f55b77c').should('exist');
    cy.get('.euiFlyoutBody__overflowContent .panel-title')
      .contains('Span attributes')
      .should('exist');
    cy.get('.euiDescriptionList__description .euiFlexItem').eq(0).trigger('mouseover').click();
    cy.get('[aria-label="span-flyout-filter-icon"]').click();
    cy.get('.euiFlyout__closeButton.euiFlyout__closeButton--inside').click();
    cy.get('.euiBadge__content .euiBadge__text')
      .contains('spanId: 277a5934acf55dcf')
      .should('exist');
    count_table_row(1);
    cy.get('[aria-label="remove current filter"]').click();
    verify_traces_spans_data_grid_cols_exists();
    cy.contains('277a5934acf55dcf').should('exist');
    cy.get('.panel-title-count').contains('8').should('exist');
    count_table_row(8);
  });

  it('Render Spans table and verify Column functionality', () => {
    cy.get('.euiLink.euiLink--primary').contains('authentication').should('exist');
    expandServiceView(1);
    verify_traces_spans_data_grid_cols_exists();
    cy.get('[data-test-subj="service-dep-table"]').should('exist');
    cy.get('.euiDataGridHeaderCell__content').contains('Span Id').click();
    cy.get('.euiListGroupItem__label').contains('Hide column').click();
    cy.get('.euiDataGridHeaderCell__content').contains('Trace Id').click();
    cy.get('.euiListGroupItem__label').contains('Sort A-Z').click();
    cy.get('.euiDataGridHeaderCell__content').contains('Trace group').click();
    cy.get('.euiListGroupItem__label').contains('Move left').click();
  });
});

describe('Testing navigation from Services to Traces', () => {
  beforeEach(() => {
    cy.visit('app/observability-traces#/services', {
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });

    cy.get("[data-test-subj='indexPattern-switch-link']").click();
    cy.get("[data-test-subj='data_prepper-mode']").click();
    setTimeFilter();
  });

  it('Clicks on the "Traces" shortcut to redirect', () => {
    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
    cy.contains('74').should('exist');
    cy.get('[data-test-subj^="service-traces-redirection-btntrace_service_"]').first().click();
    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');

    cy.get('[data-test-subj="filterBadge"]')
      .should('exist')
      .contains('serviceName: analytics-service');
    cy.get('[data-test-subj="trace-table-mode-selector"]').click();
    cy.get('.euiSelectableListItem__content').contains('Traces').click();
    cy.get('.euiLink--primary').contains('e447ed617aa651a7593c720d7e976625').should('exist');
  });

  it('Opens service flyout, clicks Actions, and selects View Traces', () => {
    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');
    cy.get('[data-test-subj*="service-flyout-action-btntrace_service"]')
      .should('exist')
      .first()
      .click();

    cy.get('[data-test-subj="service-view-traces-redirection-btn"]').click();
    cy.get('[data-test-subj="globalLoadingIndicator"]').should('not.exist');

    cy.get('[data-test-subj="filterBadge"]')
      .should('exist')
      .contains('serviceName: analytics-service');
    cy.get('[data-test-subj="trace-table-mode-selector"]').click();
    cy.get('.euiSelectableListItem__content').contains('Traces').click();
    cy.get('.euiLink--primary').contains('e447ed617aa651a7593c720d7e976625').should('exist');
    cy.get('button[aria-label="Remove filter"]').should('be.visible').first().click();
  });
});

describe('Testing switch mode to jaeger', () => {
  beforeEach(() => {
    cy.visit('app/observability-traces#/services', {
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });
    setTimeFilter();
    cy.get("[data-test-subj='indexPattern-switch-link']").click();
    cy.get("[data-test-subj='jaeger-mode']").click();
    //cy.get('.euiButtonEmpty__text').should('contain', 'Jaeger');
  });

  it('Verifies columns and data', () => {
    cy.contains('customer').should('exist');
    cy.contains('310.29').should('exist');
    cy.contains('0%').should('exist');
    cy.contains('Name').should('exist');
    cy.contains('Average duration (ms)').should('exist');
    cy.contains('Error rate').should('exist');
    cy.contains('Request rate').should('exist');
    cy.contains('Traces').should('exist');
  });

  it('Verifies traces links to traces page with filter applied', () => {
    cy.get('.euiTableRow').should('have.length.lessThan', 7); //Replaces Wait
    cy.contains('7').should('exist');
    cy.get('[data-test-subj^="service-traces-redirection-btntrace_"]').first().click();
    cy.contains(' (7)').should('exist');
    cy.get("[data-test-subj='filterBadge']").eq(0).contains('process.serviceName: customer');
  });
});
