/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

import { testDataSet, delay, setTimeFilter, jaegerTestDataSet } from '../utils/constants';
import { suppressResizeObserverIssue } from '../utils/constants';

suppressResizeObserverIssue();//needs to be in file once

describe('Dump test data', () => {
  it('Indexes test data', () => {
    const dumpDataSet = (mapping_url, data_url, index) => {
      cy.request({
        method: 'POST',
        failOnStatusCode: false,
        url: 'api/console/proxy',
        headers: {
          'content-type': 'application/json;charset=UTF-8',
          'osd-xsrf': true,
        },
        qs: {
          path: `${index}`,
          method: 'PUT',
        },
      });

      cy.request(mapping_url).then((response) => {
        cy.request({
          method: 'POST',
          //form: true,
          url: 'api/console/proxy',
          headers: {
            'content-type': 'application/json;charset=UTF-8',
            'osd-xsrf': true,
          },
          qs: {
            path: `${index}/_mapping`,
            method: 'POST',
          },
          body: response.body,
        });
      });

      cy.request(data_url).then((response) => {
        cy.request({
          method: 'POST',
          //form: true,
          url: 'api/console/proxy',
          headers: {
            'content-type': 'application/json;charset=UTF-8',
            'osd-xsrf': true,
          },
          qs: {
            path: `${index}/_bulk`,
            method: 'POST',
          },
          body: response.body,
        });
      });
    };

    testDataSet.forEach(({ mapping_url, data_url, index }) =>
      dumpDataSet(mapping_url, data_url, index)
    );
  });
});

