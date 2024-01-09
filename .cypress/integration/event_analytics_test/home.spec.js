/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { landOnEventHome } from '../../utils/event_analytics/helpers';

describe('Click actions test', () => {
  beforeEach(() => {
    landOnEventHome();
  });

  it('Go to event explorer from button in No saved objects panel', () => {
    cy.get('[data-test-subj="actionEventExplorer"]').click();
    cy.url().should('contain', '#/explorer');
  });

  it('Click learn more', () => {
    cy.get('[data-test-subj="logHome__learnMore"]')
      .invoke('removeAttr', 'target')  // remove the target attribute to stay in the same tab
      .then($link => {
        const expectedUrl = $link.prop('href');
        expect(expectedUrl).to.contain('/observing-your-data/event-analytics');
      });
  });

  it('Actions - click event explorer', () => {
    cy.get('[data-test-subj="eventHomeAction__explorer"]').click();
    cy.url().should('contain', '#/explorer');
  });

  it('Actions - add sample data', () => {
    cy.get('[data-test-subj="eventHomeAction"]').click();
    cy.get('[data-test-subj="eventHomeAction__addSamples"]').click();
    cy.get('[data-test-subj="confirmModalConfirmButton"]').click();
    cy.get('.euiToastHeader__title').should('contain', 'successfully');
  });

  it('Actions - delete saved queries', () => {
    cy.get('[data-test-subj^="checkboxSelectRow"]').first().check();
    cy.get('[data-test-subj="eventHomeAction"]').click();
    cy.get('[data-test-subj="eventHomeAction__delete"]').click();
    cy.get('[data-test-subj="popoverModal__deleteTextInput"]').type('delete');
    cy.get('[data-test-subj="popoverModal__deleteButton"').click();
    cy.get('.euiToastHeader__title').should('contain', 'successfully');
  });
});
