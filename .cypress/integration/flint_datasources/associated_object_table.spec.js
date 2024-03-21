/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

import {
	ASSO_TABLE_TITTLE,
	ASSO_HEADER_DESC,
	UPDATE_AT_DESC,
	LOCALIZED_UPDATE_TIMESTAMP,
	REFRESH_BTN_DESC,
	CREATE_ACC_BTN_DESC,
} from '../../utils/flint-datasources/panel_constants'

Cypress.on('uncaught:exception', (err, runnable) => {
	if (err.message.includes('ResizeObserver loop completed with undelivered notifications')) {
		return false;
	}
});

const goToDataConnectionPage = () => {
	cy.visit(`${Cypress.env('opensearchDashboards')}/app/datasources`);
	cy.get('h1[data-test-subj="dataconnections-header"]').should('be.visible');
	cy.get('a[data-test-subj="mys3DataConnectionsLink"]').click();
}

describe('Associated Object test', () => {
	before(() => {
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

	after(() => {
		cy.clearLocalStorage('async-query-catalog-cache');
		cy.clearLocalStorage('async-query-acclerations-cache');
	});

	it('Navigates to Associated objects table and check header elements', () => {
		goToDataConnectionPage();

		cy.contains('.euiFlexItem .euiText.euiText--medium', ASSO_TABLE_TITTLE)
    .should('contain.text', ASSO_HEADER_DESC);

		cy.contains('.euiTextColor--subdued', UPDATE_AT_DESC).should('exist');
		cy.contains('.euiTextColor--subdued', LOCALIZED_UPDATE_TIMESTAMP).should('exist');

		cy.contains('.euiButton--primary', REFRESH_BTN_DESC).should('exist');
		cy.contains('.euiButton--primary.euiButton--fill', CREATE_ACC_BTN_DESC).should('exist');
	});
});
