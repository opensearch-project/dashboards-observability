/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="cypress" />

/**
 * Cypress node-side plugin handlers.
 *
 * cy.task hooks live here. They run in node, not the browser, which lets us
 * issue requests to the OpenSearch Dashboards server with arbitrary methods/
 * headers that the browser would otherwise reject under CORS.
 *
 * @type {Cypress.PluginConfig}
 */
module.exports = (on, config) => {
  require('cypress-watch-and-reload/plugins')(config);

  // OS endpoint for cy.task handlers that bypass OSD and hit the cluster
  // directly (SQL plugin DirectQuery resource paths). Resolution order:
  //   1. CYPRESS_opensearchUrl env var (CI workflow injects this)
  //   2. --env opensearchUrl=... command-line (config.env.opensearchUrl)
  //   3. cypress.config.js's `opensearch` setting
  //   4. http://localhost:9200 fallback
  const opensearchEnv =
    process.env.CYPRESS_opensearchUrl ||
    (config.env && config.env.opensearchUrl) ||
    (config.env && config.env.opensearch) ||
    'http://localhost:9200';
  const osBase = /^https?:\/\//.test(opensearchEnv) ? opensearchEnv : `http://${opensearchEnv}`;
  const osUser = process.env.CYPRESS_opensearchUser || (config.env && config.env.opensearchUser);
  const osPass = process.env.CYPRESS_opensearchPass || (config.env && config.env.opensearchPass);
  // node 22's fetch trusts the system CA bundle; for local dev with self-
  // signed certs, allow opt-out.
  if (
    osBase.startsWith('https:') &&
    (process.env.CYPRESS_opensearchInsecure || (config.env && config.env.opensearchInsecure))
  ) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }
  const baseHeaders = osUser && osPass
    ? { authorization: `Basic ${Buffer.from(`${osUser}:${osPass}`).toString('base64')}` }
    : {};

  on('task', {
    /**
     * Deletes a Cortex rule group out-of-band: bypasses the SLO routes that
     * keep the saved object and the ruler in lockstep, by issuing a DELETE
     * against the SQL plugin's DirectQuery resource path directly on the
     * OpenSearch cluster. Used by rule_health.spec.js to produce a real
     * desync state for the recovery flow.
     *
     * datasourceId here is the SQL plugin's connector name (e.g. `prom_ci`),
     * which is also the value SLO specs pass via `Cypress.env('sloDatasourceId')`.
     *
     * Returns { ok, status } so callers can check 4xx/5xx without throwing.
     */
    'cortex:deleteRuleGroup': async ({ datasourceId, namespace, groupName }) => {
      if (!datasourceId || !namespace || !groupName) {
        return { ok: false, status: 0, error: 'missing datasourceId/namespace/groupName' };
      }
      const url =
        `${osBase}/_plugins/_directquery/_resources/` +
        `${encodeURIComponent(datasourceId)}/api/v1/rules/` +
        `${encodeURIComponent(namespace)}/${encodeURIComponent(groupName)}`;
      try {
        const res = await fetch(url, { method: 'DELETE', headers: baseHeaders });
        return { ok: res.ok, status: res.status };
      } catch (err) {
        return { ok: false, status: 0, error: String(err) };
      }
    },
  });

  return config;
};