describe('Testing dashboard table empty state', () => {
  beforeEach(() => {
    cy.visit('app/observability-traces#/', {
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

describe('Testing dashboard table', () => {
  beforeEach(() => {
    cy.visit('app/observability-traces#/', {
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });
    setTimeFilter();
    cy.get('[data-test-subj="trace-groups-service-operation-accordian"]').click();
  });

  it('Renders the dashboard table', () => {
    cy.contains(' (10)').should('exist');
    cy.contains('client_cancel_order').should('exist');
    cy.contains('166.44').should('exist');
    cy.contains('7.14%').should('exist');
  });

  it('Adds the percentile filters', () => {
    cy.contains(' >= 95 percentile').click({ force: true });
    cy.contains(' >= 95 percentile').click({ force: true });

    cy.contains('Latency percentile within trace group: >= 95th').should('exist');
    cy.contains(' (7)').should('exist');
    cy.contains('318.69').should('exist');

    cy.contains(' < 95 percentile').click({ force: true });
    cy.contains(' < 95 percentile').click({ force: true });

    cy.contains('Latency percentile within trace group: < 95th').should('exist');
    cy.contains(' (8)').should('exist');
    cy.contains('383.05').should('exist');
  });

  it('Opens latency trend popover', () => {
    setTimeFilter(true);
    cy.get('.euiButtonIcon[aria-label="Open popover"]').first().click();
    cy.get('text.ytitle[data-unformatted="Hourly latency (ms)"]').should('exist');
  });

  it('Redirects to traces table with filter', () => {
    cy.get('.euiLink').contains('13').click();

    cy.contains(' (13)').should('exist');
    cy.contains('client_create_order').should('exist');

    cy.get('.euiSideNavItemButton__label').contains('Trace analytics').click();

    cy.contains('client_create_order').should('exist');
  });
});

describe('Testing plots', () => {
  beforeEach(() => {
    cy.visit('app/observability-traces#/', {
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });
    setTimeFilter();
    cy.get('[data-test-subj="trace-groups-service-operation-accordian"]').click();
  });

  it('Renders service map', () => {
    // plotly scale texts are in attribute "data-unformatted"
    cy.get('text.ytitle[data-unformatted="Average duration (ms)"]').should('exist');
    cy.get('text[data-unformatted="200"]').should('exist');
    cy.get('.vis-network').should('exist');

    cy.get('.euiButton__text[title="Errors"]').click();
    cy.get('text.ytitle[data-unformatted="Error rate (%)"]').should('exist');

    cy.get('.euiButton__text[title="Request Rate"]').click();
    cy.get('text.ytitle[data-unformatted="Request rate (spans)"]').should('exist');
    cy.get('text[data-unformatted="50"]').should('exist');

    cy.get('input[type="search"]').eq(1).focus().type('payment{enter}');
  });

  it('Renders plots', () => {
    cy.get('text.ytitle[data-unformatted="Error rate (%)"]').should('exist');
    cy.get('text.annotation-text[data-unformatted="Now: 14.81%"]').should('exist');
    cy.get('text.ytitle[data-unformatted="Throughput (n)"]').should('exist');
    cy.get('text.annotation-text[data-unformatted="Now: 108"]').should('exist');
  });
});

describe('Latency by trace group table', () =>{
  beforeEach(() => {
    cy.visit('app/observability-traces#/', {
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });
    setTimeFilter();
    cy.get('[data-test-subj="trace-groups-service-operation-accordian"]').click();
  });

  it('Verify columns in Latency by trace group table along with pagination functionality', () => {
    cy.get('span.panel-title').eq(0).should('exist');
    cy.get('[data-test-subj="tableHeaderCell_dashboard_trace_group_name_0"]').should('exist');
    cy.get('[data-test-subj="tableHeaderCell_dashboard_latency_variance_1"]').should('exist');
    cy.get('[data-test-subj="tableHeaderCell_dashboard_average_latency_2"]').should('exist');
    cy.get('[data-test-subj="tableHeaderCell_24_hour_latency_trend_3"]').should('exist');
    cy.get('[data-test-subj="tableHeaderCell_dashboard_error_rate_4"]').should('exist');
    cy.get('[data-test-subj="tableHeaderCell_dashboard_traces_5"]').should('exist');
    cy.get('[data-test-subj="tablePaginationPopoverButton"]').eq(1).click();
    cy.get('.euiIcon.euiIcon--medium.euiIcon--inherit.euiContextMenu__icon').eq(0).should('exist').click();
    cy.get('[data-test-subj="pagination-button-next"]').eq(1).should('exist').click();
    cy.get('button[data-test-subj="dashboard-table-trace-group-name-button"]').contains('mysql').should('exist');
  });

  it('Sorts the Latency by trace group table', () => {
    cy.get('span[title*="Trace group name"]').click();
    cy.get('[data-test-subj="dashboard-table-trace-group-name-button"]').eq(0).contains('/**').should('exist');
  });

  it('Verify tooltips in Latency by trace group table', () => {
    cy.get('.euiIcon.euiIcon--small.euiIcon--subdued.eui-alignTop').eq(0).trigger('mouseover');
    cy.contains('Traces of all requests that share a common API and operation at the start of distributed tracing instrumentation.').should('be.visible');
    cy.get('.euiIcon.euiIcon--small.euiIcon--subdued.eui-alignTop').eq(1).trigger('mouseover');
    cy.contains('Range of latencies for traces within a trace group in the selected time range.').should('be.visible');
    cy.get('.euiIcon.euiIcon--small.euiIcon--subdued.eui-alignTop').eq(2).trigger('mouseover');
    cy.contains('Average latency of traces within a trace group in the selected time range.').should('be.visible');
    cy.get('.euiIcon.euiIcon--small.euiIcon--subdued.eui-alignTop').eq(3).trigger('mouseover');
    cy.contains('24 hour time series view of hourly average, hourly percentile, and hourly range of latency for traces within a trace group.').should('be.visible');
    cy.get('.euiIcon.euiIcon--small.euiIcon--subdued.eui-alignTop').eq(4).trigger('mouseover');
    cy.contains('Error rate based on count of trace errors within a trace group in the selected time range.').should('be.visible');
    cy.get('.euiIcon.euiIcon--small.euiIcon--subdued.eui-alignTop').eq(5).trigger('mouseover');
    cy.contains('Count of traces with unique trace identifiers in the selected time range.').should('be.visible');
  });

  it('Verify Search engine on Trace dashboard', () => {
    cy.get('.euiFieldSearch.euiFieldSearch--fullWidth').click().type('client_pay_order');
    cy.get('[data-test-subj="superDatePickerApplyTimeButton"]').click();
    cy.wait(delay);//Fails without
    cy.get('.euiTableCellContent.euiTableCellContent--alignRight.euiTableCellContent--overflowingContent').contains('211.04').should('exist');
    cy.get('button[data-test-subj="dashboard-table-trace-group-name-button"]').eq(0).click();
    cy.get('.euiBadge.euiBadge--hollow.euiBadge--iconRight.globalFilterItem').click();
    cy.get('.euiIcon.euiIcon--medium.euiContextMenu__arrow').click();
    cy.get('.euiContextMenuPanelTitle').contains('Edit filter').should('exist');
    cy.get('.euiButton.euiButton--primary.euiButton--fill').click();
    cy.get('.euiBadge.euiBadge--hollow.euiBadge--iconRight.globalFilterItem').click();
    cy.get('.euiContextMenuItem__text').eq(1).contains('Exclude results').click();
    cy.get('.euiTextColor.euiTextColor--danger').should('exist');
    cy.get('.euiBadge.euiBadge--hollow.euiBadge--iconRight.globalFilterItem').click();
    cy.get('.euiContextMenuItem__text').eq(1).contains('Include results').click();
    cy.get('.euiBadge.euiBadge--hollow.euiBadge--iconRight.globalFilterItem').click();
    cy.get('.euiContextMenuItem__text').eq(2).contains('Temporarily disable').click();
    cy.get('.euiBadge.euiBadge--iconRight.globalFilterItem.globalFilterItem-isDisabled').should('exist').click();
    cy.get('.euiContextMenuItem__text').eq(2).contains('Re-enable').click();
    cy.get('.euiBadge.euiBadge--hollow.euiBadge--iconRight.globalFilterItem').click();
    cy.get('.euiContextMenuItem__text').eq(3).contains('Delete').click();
  });
});

describe('Testing filters on trace analytics page', { scrollBehavior: false }, () =>{
  beforeEach(() => {
    cy.visit('app/observability-traces#/', {
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });
    setTimeFilter();
  });

  it('Verify Change all filters', () =>{
    cy.wait(delay);//Needed after removing waits from setTimeFilter()
    cy.get('[data-test-subj="global-filter-button"]').click();
    cy.get('.euiContextMenuPanelTitle').contains('Change all filters').should('exist');
    cy.get('.euiContextMenuItem__text').eq(0).contains('Enable all');
    cy.get('.euiContextMenuItem__text').eq(1).contains('Disable all');
    cy.get('.euiContextMenuItem__text').eq(2).contains('Invert inclusion');
    cy.get('.euiContextMenuItem__text').eq(3).contains('Invert enabled/disabled');
    cy.get('.euiContextMenuItem__text').eq(4).contains('Remove all');
  })

  it('Verify Add filter section', () => {
    cy.wait(delay);//Needed after removing waits from setTimeFilter()
    cy.get('[data-test-subj="addfilter"]').contains('+ Add filter').click();
    cy.get('.euiPopoverTitle').contains('Add filter').should('exist');
    cy.wait(delay);//drop down won't open without
    cy.get('.euiComboBox__inputWrap.euiComboBox__inputWrap--noWrap').eq(0).trigger('mouseover').click();
    cy.get('.euiComboBoxOption__content').eq(1).click();
    cy.get('.euiComboBox__inputWrap.euiComboBox__inputWrap--noWrap').eq(1).trigger('mouseover').click();
    cy.get('.euiComboBoxOption__content').eq(2).click();
    cy.get('.euiButton.euiButton--primary.euiButton--fill').contains('Save').click();
    cy.get('.euiBadge__content').should('exist').click();
    cy.get('.euiIcon.euiIcon--medium.euiContextMenu__arrow').click();
    cy.get('[data-test-subj="filter-popover-cancel-button"]').contains('Cancel').click();
    cy.get('.euiIcon.euiIcon--small.euiIcon--inherit.euiBadge__icon').click();
  })
});

describe('Dump jaeger test data', () => {
  it('Indexes test data', () => {
    const dumpDataSet = (mapping_url, data_url, index) => {
      cy.request({
        method: 'POST',
        failOnStatusCode: false,
        url: 'api/console/proxy',
        headers: {
          'content-type': 'application/json;charset=UTF-8',
          'osd-xsrf': true,
        },
        qs: {
          path: `${index}`,
          method: 'PUT',
        },
      });

      cy.request(mapping_url).then((response) => {
        cy.request({
          method: 'POST',
          //form: true,
          url: 'api/console/proxy',
          headers: {
            'content-type': 'application/json;charset=UTF-8',
            'osd-xsrf': true,
          },
          qs: {
            path: `${index}/_mapping`,
            method: 'POST',
          },
          body: response.body,
        });
      });

      cy.request(data_url).then((response) => {
        cy.request({
          method: 'POST',
          //form: true,
          url: 'api/console/proxy',
          headers: {
            'content-type': 'application/json;charset=UTF-8',
            'osd-xsrf': true,
          },
          qs: {
            path: `${index}/_bulk`,
            method: 'POST',
          },
          body: response.body,
        });
      });
    };

    jaegerTestDataSet.forEach(({ mapping_url, data_url, index }) =>
      dumpDataSet(mapping_url, data_url, index)
    );
  });
});

describe('Testing switch mode to jaeger', () => {
  beforeEach(() => {
    cy.visit('app/observability-traces#/', {
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });
    setTimeFilter();
    cy.get("[data-test-subj='indexPattern-switch-link']").click();
    cy.get("[data-test-subj='jaeger-mode']").click();
    cy.get('[data-test-subj="trace-groups-service-operation-accordian"]').click();
  });

  it('Verifies errors mode columns and data', () => {
    cy.contains('redis,GetDriver').should('exist');
    cy.contains('14.7').should('exist');
    cy.contains('100%').should('exist');
    cy.contains('7').should('exist');
    cy.contains('Service and Operation Name').should('exist');
    cy.contains('Average duration (ms)').should('exist');
    cy.contains('Error rate').should('exist');
    cy.contains('Traces').should('exist');
  });

  it('Verifies traces links to traces page', () => {
    cy.get('[data-test-subj="dashboard-table-traces-button"]').contains('7').click();

    cy.contains(' (7)').should('exist');
    cy.get("[data-test-subj='filterBadge']").eq(0).contains('process.serviceName: redis')
    cy.get("[data-test-subj='filterBadge']").eq(1).contains('operationName: GetDriver');  
  })

  it('Switches to throughput mode and verifies columns and data', () => {
    cy.get("[data-test-subj='throughput-toggle']").click();
    cy.contains('frontend,HTTP GET /dispatch').should('exist');
    cy.contains('711.38').should('exist');
    cy.contains('0%').should('exist');
    cy.contains('8').should('exist');
    cy.contains('Service and Operation Name').should('exist');
    cy.contains('Average duration (ms)').should('exist');
    cy.contains('Error rate').should('exist');
    cy.contains('Traces').should('exist');
  });
});