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
  const originalUnix = Math.floor(originalDate.getTime() / 1000);
  const offset = currentTime - baseTime;
  const newUnix = originalUnix + offset;
  return new Date(newUnix * 1000).toISOString();
};

/**
 * Upload APM data to OpenSearch indices
 * Uses the same time offset as backfill if available
 */
export const uploadAPMDataToOpenSearch = () => {
  const BASE_TIMESTAMP = 1770252300; // Base time from the data (Feb 5, 2026 00:45:00 UTC)
  const MAX_TIMESTAMP = 1770253200; // Maximum timestamp (15 minutes after base)
  const baseTime = MAX_TIMESTAMP;

  // Try to read backfill offset file to use same time offset
  // Path is relative to Cypress working directory (OSD root in CI)
  return cy.readFile('plugins/dashboards-observability/.cypress/fixtures/prometheus/backfill-time-offset.json', { log: false }).then(
    (offsetData) => {
      // Use backfill time
      const currentTime = offsetData.backfillTime;
      cy.task('log', `[APM Data] Using backfill time: ${currentTime} (offset: ${offsetData.timeOffset})`);
      return uploadDataWithTime(currentTime, baseTime);
    },
    (error) => {
      // No backfill file, use current time
      const currentTime = getCurrentUnixTime();
      cy.task('log', '[APM Data] No backfill offset file, using current time for OpenSearch data');
      return uploadDataWithTime(currentTime, baseTime);
    }
  );
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
    // Step 1: Create index
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
          method: 'PUT',
        },
      })
      .then(() => {
        // Step 2: Load and apply mapping
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
        // Step 3: Load data and adjust timestamps
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

          // Step 4: Bulk upload
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
        // Step 5: Refresh index to make data immediately searchable
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
 * For CI with backfill: Verifies Prometheus health and backfilled TSDB data
 * For local without backfill: Waits for fresh scrapes from metrics server
 */
export const waitForPrometheusMetrics = (prometheusUrl, useBackfill = true) => {
  if (useBackfill) {
    // When using backfill, just verify Prometheus is healthy and has TSDB data
    // The widgets use range queries (sum_over_time[15m]) which query the pre-loaded historical data
    cy.log('Verifying Prometheus with backfilled data...');

    return cy.request({
      method: 'GET',
      url: `${prometheusUrl}/-/ready`,
      failOnStatusCode: false,
      timeout: 10000,
    }).then((resp) => {
      expect(resp.status).to.equal(200);
      cy.log('✓ Prometheus is ready with backfilled TSDB data');

      // Verify we can query the backfilled data using a range query
      // Query at a timestamp from the backfilled data range (1 minute ago)
      return cy.request({
        method: 'GET',
        url: `${prometheusUrl}/api/v1/query`,
        qs: {
          query: 'fault{remoteService=""}',
          time: Math.floor(Date.now() / 1000) - 60
        },
        failOnStatusCode: false,
      }).then((queryResp) => {
        const count = queryResp.body && queryResp.body.data && queryResp.body.data.result
          ? queryResp.body.data.result.length
          : 0;
        if (count > 0) {
          cy.log(`✓ Backfilled data verified: ${count} fault metric series available`);
        } else {
          cy.log('⚠️  No backfilled data found in query window, but Prometheus is healthy');
        }
      });
    });
  }

  // Original behavior for non-backfill mode (e.g., local development)
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
 * Quick check that Prometheus is ready
 * For backfill mode: Just checks Prometheus health (instant metrics may not exist yet)
 * For non-backfill: Verifies instant metrics exist
 */
export const verifyPrometheusReady = (prometheusUrl, useBackfill = true) => {
  if (useBackfill) {
    // With backfill, just verify Prometheus is healthy
    // Don't require instant metrics since we're using pre-loaded TSDB data
    return cy.request({
      method: 'GET',
      url: `${prometheusUrl}/-/ready`,
      timeout: 5000,
    }).then((resp) => {
      expect(resp.status).to.equal(200);
      cy.log('✓ Prometheus is healthy (backfill mode)');
    });
  }

  // Non-backfill mode: verify instant metrics exist
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
 * When backfill data exists, uses the exact timestamps from backfill
 * Otherwise falls back to calculating based on current time
 * Returns a Cypress command that resolves to {start, end}
 */
export const getAPMTestTimeRange = () => {
  const BASE_TIMESTAMP = 1770252300; // Base time from the data (Feb 5, 2026 00:45:00 UTC)
  const MAX_TIMESTAMP = 1770253200; // Maximum timestamp (15 minutes after base)

  // Try to read backfill offset file using Cypress
  // Path is relative to Cypress working directory (OSD root in CI)
  return cy.task('log', '[Time Range] Attempting to read backfill offset file')
    .then(() => {
      return cy.readFile('plugins/dashboards-observability/.cypress/fixtures/prometheus/backfill-time-offset.json').then(
        (offsetData) => {
          // Successfully read backfill offset file
          cy.task('log', `[Time Range] Found backfill offset file, using backfill timestamps`);

          const dataEndTime = offsetData.dataEndTime; // This is MAX_TIMESTAMP + timeOffset from backfill
          const startTime = new Date((dataEndTime - 86400) * 1000); // 1 day before data end
          const endTime = new Date((dataEndTime + 86400) * 1000); // 1 day after data end

          cy.task('log', `[Time Range] Backfill data range: ${new Date(offsetData.dataStartTime * 1000).toISOString()} to ${new Date(offsetData.dataEndTime * 1000).toISOString()}`);
          cy.task('log', `[Time Range] Test query range: ${startTime.toISOString()} to ${endTime.toISOString()}`);

          return {
            start: startTime,
            end: endTime,
          };
        },
        (error) => {
          // File doesn't exist, fall back to dynamic calculation (local development)
          cy.task('log', '[Time Range] No backfill offset file found, using dynamic time calculation');

          const currentTime = getCurrentUnixTime();
          const timeOffset = currentTime - MAX_TIMESTAMP;
          const startTime = new Date((MAX_TIMESTAMP + timeOffset - 86400) * 1000); // 1 day before
          const endTime = new Date((MAX_TIMESTAMP + timeOffset + 86400) * 1000); // 1 day after

          return {
            start: startTime,
            end: endTime,
          };
        }
      );
    });
};
