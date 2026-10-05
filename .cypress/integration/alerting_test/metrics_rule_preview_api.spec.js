/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

/*
 * Prometheus alert-rule PREVIEW route API contract.
 *
 * Runs against the real Cortex + Prometheus DirectQuery datasource stood up by
 * the `cypress-slo-cortex` workflow (`.cypress/cortex-ci/`). Locally:
 *   yarn cypress:run --spec \
 *     .cypress/integration/alerting_test/metrics_rule_preview_api.spec.js \
 *     --env "sloDatasourceId=ObservabilityStack_Prometheus[,workspaceId=<id>]"
 *
 * Pins the SERVER-SIDE contract of POST /api/alerting/prometheus/{dsId}/preview
 * that backs the metrics "Create alert rule" flyout's live preview chart:
 *   1. A bare metric returns a `{points, query}` envelope (200).
 *   2. A trailing comparison is stripped from the effective (plotted) query.
 *   3. An oversized range/step is rejected (400) — resolution is capped.
 *   4. start >= end is rejected (400).
 *   5. An unknown datasource returns 404.
 * Each test sends a single request and asserts the failure/success mode —
 * fast and deterministic, no UI.
 */

const WORKSPACE_PREFIX = Cypress.env('workspaceId') ? `/w/${Cypress.env('workspaceId')}` : '';
const datasourceId = Cypress.env('sloDatasourceId') || 'prom_integ_test';
const PREVIEW_URL = `${WORKSPACE_PREFIX}/api/alerting/prometheus/${encodeURIComponent(
  datasourceId
)}/preview`;

const preview = (body) =>
  cy.request({
    method: 'POST',
    url: PREVIEW_URL,
    headers: { 'osd-xsrf': 'true' },
    body,
    failOnStatusCode: false,
  });

describe('Prometheus preview route contract', () => {
  // Skip the whole suite if the datasource/route isn't reachable (e.g. the
  // Cortex sidecar didn't come up), matching the SLO specs' degrade behavior.
  before(function () {
    preview({ query: 'up' }).then((resp) => {
      if (resp.status !== 200) {
        Cypress.log({
          name: 'preview',
          message: `preview probe failed (${resp.status}); skipping suite`,
        });
        this.skip();
      }
    });
  });

  it('returns a {points, query} envelope for a bare metric', () => {
    preview({ query: 'up' }).then((resp) => {
      expect(resp.status).to.eq(200);
      expect(resp.body).to.have.property('points');
      expect(resp.body.points).to.be.an('array');
      // The effective query echoes the (unchanged) input for a bare metric.
      expect(resp.body.query).to.eq('up');
      if (resp.body.points.length > 0) {
        expect(resp.body.points[0]).to.have.all.keys('timestamp', 'value');
      }
    });
  });

  it('strips a trailing comparison from the effective plotted query', () => {
    preview({ query: 'up > 0.5' }).then((resp) => {
      expect(resp.status).to.eq(200);
      // The chart plots the metric series, not the boolean condition.
      expect(resp.body.query).to.eq('up');
    });
  });

  it('rejects an oversized range/step with 400 (resolution capped)', () => {
    preview({ query: 'up', start: 0, end: 4000000000, step: 1 }).then((resp) => {
      expect(resp.status).to.eq(400);
      expect(String(resp.body.message || '')).to.match(/too large|points/i);
    });
  });

  it('rejects start >= end with 400', () => {
    preview({ query: 'up', start: 100, end: 50 }).then((resp) => {
      expect(resp.status).to.eq(400);
      expect(String(resp.body.message || '')).to.match(/earlier than end/i);
    });
  });

  it('returns 404 for an unknown datasource', () => {
    cy.request({
      method: 'POST',
      url: `${WORKSPACE_PREFIX}/api/alerting/prometheus/does-not-exist-ds/preview`,
      headers: { 'osd-xsrf': 'true' },
      body: { query: 'up' },
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.eq(404);
    });
  });
});
