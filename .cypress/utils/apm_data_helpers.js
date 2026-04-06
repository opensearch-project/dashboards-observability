/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Get current Unix timestamp in seconds
 */
const getCurrentUnixTime = () => Math.floor(Date.now() / 1000);

/**
 * Adjust timestamp in ISO format to current time
 * @param {string} isoString - Original ISO timestamp
 * @param {number} baseTime - Base timestamp in seconds from the data
 * @param {number} currentTime - Current timestamp in seconds
 * @returns {string} Adjusted ISO timestamp
 */
const adjustTimestampToNow = (isoString, baseTime, currentTime) => {
  const originalDate = new Date(isoString);
  const originalMs = originalDate.getTime();
  const baseTimeMs = baseTime * 1000;
  const currentTimeMs = currentTime * 1000;
  const offset = currentTimeMs - baseTimeMs;
  const newMs = originalMs + offset;
  return new Date(newMs).toISOString();
};

/**
 * Upload APM data to OpenSearch indices
 * Uses current time for timestamp adjustments
 */
export const uploadAPMDataToOpenSearch = () => {
  const BASE_TIMESTAMP = 1770252300; // Base time from the data (Feb 5, 2026 00:45:00 UTC)
  const MAX_TIMESTAMP = 1770253200; // Maximum timestamp (15 minutes after base)
  const baseTime = MAX_TIMESTAMP;
  const currentTime = getCurrentUnixTime();

  return uploadDataWithTime(currentTime, baseTime);
};

/**
 * Helper function to upload data with a specific time offset
 */
const uploadDataWithTime = (currentTime, baseTime) => {

  const apmDataSets = [
    {
      index: 'otel_v1_apm_span_explore',
      mappingFile: 'apm_data/traces/otel_v1_apm_span_explore.mapping.json',
      dataFile: 'apm_data/traces/otel_v1_apm_span_explore.data.ndjson',
      timestampFields: ['startTime', 'endTime'],
    },
    {
      index: 'logs_otel_v1_explore',
      mappingFile: 'apm_data/logs/logs_otel_v1_explore.mapping.json',
      dataFile: 'apm_data/logs/logs_otel_v1_explore.data.ndjson',
      timestampFields: ['time', 'observedTimestamp'],
    },
    {
      index: 'otel_apm_service_map_explore',
      mappingFile: 'apm_data/services/otel_apm_service_map_explore.mapping.json',
      dataFile: 'apm_data/services/otel_apm_service_map_explore.data.ndjson',
      timestampFields: ['timestamp'],
    },
  ];

  const dumpDataSet = (index, mappingFile, dataFile, timestampFields) => {
    // Step 1: Delete index if it exists
    return cy
      .request({
        method: 'POST',
        failOnStatusCode: false,
        url: 'api/console/proxy',
        headers: {
          'content-type': 'application/json;charset=UTF-8',
          'osd-xsrf': true,
        },
        qs: {
          path: `${index}`,
          method: 'DELETE',
        },
      })
      .then(() => {
        // Step 2: Create index with updated mapping
        return cy.request({
          method: 'POST',
          failOnStatusCode: false,
          url: 'api/console/proxy',
          headers: {
            'content-type': 'application/json;charset=UTF-8',
            'osd-xsrf': true,
          },
          qs: {
            path: `${index}`,
            method: 'PUT',
          },
        });
      })
      .then(() => {
        // Step 3: Load and apply mapping
        return cy.readFile(`.cypress/utils/${mappingFile}`).then((mapping) => {
          // Extract the mappings content - the file has {"mappings": {...}} but _mapping endpoint needs just the content
          const mappingBody = mapping.mappings || mapping;

          return cy.request({
            method: 'POST',
            url: 'api/console/proxy',
            headers: {
              'content-type': 'application/json;charset=UTF-8',
              'osd-xsrf': true,
            },
            qs: {
              path: `${index}/_mapping`,
              method: 'POST',
            },
            body: mappingBody,
          });
        });
      })
      .then(() => {
        // Step 4: Load data and adjust timestamps
        return cy.readFile(`.cypress/utils/${dataFile}`, 'utf-8').then((fileContent) => {
          const lines = fileContent.trim().split('\n');
          const documents = lines.map((line) => JSON.parse(line));

          // Adjust timestamps to current time
          documents.forEach((doc) => {
            timestampFields.forEach((field) => {
              if (doc[field]) {
                doc[field] = adjustTimestampToNow(doc[field], baseTime, currentTime);
              }
            });
          });

          // Convert to bulk format (alternating index action and document)
          const bulkBody = documents.flatMap((doc) => [
            { index: { _index: index } },
            doc
          ]);

          // Convert to NDJSON format
          const ndjson = bulkBody.map((item) => JSON.stringify(item)).join('\n') + '\n';

          // Step 5: Bulk upload
          return cy.request({
            method: 'POST',
            url: 'api/console/proxy',
            headers: {
              'content-type': 'application/json;charset=UTF-8',
              'osd-xsrf': true,
            },
            qs: {
              path: `${index}/_bulk`,
              method: 'POST',
            },
            body: ndjson,
          });
        });
      })
      .then(() => {
        // Step 6: Refresh index to make data immediately searchable
        return cy.request({
          method: 'POST',
          url: 'api/console/proxy',
          headers: {
            'content-type': 'application/json;charset=UTF-8',
            'osd-xsrf': true,
          },
          qs: {
            path: `${index}/_refresh`,
            method: 'POST',
          },
        });
      });
  };

  // Upload all datasets sequentially
  return apmDataSets.reduce(
    (chain, { index, mappingFile, dataFile, timestampFields }) => {
      return chain.then(() => dumpDataSet(index, mappingFile, dataFile, timestampFields));
    },
    cy.wrap(null)
  );
};

