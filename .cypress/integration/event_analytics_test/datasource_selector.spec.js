/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { landOnEventExplorer } from '../../utils/event_analytics/helpers';

describe('Data source selector', () => {
  beforeEach(() => {
    landOnEventExplorer();
  });

  it('displays default cluster for indices', () => {
    cy.get('[data-test-subj="dataExplorerDSSelect"]').click();
    cy.get('.euiComboBoxOptionsList').should('exist');
    cy.get('.euiComboBoxOption__content').should('have.length', 1);
  });

  it('filters options based on user input', () => {
    cy.get('[data-test-subj="dataExplorerDSSelect"] input').type('default', {
      force: true,
    });
    cy.get('.euiComboBoxOption__content').should('have.length', 1);
    cy.get('.euiComboBoxOption__content').first().should('contain', 'Default cluster');
  });

  it('updates the visual length of the dropdown based on filtered results', () => {
    cy.get('[data-test-subj="dataExplorerDSSelect"] input').clear({
      force: true,
    });
    cy.get('[data-test-subj="dataExplorerDSSelect"] input').type('Nonexist datasource', {
      force: true,
    });
    cy.get('.euiComboBoxOptionsList').then(($listAfterFilter) => {
      const heightAfterFilter = $listAfterFilter.height();
      cy.get('[data-test-subj="dataExplorerDSSelect"] input').clear({
        force: true,
      });
      cy.get('.euiComboBoxOptionsList').should(($listAll) => {
        expect($listAll.height()).to.be.greaterThan(heightAfterFilter);
      });
    });
  });

  it('selects the correct option when clicked', () => {
    cy.get('[data-test-subj="dataExplorerDSSelect"] input').type('Default cluster', {
      force: true,
    });

    cy.contains('.euiComboBoxOption__content', 'Default cluster').click();
    cy.get('[data-test-subj="dataExplorerDSSelect"] .euiComboBoxPill').should(
      'contain',
      'Default cluster'
    );
  });
});
