#!/usr/bin/env node
/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Simple HTTP server that serves APM test metrics in Prometheus text format.
 * Prometheus scrapes this endpoint to ingest the test data.
 *
 * This avoids the complexity of remote write (protobuf + snappy compression)
 * and follows the standard Prometheus scraping pattern.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const METRICS_DIR = path.join(__dirname, 'apm_data', 'metrics');

// Base timestamp in the sample data (Feb 5, 2026 00:45:00 UTC)
const BASE_TIMESTAMP = 1770252300;

/**
 * Calculate time offset to adjust timestamps to current time
 */
function getTimeOffset() {
  const currentTime = Math.floor(Date.now() / 1000);
  return currentTime - BASE_TIMESTAMP;
}

/**
 * Convert label array to Prometheus label string
 * Example: [["__name__", "request"], ["service", "cart"]]
 *       -> '__name__="request",service="cart"'
 */
function formatLabels(labelPairs) {
  return labelPairs
    .map(([name, value]) => `${name}="${value}"`)
    .join(',');
}

/**
 * Load all metric files and convert to Prometheus text format
 */
function generateMetrics() {
  const timeOffset = getTimeOffset();
  const lines = [];

  const metricFiles = [
    'processed_request_metrics.json',
    'processed_error_metrics.json',
    'processed_fault_metrics.json',
    'processed_latency_count_metrics.json',
    'processed_latency_sum_metrics.json',
    'processed_latency_bucket_metrics.json',
  ];

  metricFiles.forEach((filename) => {
    const filePath = path.join(METRICS_DIR, filename);

    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const seriesList = JSON.parse(fileContent);

      // Each series is [[labels], [[timestamp, value], ...]]
      seriesList.forEach(([labelPairs, samples]) => {
        const labelStr = formatLabels(labelPairs);

        // Add each sample with adjusted timestamp
        samples.forEach(([timestamp, value]) => {
          const adjustedTimestamp = (timestamp + timeOffset) * 1000; // Convert to milliseconds
          lines.push(`{${labelStr}} ${value} ${adjustedTimestamp}`);
        });
      });
    } catch (error) {
      console.error(`Error loading ${filename}:`, error.message);
    }
  });

  return lines.join('\n') + '\n';
}

/**
 * HTTP server that responds to /metrics requests
 */
const server = http.createServer((req, res) => {
  if (req.url === '/metrics' || req.url === '/') {
    try {
      const metrics = generateMetrics();
      res.writeHead(200, {
        'Content-Type': 'text/plain; version=0.0.4',
        'Cache-Control': 'no-cache',
      });
      res.end(metrics);
      console.log(`[${new Date().toISOString()}] Served ${metrics.split('\n').length - 1} metric samples`);
    } catch (error) {
      console.error('Error generating metrics:', error);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error\n');
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found. Try /metrics\n');
  }
});

server.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('APM Test Metrics Server');
  console.log('='.repeat(60));
  console.log(`Listening on: http://localhost:${PORT}/metrics`);
  console.log(`Metrics directory: ${METRICS_DIR}`);
  console.log(`Time offset: ${getTimeOffset()} seconds from base timestamp`);
  console.log('');
  console.log('Configure Prometheus to scrape this endpoint:');
  console.log('  scrape_configs:');
  console.log('    - job_name: "apm_test_data"');
  console.log('      static_configs:');
  console.log(`        - targets: ["localhost:${PORT}"]`);
  console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
