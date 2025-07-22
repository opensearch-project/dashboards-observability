/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

import { timeoutDelay } from '../../utils/app_constants';
import { TRACE_ID } from '../../utils/constants';

describe('Testing Span Detail Timeline', () => {
  beforeEach(() => {
    cy.visit(`app/observability-traces#/traces?datasourceId=&traceId=${TRACE_ID}`, {
      timeout: 60000,
      onBeforeLoad: (win) => {
        win.sessionStorage.clear();
      },
    });

    cy.get('body', { timeout: timeoutDelay }).should('be.visible');
    cy.get('[data-test-subj="span-detail-timeline"]', { timeout: timeoutDelay }).should('exist');
    cy.get('[data-test-subj="span-gantt-chart-panel"]').scrollIntoView({
      offset: { top: -120 }, // dashboards page has a fixed header
    });
    cy.get('input[data-test-subj="timeline"]').should('be.checked');
    cy.get('[data-test-subj="timeline-reset-button"]', { timeout: timeoutDelay }).then(($btn) => {
      if ($btn.length > 0 && !$btn.prop('disabled')) {
        cy.wrap($btn).click();
      }
    });
  });

  describe('Service Filtering', () => {
    it('Displays correct number of services in the filter', () => {
      cy.get('[data-test-subj="service-filter"]').should('be.visible');
      cy.get('[data-test-subj="service-filter"]').within(() => {
        cy.get('button[aria-label="Clear input"]').should('not.exist');
        cy.get('li[role="option"]').should('have.length.gt', 1);
      });
    });

    it('Filters services by search input', () => {
      cy.get('[data-test-subj="service-filter"]').should('be.visible');
      cy.get('[data-test-subj="service-filter"]').within(() => {
        cy.get('button[aria-label="Clear input"]').should('not.exist');
        cy.get('input[type="search"]').type('order');
        cy.get('li[role="option"]').should('have.length', 1);
        cy.get('li[role="option"]').should('contain.text', 'order');
        cy.get('button[aria-label="Clear input"]').should('be.visible').click();
        cy.get('input[type="search"]').should('be.empty');
      });
    });

    it('Show spans according to selected service', () => {
      cy.get('[data-test-subj="service-filter"]').should('be.visible');

      cy.get('[data-test-subj^="timeline-row-"]')
        .should('have.length.gte', 1)
        .its('length')
        .as('initialCount');

      cy.get('[data-test-subj="service-filter"]').within(() => {
        cy.get('li[role="option"]').first().invoke('text').as('serviceOptionText');
        cy.get('li[role="option"]').first().click();
        cy.get('button[aria-label="Clear focus and service filter selection"]').should(
          'be.visible'
        );
      });

      cy.get('@serviceOptionText').then((text) => {
        const match = text.trim().match(/\((\d+)\)/);
        const expectedCount = parseInt(match[1]);
        cy.get('[data-test-subj^="timeline-row-"]').should('have.length', expectedCount);
        cy.get('[data-test-subj="service-filter"]').within(() => {
          cy.get('button[aria-label="Clear focus and service filter selection"]')
            .should('be.visible')
            .click();
        });
        cy.get('@initialCount').then((initialCount) => {
          cy.get('[data-test-subj^="timeline-row-"]').should('have.length', initialCount);
        });
      });
    });
  });

  describe('Timeline Rendering', () => {
    it('Renders the timeline container with all components', () => {
      cy.get('[data-test-subj="span-detail-timeline"]').should('be.visible');
      cy.get('[data-test-subj="timeline-minimap"]').should('be.visible');
      cy.get('[data-test-subj="timeline-controls"]').should('be.visible');
      cy.get('[data-test-subj="timeline-ruler"]').should('be.visible');
      cy.get('[data-test-subj="timeline-grid"]').should('be.visible');
      cy.get('[data-test-subj^="timeline-row-"]').should('have.length.gte', 1);
      cy.get('[data-test-subj^="timeline-span-bar-"]').should('have.length.gte', 1);
    });

    it('Displays correct tick marks and time labels when data is available', () => {
      cy.get('[data-test-subj^="timeline-row-"]').should('have.length.gte', 1);
      cy.get('[data-test-subj="timeline-tick-mark"]').should('have.length.gte', 5);
      cy.get('[data-test-subj="timeline-tick-label"]').should('have.length.gte', 5);
      cy.get('[data-test-subj="timeline-tick-label"]').each(($label) => {
        cy.wrap($label).should('contain.text', 'ms');
      });
      cy.get('[data-test-subj="timeline-tick-label"]').first().should('contain.text', '0 ms');
      cy.get('[data-test-subj="timeline-grid-line"]').should('have.length.gte', 2);
    });
  });

  describe('Collapse and Expand Spans', () => {
    it('Displays collapse and expand all spans buttons', () => {
      cy.get('button[aria-label="Collapse all spans"]').should('be.visible');
      cy.get('button[aria-label="Expand all spans"]').should('not.exist');
      cy.get('[data-test-subj^="timeline-row-"]').should('have.length.gte', 1);

      // Count the number of root-level spans (those at the first indentation level)
      // Root spans don't have any parent span indentation, so they should be at paddingLeft: 0px
      cy.get('[data-test-subj^="timeline-row-"]')
        .then(($rows) => {
          let rootSpanCount = 0;
          $rows.each((_, row) => {
            const paddingLeft = Cypress.$(row).css('padding-left');
            if (paddingLeft === '0px') {
              rootSpanCount++;
            }
          });
          return rootSpanCount;
        })
        .then((rootSpanCount) => {
          cy.get('button[aria-label="Collapse all spans"]').click();
          cy.get('button[aria-label="Expand all spans"]').should('be.visible');
          cy.get('button[aria-label="Collapse all spans"]').should('not.exist');
          cy.get('[data-test-subj^="timeline-row-"]', { timeout: timeoutDelay }).should(
            'have.length',
            rootSpanCount
          );
        });
    });

    it('Collapse and expand individual spans correctly', () => {
      let initialCount;
      cy.get('[data-test-subj^="timeline-row-"]').should('have.length.gte', 1);
      cy.get('[data-test-subj^="timeline-row-"]').then(($els) => {
        initialCount = $els.length;
      });

      // Find a span that has children (has a collapse button)
      cy.get('[data-test-subj^="span-collapse-"]').first().as('collapseButton');
      cy.get('@collapseButton')
        .invoke('attr', 'data-test-subj')
        .then((testSubj) => {
          const spanId = testSubj.replace('span-collapse-', '');

          cy.get(`[data-test-subj="span-collapse-${spanId}"]`).click();
          cy.get('[data-test-subj^="timeline-row-"]').should('have.length.lt', initialCount);

          cy.get(`[data-test-subj="span-collapse-${spanId}"]`).click();
          cy.get('[data-test-subj^="timeline-row-"]').should('have.length', initialCount);
        });
    });
  });
});