/**
 * Wait for Prometheus to be ready and verify data exists
 * Waits for fresh scrapes from metrics server
 */
export const waitForPrometheusMetrics = (prometheusUrl) => {
  // Wait for Prometheus to accumulate metric scrapes from the metrics server
  const maxAttempts = 15;
  const retryDelay = 4000;

  cy.wrap(null).then(() => {
    let attempts = 0;

    // Queries to verify all critical metrics are available
    const queries = [
      { name: 'request', query: 'request' },
      { name: 'fault', query: 'fault' },
      { name: 'error', query: 'error' },
    ];

    const checkMetrics = () => {
      attempts++;

      // Check all queries sequentially and collect results
      const allResults = [];

      // Recursive function to check queries one by one
      const checkQuery = (index) => {
        if (index >= queries.length) {
          // All queries checked, evaluate results
          const allMetricsReady = allResults.every((r) => r.hasData);

          if (allMetricsReady) {
            const summary = allResults.map((r) => `${r.name}: ${r.count} series`).join(', ');
            cy.log(`✓ All Prometheus metrics ready (${summary})`);
            return cy.wrap(true);
          } else if (attempts < maxAttempts) {
            const missing = allResults.filter((r) => !r.hasData).map((r) => r.name);
            cy.log(
              `Waiting for Prometheus metrics (attempt ${attempts}/${maxAttempts}). Missing: ${missing.join(', ')}`
            );

            // Use promise-based retry
            return cy.then(() => {
              return new Cypress.Promise((resolve) => {
                setTimeout(() => resolve(checkMetrics()), retryDelay);
              });
            });
          } else {
            const missing = allResults.filter((r) => !r.hasData).map((r) => r.name);
            throw new Error(
              `Prometheus metrics not ready after ${maxAttempts} attempts. Missing: ${missing.join(', ')}`
            );
          }
        }

        // Check current query
        const q = queries[index];
        return cy
          .request({
            method: 'GET',
            url: `${prometheusUrl}/api/v1/query`,
            qs: { query: q.query },
            failOnStatusCode: false,
            timeout: 10000,
          })
          .then((resp) => {
            const hasData =
              resp.status === 200 &&
              resp.body &&
              resp.body.data &&
              resp.body.data.result &&
              resp.body.data.result.length > 0;

            const count = hasData ? resp.body.data.result.length : 0;
            allResults.push({ name: q.name, hasData, count });

            // Check next query
            return checkQuery(index + 1);
          });
      };

      return checkQuery(0);
    };

    return checkMetrics();
  });
};

/**
 * Quick check that Prometheus is ready and has metrics
 */
export const verifyPrometheusReady = (prometheusUrl) => {
  // Verify Prometheus has metrics available
  return cy.request({
    method: 'GET',
    url: `${prometheusUrl}/api/v1/query`,
    qs: { query: 'fault{remoteService=""}' },
    timeout: 5000,
  }).then((resp) => {
    const count = resp.body && resp.body.data && resp.body.data.result
      ? resp.body.data.result.length
      : 0;
    cy.log(`Prometheus check: ${count} fault metric series available`);
    expect(count).to.be.greaterThan(0);
  });
};

/**
 * Get the adjusted time range for tests
 * Uses current time with a 1-day window before and after
 * Returns a Cypress command that resolves to {start, end}
 */
export const getAPMTestTimeRange = () => {
  return cy.wrap(null).then(() => {
    const now = new Date();
    const startTime = new Date(now.getTime() - (24 * 60 * 60 * 1000)); // 1 day ago
    const endTime = new Date(now.getTime() + (24 * 60 * 60 * 1000)); // 1 day in future

    return {
      start: startTime,
      end: endTime,
    };
  });
};
