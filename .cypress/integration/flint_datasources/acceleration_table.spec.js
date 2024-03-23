/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

import {
  ACC_TABLE_TITLE,
  ACC_TABLE_DESC,
  UPDATE_AT_DESC,
  LOCALIZED_UPDATE_TIMESTAMP_ACC,
  REFRESH_BTN_DESC,
  CREATE_ACC_BTN_DESC,
  ACC_NAME,
  ACC_STATUS,
  ACC_TYPE,
  ACC_DATABASE,
  ACC_TABLE,
  ACC_REFRESH_TYPE,
  ACC_DESTINATION_INDEX,
  ACC_ACTIONS_COL,
  TYPE_MV,
  TYPE_SI,
  EMPTY_CONTENT,
  ACTIVE_MV_NAME,
  SKIP_INDEX_NAME,
  ACTION_ICON_DEL,
  ACTION_ICON_VAC,
  ACTION_ICON_SYN,
  REFRESH_TYPE_AUTO,
  REFRESH_TYPE_MANUAL,
} from '../../utils/flint-datasources/panel_constants';

Cypress.on('uncaught:exception', (err, runnable) => {
  if (err.message.includes('ResizeObserver loop completed with undelivered notifications')) {
    return false;
  }
});

const goToAccelerationTable = () => {
  cy.visit(`${Cypress.env('opensearchDashboards')}/app/datasources`);
  cy.get('h1[data-test-subj="dataconnections-header"]').should('be.visible');
  cy.get('a[data-test-subj="mys3DataConnectionsLink"]').click();
  cy.get('button#acceleration_table').click();
};

describe('Acceleration Table test', () => {
  beforeEach(() => {
    // Load the catalog cache data
    const catalogCachePath = './.cypress/utils/flint-datasources/catalog-cache.json';
    cy.readFile(catalogCachePath).then((cache) => {
      cy.visit(`${Cypress.env('opensearchDashboards')}`, {
        onBeforeLoad: (win) => {
          win.localStorage.setItem('async-query-catalog-cache', JSON.stringify(cache));
        },
      });
    });

    // Load the accelerations cache data
    const accelerationCachePath = './.cypress/utils/flint-datasources/accelerations-cache.json';
    cy.readFile(accelerationCachePath).then((cache) => {
      cy.visit(`${Cypress.env('opensearchDashboards')}`, {
        onBeforeLoad: (win) => {
          win.localStorage.setItem('async-query-acclerations-cache', JSON.stringify(cache));
        },
      });
    });
  });

  afterEach(() => {
    cy.clearLocalStorage('async-query-catalog-cache');
    cy.clearLocalStorage('async-query-acclerations-cache');
  });

  it.skip('Navigates to Acceleration table and check header elements', () => {
    goToAccelerationTable();

    cy.contains('.euiFlexItem .euiText.euiText--medium', ACC_TABLE_TITLE).should(
      'contain.text',
      ACC_TABLE_DESC
    );

    cy.contains('.euiTextColor--subdued', UPDATE_AT_DESC).should('exist');
    cy.contains('.euiTextColor--subdued', LOCALIZED_UPDATE_TIMESTAMP_ACC).should('exist');

    cy.contains('.euiButton--primary', REFRESH_BTN_DESC).should('exist');
    cy.contains('.euiButton--primary.euiButton--fill', CREATE_ACC_BTN_DESC).should('exist');
  });

  it.skip('Navigates to Acceleration table and check table columns', () => {
    goToAccelerationTable();

    cy.get('th[data-test-subj="tableHeaderCell_indexName_0"]')
      .contains('span', ACC_NAME)
      .should('exist');

    cy.get('th[data-test-subj="tableHeaderCell_status_1"]')
      .contains('span', ACC_STATUS)
      .should('exist');

    cy.get('th[data-test-subj="tableHeaderCell_type_2"]')
      .contains('span', ACC_TYPE)
      .should('exist');

    cy.get('th[data-test-subj="tableHeaderCell_database_3"]')
      .contains('span', ACC_DATABASE)
      .should('exist');

    cy.get('th[data-test-subj="tableHeaderCell_table_4"]')
      .contains('span', ACC_TABLE)
      .should('exist');

    cy.get('th[data-test-subj="tableHeaderCell_refreshType_5"]')
      .contains('span', ACC_REFRESH_TYPE)
      .should('exist');

    cy.get('th[data-test-subj="tableHeaderCell_flintIndexName_6"]')
      .contains('span', ACC_DESTINATION_INDEX)
      .should('exist');

    cy.get('th').contains('span[title="Actions"]', ACC_ACTIONS_COL).should('exist');
  });

  it.skip('Checks rows for "Materialized View" type and verifies table column content', () => {
    goToAccelerationTable();

    cy.get('tbody')
      .find('tr')
      .each(($row) => {
        cy.wrap($row)
          .find('td')
          .eq(2)
          .invoke('text')
          .then((text) => {
            if (text.includes(TYPE_MV)) {
              cy.wrap($row).find('td').eq(4).should('contain.text', EMPTY_CONTENT);
            }
          });
      });
  });

  it.skip('Checks rows for "Skipping Index" type and verifies Destination Index column content', () => {
    goToAccelerationTable();

    cy.get('tbody')
      .find('tr')
      .each(($row) => {
        cy.wrap($row)
          .find('td')
          .eq(2)
          .invoke('text')
          .then((text) => {
            if (text.includes(TYPE_SI)) {
              cy.wrap($row).find('td').last().should('contain.text', EMPTY_CONTENT);
            }
          });
      });
  });

  it('Verifies Sync is enabled and Vacuum is disabled for specific row', () => {
    goToAccelerationTable();

    cy.get('tbody tr').contains('td', ACTIVE_MV_NAME).parent('tr').as('selectedRow');

    cy.get('@selectedRow').find('td').eq(2).contains('div', TYPE_MV).should('exist');

    cy.get('@selectedRow').find('td').eq(5).contains('div', REFRESH_TYPE_MANUAL).should('exist');

    cy.get('@selectedRow').find('[data-test-subj="euiCollapsedItemActionsButton"]').click();

    cy.get('.euiContextMenuPanel')
      .should('be.visible')
      .within(() => {
        cy.contains('button', ACTION_ICON_SYN).should('be.visible').and('not.be.disabled');
      });

    cy.get('.euiContextMenuPanel').within(() => {
      cy.contains('button', ACTION_ICON_DEL).should('be.visible').and('not.be.disabled');
    });

    cy.get('.euiContextMenuPanel').within(() => {
      cy.contains('button', ACTION_ICON_VAC).should('be.visible').and('be.disabled');
    });

    cy.get('body').click(0, 0);
  });
});
