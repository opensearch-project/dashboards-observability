#!/bin/bash
# Copyright OpenSearch Contributors
# SPDX-License-Identifier: Apache-2.0

# Script to start Prometheus and metrics server for local APM testing
#
# Prerequisites:
#   - Node.js (to run metrics_server.js)
#   - Prometheus (must be in PATH)
#
# Usage:
#   cd /path/to/dashboards-observability
#   ./.cypress/utils/start_local_prometheus.sh
#
# What it does:
#   1. Starts metrics server on localhost:8080 (serves test metrics)
#   2. Starts Prometheus on localhost:9090 (scrapes metrics server every 5s)
#   3. Waits for both services to be ready
#   4. Keeps running until you stop it (Ctrl+C or kill PIDs)
#
# To stop:
#   kill $(cat /tmp/apm-test-pids.txt)
#   or Ctrl+C in the terminal

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PLUGIN_ROOT"

echo "Starting APM metrics server..."
node .cypress/utils/metrics_server.js &
METRICS_PID=$!
echo "Metrics server PID: $METRICS_PID"

# Wait for metrics server
sleep 2
if ! curl -s http://localhost:8080/metrics > /dev/null; then
  echo "ERROR: Metrics server failed to start"
  kill $METRICS_PID 2>/dev/null
  exit 1
fi
echo "✓ Metrics server ready at http://localhost:8080"

# Start Prometheus (assumes prometheus is in PATH)
echo "Starting Prometheus..."
prometheus \
  --config.file=./.cypress/fixtures/prometheus/prometheus.yml \
  --storage.tsdb.path=/tmp/prometheus-apm-local \
  --web.listen-address=:9090 &
PROM_PID=$!
echo "Prometheus PID: $PROM_PID"

# Wait for Prometheus
echo "Waiting for Prometheus to start..."
for i in {1..30}; do
  if curl -s http://localhost:9090/-/ready > /dev/null 2>&1; then
    echo "✓ Prometheus ready at http://localhost:9090"
    break
  fi
  sleep 1
done

echo ""
echo "To stop: kill $METRICS_PID $PROM_PID"
echo "PIDs saved to /tmp/apm-test-pids.txt"
echo "$METRICS_PID $PROM_PID" > /tmp/apm-test-pids.txt

# Verify we have metrics
METRIC_COUNT=$(curl -s 'http://localhost:9090/api/v1/query?query=request{namespace="span_derived"}' | grep -o '"result":\[' | wc -l)
echo ""
echo "✓ Setup complete! Prometheus has scraped metrics."
echo "✓ Metrics server: http://localhost:8080"
echo "✓ Prometheus: http://localhost:9090"
echo ""
echo "Run: yarn cypress:open"
echo "To stop: kill $METRICS_PID $PROM_PID"
echo ""

# Keep running
wait
