/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  querySearch,
  landOnEventExplorer,
  clearQuerySearchBoxText,
  selectDefaultDataSource,
} from '../../utils/event_analytics/helpers';
import { TEST_QUERIES } from '../../utils/event_analytics/constants';

describe('Open flyout for a data row to see details', () => {
  beforeEach(() => {
    landOnEventExplorer();
    selectDefaultDataSource();
    clearQuerySearchBoxText('searchAutocompleteTextArea');
    querySearch(TEST_QUERIES[0].query, TEST_QUERIES[0].dateRangeDOM);
  });

  it('Should be able to open flyout and see data, json and traces', () => {
    cy.get('[data-test-subj="dataGrid__openFlyoutBtn"]').first().click();
    cy.get('.observability-flyout').should('exist');
    cy.get('.observability-flyout .osdDocViewer .euiTabs span.euiTab__content')
      .contains('Table')
      .should('be.visible');
    cy.get('.observability-flyout .osdDocViewer .euiTabs span.euiTab__content')
      .contains('JSON')
      .should('be.visible');
    cy.get('.observability-flyout .osdDocViewer .euiTabs span.euiTab__content')
      .contains('Traces')
      .should('be.visible');
  });

  it('Should be able to see surrounding docs', () => {
    cy.get('[data-test-subj="dataGrid__openFlyoutBtn"]').first().click();
    cy.get('.observability-flyout span.euiButton__text')
      .contains('View surrounding events')
      .should('be.visible')
      .click();
    cy.get('.observability-flyout #surroundingFyout')
      .contains('View surrounding events')
      .should('exist');
  });
});
