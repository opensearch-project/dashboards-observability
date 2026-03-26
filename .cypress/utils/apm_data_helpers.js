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
 */
export const uploadAPMDataToOpenSearch = () => {
  const BASE_TIMESTAMP = 1770252300; // Base time from the data (Feb 5, 2026 00:45:00 UTC)
  const currentTime = getCurrentUnixTime();

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
                doc[field] = adjustTimestampToNow(doc[field], BASE_TIMESTAMP, currentTime);
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
 * Wait for Prometheus to have scraped metrics from the metrics server
 * Note: Prometheus must be running and configured to scrape localhost:8080
 */
export const waitForPrometheusMetrics = (prometheusUrl, maxAttempts = 10, retryDelay = 3000) => {
  cy.wrap(null).then(() => {
    let attempts = 0;

    const checkMetrics = () => {
      return cy
        .request({
          method: 'GET',
          url: `${prometheusUrl}/api/v1/query`,
          qs: { query: 'request' },
          failOnStatusCode: false,
          timeout: 10000,
        })
        .then((resp) => {
          attempts++;

          if (
            resp.status === 200 &&
            resp.body &&
            resp.body.data &&
            resp.body.data.result &&
            resp.body.data.result.length > 0
          ) {
            cy.log(`Prometheus has scraped ${resp.body.data.result.length} metric series`);
            return true;
          } else if (attempts < maxAttempts) {
            cy.log(
              `Waiting for Prometheus to scrape metrics (attempt ${attempts}/${maxAttempts})...`
            );
            // Use promise-based retry instead of cy.wait()
            return cy.then(() => {
              return new Cypress.Promise((resolve) => {
                setTimeout(() => resolve(checkMetrics()), retryDelay);
              });
            });
          } else {
            cy.log('Warning: Prometheus may not have scraped metrics yet, proceeding anyway');
            return false;
          }
        });
    };

    return checkMetrics();
  });
};

/**
 * Get the adjusted time range for tests
 * Returns start and end times adjusted to current time
 */
export const getAPMTestTimeRange = () => {
  const BASE_TIMESTAMP = 1770252300; // Base time from the data (Feb 5, 2026 00:45:00 UTC)
  const currentTime = getCurrentUnixTime();
  const timeOffset = currentTime - BASE_TIMESTAMP;

  // Data spans approximately 15 minutes, add buffer
  const startTime = new Date((BASE_TIMESTAMP + timeOffset - 3600) * 1000); // 1 hour before
  const endTime = new Date((BASE_TIMESTAMP + timeOffset + 3600) * 1000); // 1 hour after

  return {
    start: startTime,
    end: endTime,
  };
};
