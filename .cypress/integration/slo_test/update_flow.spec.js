/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

/*
 * SLO update flow.
 *
 * Run locally with:
 *   yarn cypress:run --spec \
 *     .cypress/integration/slo_test/update_flow.spec.js \
 *     --env "sloDatasourceId=ObservabilityStack_Prometheus[,workspaceId=<id>]"
 *
 * The SLO detail page does not currently expose an Edit button — updates
 * happen through the API (PUT /api/observability/v1/slos/{id}). This spec
 * exercises that surface end-to-end and verifies what the UI displays
 * after an update lands:
 *
 *   1. Updating description (non-SLI field) — version bumps, the detail
 *      page renders the new description, recording-rule names unchanged.
 *   2. Updating the objective target — detail-page objectives table
 *      reflects the new target.
 *   3. Updating dimensions (SLI shape change) — recording-rule names
 *      change because the fingerprint hash includes the dimension list.
 */

const APP_ID = 'observability-apm-slo';
const WORKSPACE_PREFIX = Cypress.env('workspaceId') ? `/w/${Cypress.env('workspaceId')}` : '';
const SLO_BASE = `${WORKSPACE_PREFIX}/api/observability/v1/slos`;

const randomId = (prefix) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;

function buildBaseSpec(datasourceId, name, description = 'Cypress update_flow — initial') {
  return {
    datasourceId,
    name,
    description,
    enabled: true,
    mode: 'active',
    service: 'cypress-svc',
    owner: { teams: ['cypress-team'] },
    sli: {
      type: 'single',
      definition: {
        backend: 'prometheus',
        type: 'availability',
        calcMethod: 'events',
        metric: 'http_requests_total',
        goodEventsFilter: 'status_code!~"5.."',
      },
      dimensions: [{ name: 'service', value: 'cypress-svc' }],
    },
    objectives: [{ name: 'primary', target: 0.99 }],
    budgetWarningThresholds: [],
    window: { type: 'rolling', duration: '28d' },
    alerting: {
      strategy: 'mwmbr',
      burnRates: [
        {
          shortWindow: '5m',
          longWindow: '1h',
          burnRateMultiplier: 14.4,
          severity: 'critical',
          createAlarm: true,
          forDuration: '2m',
        },
      ],
    },
    alarms: {
      sliHealth: { enabled: false },
      attainmentBreach: { enabled: false },
      budgetWarning: { enabled: true },
      noData: { enabled: false, forDuration: '10m' },
      resolved: { enabled: false },
    },
    exclusionWindows: [],
    labels: {},
    annotations: {},
  };
}

function readSlo(id) {
  return cy.request({
    method: 'GET',
    url: `${SLO_BASE}/${encodeURIComponent(id)}`,
    headers: { 'osd-xsrf': 'true' },
    failOnStatusCode: false,
  });
}

