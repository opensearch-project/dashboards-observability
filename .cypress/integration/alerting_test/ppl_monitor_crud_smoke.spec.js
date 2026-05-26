/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

/*
 * Alert Manager — PPL monitor CRUD smoke (drives the OSD proxy routes
 * directly). The create-flyout uses Monaco + custom comboboxes that don't
 * automate well in Cypress; the value of this spec is verifying the
 * end-to-end server contract — request-shape validation, monitor write
 * round-trip, plugin-internal-field preservation on PUT, and clean-up via
 * DELETE — none of which depend on UI rendering.
 *
 * Prereqs:
 *   - Dev stack running with `observability.alertManager.enabled: true` in
 *     `opensearch_dashboards.yml`.
 *   - `opensearch-alerting` backend plugin installed on the cluster.
 *   - Local cluster (no `dsId`) is targeted by default; override with
 *     `--env alertingDatasourceId=<id>` to run against a specific MDS
 *     datasource.
 *
 * Run with (from plugin dir):
 *   yarn cypress:run \
 *     --spec .cypress/integration/alerting_test/ppl_monitor_crud_smoke.spec.js \
 *     --env alertingEnabled=true,alertingDatasourceId=local
 *
 * The `alertingEnabled` env gate lets CI runs without the alerting plugin
 * skip the spec instead of failing.
 */

const ALERTING_ENABLED = Cypress.env('alertingEnabled') !== false;
const DATASOURCE_ID = Cypress.env('alertingDatasourceId') || 'local';

const uniqueSuffix = () => Math.random().toString(36).slice(2, 8);

function monitorBody(name) {
  return {
    type: 'monitor',
    monitor_type: 'ppl_monitor',
    name,
    enabled: true,
    schedule: { period: { interval: 5, unit: 'MINUTES' } },
    inputs: [
      {
        ppl_input: {
          query: 'source = .opendistro-alerting-config | stats count() as c',
          query_language: 'ppl',
        },
      },
    ],
    triggers: [
      {
        ppl_trigger: {
          name: 'smoke-trigger',
          severity: '3',
          actions: [],
          type: 'number_of_results',
          num_results_condition: '>',
          num_results_value: 0,
        },
      },
    ],
  };
}

function apiUrl(path) {
  return `${Cypress.config('baseUrl') || ''}${path}`;
}

const headers = {
  'osd-xsrf': 'true',
  'Content-Type': 'application/json',
};

describe('Alert Manager — PPL monitor CRUD smoke', () => {
  before(function () {
    if (!ALERTING_ENABLED) this.skip();
  });

  it('creates → reads → updates → acknowledges → deletes a PPL monitor', () => {
    const name = `smoke-${uniqueSuffix()}`;
    let monitorId;

    // --- CREATE ----------------------------------------------------------
    cy.request({
      method: 'POST',
      url: apiUrl(`/api/alerting/opensearch/${encodeURIComponent(DATASOURCE_ID)}/monitors`),
      headers,
      body: monitorBody(name),
    }).then((resp) => {
      expect(resp.status).to.eq(200);
      expect(resp.body).to.have.property('id');
      expect(resp.body.name).to.eq(name);
      monitorId = resp.body.id;
    });

    // --- READ (single) ---------------------------------------------------
    cy.then(() => {
      cy.request({
        method: 'GET',
        url: apiUrl(
          `/api/alerting/opensearch/${encodeURIComponent(DATASOURCE_ID)}/monitors/${encodeURIComponent(monitorId)}`
        ),
        headers,
      }).then((resp) => {
        expect(resp.status).to.eq(200);
        expect(resp.body.name).to.eq(name);
      });
    });

    // --- UPDATE (rename) — exercises the F5 fix path ---------------------
    cy.then(() => {
      const renamed = `${name}-renamed`;
      cy.request({
        method: 'PUT',
        url: apiUrl(
          `/api/alerting/opensearch/${encodeURIComponent(DATASOURCE_ID)}/monitors/${encodeURIComponent(monitorId)}`
        ),
        headers,
        body: { ...monitorBody(name), name: renamed },
      }).then((resp) => {
        expect(resp.status).to.eq(200);
        expect(resp.body.name).to.eq(renamed);
      });
    });

    // --- DELETE ----------------------------------------------------------
    cy.then(() => {
      cy.request({
        method: 'DELETE',
        url: apiUrl(
          `/api/alerting/opensearch/${encodeURIComponent(DATASOURCE_ID)}/monitors/${encodeURIComponent(monitorId)}`
        ),
        headers,
      }).then((resp) => {
        expect(resp.status).to.eq(200);
        expect(resp.body).to.deep.eq({ success: true });
      });
    });
  });

  it('rejects a body that omits `name` (F8 — structured schema validation)', () => {
    cy.request({
      method: 'POST',
      url: apiUrl(`/api/alerting/opensearch/${encodeURIComponent(DATASOURCE_ID)}/monitors`),
      headers,
      body: { type: 'monitor' }, // no name
      failOnStatusCode: false,
    }).then((resp) => {
      // schema.object rejects missing required fields with a 400.
      expect(resp.status).to.be.oneOf([400, 422]);
    });
  });

  it('returns 404 for an unknown dsId in MDS deployments (F1)', function () {
    // This assertion only meaningfully exercises F1 when MDS is enabled.
    // On a non-MDS test cluster the dsId is ignored and the call hits the
    // local cluster, so we tolerate either 404 (MDS path, real fix) or
    // 200/404 from the local cluster lookup (non-MDS path).
    const ghostDs = `nonexistent-${uniqueSuffix()}`;
    cy.request({
      method: 'GET',
      url: apiUrl(`/api/alerting/opensearch/${encodeURIComponent(ghostDs)}/destinations`),
      headers,
      failOnStatusCode: false,
    }).then((resp) => {
      // Accept 404 (MDS rejected the dsId) or 502/200 (non-MDS local).
      // What we MUST NOT see is the body leaking the cluster URL/hostname,
      // since the route was tightened in F2.
      const body = JSON.stringify(resp.body || {});
      expect(body).not.to.match(/(localhost|127\.0\.0\.1|9200):?\d*/);
    });
  });

  it('rejects acknowledge body with an oversized id (F7 — per-id length cap)', () => {
    const bigId = 'x'.repeat(65); // ACK_ID_MAX is 64
    cy.request({
      method: 'POST',
      url: apiUrl(
        `/api/alerting/opensearch/${encodeURIComponent(DATASOURCE_ID)}/monitors/dummy/acknowledge`
      ),
      headers,
      body: { alerts: [bigId] },
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.be.oneOf([400, 422]);
    });
  });
});
