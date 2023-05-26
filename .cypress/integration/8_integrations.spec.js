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
  
  import { skipOn } from '@cypress/skip-test';
  
  const moveToIntegrationsHome = () => {
    cy.visit(`${Cypress.env('opensearchDashboards')}/app/observability-integrations#/`);
  };
  

  
  describe('Basic sanity test for integrations plugin', () => {
    it('Navigates to integrations plugin and expects the correct header', () => {
      moveToIntegrationsHome();
      cy.get('[data-test-subj="integrations-header"]').should('exist');
    });
  });
  
  
 