describe('SLO update flow', () => {
  const datasourceId = Cypress.env('sloDatasourceId') || 'prom_integ_test';
  const sloName = randomId('cypress-update');
  let sloId = null;
  let version = 1;

  before(function () {
    cy.request({
      method: 'POST',
      url: SLO_BASE,
      headers: { 'osd-xsrf': 'true' },
      body: { spec: buildBaseSpec(datasourceId, sloName) },
      failOnStatusCode: false,
    }).then((resp) => {
      if (resp.status !== 200 && resp.status !== 201) {
        Cypress.log({
          name: 'update_flow',
          message: `SLO create failed (status ${resp.status}); skipping spec`,
        });
        this.skip();
        return;
      }
      sloId = resp.body.id;
      // The route returns the freshly-stored doc; capture its version so
      // subsequent PUTs can pass optimistic-concurrency. `version` lives at
      // `doc.status.version` (see common/slo/slo_lifecycle_service.ts).
      version = (resp.body.status && resp.body.status.version) || 1;
    });
  });

  after(() => {
    if (!sloId) return;
    cy.request({
      method: 'DELETE',
      url: `${SLO_BASE}/${encodeURIComponent(sloId)}`,
      headers: { 'osd-xsrf': 'true' },
      failOnStatusCode: false,
    });
  });

  it('updating description bumps version and the detail page reflects the new copy', function () {
    if (!sloId) {
      this.skip();
      return;
    }
    const updatedDescription = `Cypress update_flow — updated ${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    cy.request({
      method: 'PUT',
      url: `${SLO_BASE}/${encodeURIComponent(sloId)}`,
      headers: { 'osd-xsrf': 'true' },
      body: { version, spec: { description: updatedDescription } },
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status, `PUT description: ${JSON.stringify(resp.body)}`).to.equal(200);
      // Optimistic-lock token bumps on each successful update.
      version = (resp.body.status && resp.body.status.version) || version + 1;
    });

    // Detail page must show the new description copy verbatim.
    cy.visit(`${WORKSPACE_PREFIX}/app/${APP_ID}#/slos/${encodeURIComponent(sloId)}`);
    cy.get('[data-test-subj="sloDetailPage"]', { timeout: 30000 }).should('be.visible');
    cy.get('[data-test-subj="slosDetailHeader"]').should('contain.text', updatedDescription);
  });

  it('updating the objective target reflects in the objectives table', function () {
    if (!sloId) {
      this.skip();
      return;
    }
    const newTarget = 0.995;
    // Re-read the doc to make sure we're sending the freshest version —
    // tests run sequentially but a defensive re-read sidesteps any stale-
    // closure surprise across tests.
    readSlo(sloId).then((resp) => {
      expect(resp.status, `pre-PUT GET: ${JSON.stringify(resp.body)}`).to.equal(200);
      version = (resp.body.status && resp.body.status.version) || version;
    });
    cy.then(() => {
      cy.request({
        method: 'PUT',
        url: `${SLO_BASE}/${encodeURIComponent(sloId)}`,
        headers: { 'osd-xsrf': 'true' },
        body: {
          version,
          spec: {
            objectives: [{ name: 'primary', target: newTarget }],
          },
        },
        failOnStatusCode: false,
      }).then((resp) => {
        expect(resp.status, `PUT objective: ${JSON.stringify(resp.body)}`).to.equal(200);
        version = (resp.body.status && resp.body.status.version) || version + 1;
        const objs = resp.body && resp.body.spec && resp.body.spec.objectives;
        expect(objs[0].target, `PUT response objective target: ${JSON.stringify(objs)}`).to.equal(
          newTarget
        );
      });
    });

    // Confirm the persisted target via a fresh GET first — saved-object
    // get-by-id is realtime, so this should always succeed.
    readSlo(sloId).then((resp) => {
      const t = resp.body && resp.body.spec && resp.body.spec.objectives[0].target;
      expect(t, `post-PUT GET target: ${t}`).to.equal(newTarget);
    });

    // The objectives table on the detail page renders target as a percentage
    // (e.g. "99.5%" with SLO_PRECISION.target). Look for "99.5" rather than
    // pinning the exact decimal places — the formatter uses tabular-nums and
    // the precision constant lives in shared formatting code.
    //
    // Force-reload after navigating: the previous test in this spec already
    // visited a hashroute under this app id, so Electron may serve the SLO
    // doc from its in-memory HTTP cache. cy.reload(true) bypasses the
    // browser HTTP cache entirely.
    cy.visit(`${WORKSPACE_PREFIX}/app/${APP_ID}#/slos/${encodeURIComponent(sloId)}`);
    cy.reload(true);
    cy.get('[data-test-subj="sloDetailPage"]', { timeout: 30000 }).should('be.visible');
    cy.get('[data-test-subj="slosDetailObjectivesTable"]', { timeout: 30000 })
      .should('contain.text', '99.5');
  });

  it('updating dimensions changes the recording-rule fingerprint', function () {
    if (!sloId) {
      this.skip();
      return;
    }
    // Capture the current fingerprint set so we can confirm it changes
    // after the dimension update. `recordingFingerprints` is an
    // `{ objectiveName: fingerprint }` map on the provisioning record.
    let beforeFingerprints = [];
    readSlo(sloId).then((resp) => {
      const fps =
        (resp.body && resp.body.status && resp.body.status.provisioning &&
          resp.body.status.provisioning.recordingFingerprints) || {};
      beforeFingerprints = Object.values(fps).sort();
    });

    // Add a second dimension. Fingerprint = hash(metric + filter + sorted
    // dimension keys) — adding a key forces a new fingerprint group.
    cy.then(() => {
      cy.request({
        method: 'PUT',
        url: `${SLO_BASE}/${encodeURIComponent(sloId)}`,
        headers: { 'osd-xsrf': 'true' },
        body: {
          version,
          spec: {
            sli: {
              type: 'single',
              definition: {
                backend: 'prometheus',
                type: 'availability',
                calcMethod: 'events',
                metric: 'http_requests_total',
                goodEventsFilter: 'status_code!~"5.."',
              },
              dimensions: [
                { name: 'service', value: 'cypress-svc' },
                { name: 'environment', value: 'staging' },
              ],
            },
          },
        },
        failOnStatusCode: false,
      }).then((resp) => {
        expect(resp.status, `PUT dimensions: ${JSON.stringify(resp.body)}`).to.equal(200);
        version = (resp.body.status && resp.body.status.version) || version + 1;
      });
    });

    // After update, the fingerprint set should differ from the pre-update
    // set — the dimension list participates in the fingerprint hash.
    cy.then(() => {
      readSlo(sloId).then((resp) => {
        const fps =
          (resp.body && resp.body.status && resp.body.status.provisioning &&
            resp.body.status.provisioning.recordingFingerprints) || {};
        const after = Object.values(fps).sort();
        expect(after.join('|'), 'recording fingerprints should change after dimension change')
          .to.not.equal(beforeFingerprints.join('|'));
      });
    });
  });
});
