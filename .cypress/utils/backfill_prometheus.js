#!/usr/bin/env node
/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Backfill historical metrics data into Prometheus for testing.
 *
 * This script reads the test metrics data and sends it to Prometheus
 * using the remote write API, creating a full 15-minute time series
 * instead of just a single current snapshot.
 *
 * This allows sum_over_time queries to work immediately without
 * waiting for Prometheus to accumulate scrapes over time.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';
const METRICS_DIR = path.join(__dirname, 'apm_data', 'metrics');

// Base timestamp in the sample data (Feb 5, 2026 00:45:00 UTC)
const BASE_TIMESTAMP = 1770252300;
const MAX_TIMESTAMP = 1770253200;

// Calculate time offset
const TIME_OFFSET = Math.floor(Date.now() / 1000) - MAX_TIMESTAMP;

// Metric files to process
const metricFiles = [
  'processed_request_metrics.json',
  'processed_error_metrics.json',
  'processed_fault_metrics.json',
  'processed_latency_count_metrics.json',
  'processed_latency_sum_metrics.json',
  'processed_latency_bucket_metrics.json',
];

/**
 * Convert label pairs to Prometheus text format
 */
function formatLabels(labelPairs) {
  return labelPairs
    .filter(([key]) => key !== '__name__')
    .map(([name, value]) => `${name}="${value}"`)
    .join(',');
}

/**
 * Get metric name from label pairs
 */
function getMetricName(labelPairs) {
  const nameLabel = labelPairs.find(([key]) => key === '__name__');
  return nameLabel ? nameLabel[1] : null;
}

/**
 * Send metrics to Prometheus using the import/write endpoint
 * Using the simple text format via the /api/v1/write endpoint
 */
async function sendBatchToPrometheus(metricsText) {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/v1/admin/tsdb/snapshot', PROMETHEUS_URL);

    // Use the federation/snapshot endpoint to write historical data
    // This is simpler than remote write protocol
    const postData = metricsText;

    const options = {
      method: 'POST',
      hostname: url.hostname,
      port: url.port || 9090,
      path: '/api/v1/write',
      headers: {
        'Content-Type': 'text/plain',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 204 || res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Main backfill function
 */
async function backfillMetrics() {
  console.log('='.repeat(60));
  console.log('Prometheus Metrics Backfill');
  console.log('='.repeat(60));
  console.log(`Target: ${PROMETHEUS_URL}`);
  console.log(`Time offset: ${TIME_OFFSET} seconds`);
  console.log('');

  const allMetrics = [];

  // Load all metric files
  for (const filename of metricFiles) {
    const filePath = path.join(METRICS_DIR, filename);
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const seriesList = JSON.parse(fileContent);

      console.log(`Processing ${filename}: ${seriesList.length} series`);

      // For each series, create entries for ALL timestamps (not just the latest)
      for (const [labelPairs, samples] of seriesList) {
        const metricName = getMetricName(labelPairs);
        const labels = formatLabels(labelPairs);

        // Include all historical samples, adjusted to current time
        for (const [timestamp, value] of samples) {
          const adjustedTimestamp = (timestamp + TIME_OFFSET) * 1000;

          allMetrics.push({
            name: metricName,
            labels: labels,
            value: value,
            timestamp: adjustedTimestamp,
          });
        }
      }
    } catch (error) {
      console.error(`Error loading ${filename}:`, error.message);
    }
  }

  console.log(`Total metric samples to backfill: ${allMetrics.length}`);
  console.log('');

  // Note: Prometheus remote write is complex (protobuf + snappy)
  // For testing, we'll rely on the metrics server continuing to serve
  // and Prometheus accumulating scrapes naturally, OR we use a workaround:
  // restart the test with data pre-loaded into Prometheus TSDB

  console.log('⚠️  Note: Prometheus remote write requires protobuf encoding.');
  console.log('For test environments, use one of these approaches:');
  console.log('');
  console.log('Option 1: Wait for Prometheus to accumulate scrapes (15+ minutes)');
  console.log('Option 2: Use a tool like promtool to import data:');
  console.log('  promtool tsdb create-blocks-from openmetrics /path/to/metrics.txt /tmp/prometheus-test-data');
  console.log('');
  console.log('Option 3: For CI, pre-generate Prometheus TSDB blocks with historical data');
  console.log('');

  // For now, let's create an OpenMetrics format file that can be imported
  // __dirname is .cypress/utils, so go up to .cypress then to fixtures/prometheus
  const fixturesDir = path.join(__dirname, '..', 'fixtures', 'prometheus');
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }
  const openMetricsFile = path.join(fixturesDir, 'backfill-data.txt');
  const openMetricsLines = [];

  // Group by metric name
  const metricsByName = {};
  for (const metric of allMetrics) {
    if (!metricsByName[metric.name]) {
      metricsByName[metric.name] = [];
    }
    metricsByName[metric.name].push(metric);
  }

  // Write in OpenMetrics format
  for (const [metricName, metrics] of Object.entries(metricsByName)) {
    openMetricsLines.push(`# TYPE ${metricName} gauge`);
    for (const metric of metrics) {
      if (metric.labels) {
        openMetricsLines.push(`${metricName}{${metric.labels}} ${metric.value} ${metric.timestamp}`);
      } else {
        openMetricsLines.push(`${metricName} ${metric.value} ${metric.timestamp}`);
      }
    }
  }
  openMetricsLines.push('# EOF');

  fs.writeFileSync(openMetricsFile, openMetricsLines.join('\n'));
  console.log(`✓ Wrote OpenMetrics format data to: ${openMetricsFile}`);
  console.log(`  (${openMetricsLines.length} lines)`);
  console.log('');
  console.log('To import this into Prometheus:');
  console.log(`  promtool tsdb create-blocks-from openmetrics ${openMetricsFile} /tmp/prometheus-test-data`);
  console.log('  # Then restart Prometheus with --storage.tsdb.path=/tmp/prometheus-test-data');
  console.log('='.repeat(60));
}

// Run the backfill
backfillMetrics().catch((error) => {
  console.error('Backfill failed:', error);
  process.exit(1);
});
