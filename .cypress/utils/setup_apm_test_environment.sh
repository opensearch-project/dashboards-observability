#!/bin/bash
# Copyright OpenSearch Contributors
# SPDX-License-Identifier: Apache-2.0

#
# Setup script for APM integration tests
# This script:
# 1. Starts the metrics server
# 2. Generates Prometheus TSDB blocks with current timestamps
# 3. Starts Prometheus with pre-loaded historical data
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CYPRESS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PLUGIN_ROOT="$(cd "$CYPRESS_DIR/.." && pwd)"

METRICS_SERVER_PORT=8080
PROMETHEUS_PORT=9090
PROMETHEUS_DATA_DIR="/tmp/prometheus-apm-test-$$"

echo "============================================================"
echo "APM Test Environment Setup"
echo "============================================================"
echo "Plugin root: $PLUGIN_ROOT"
echo "Prometheus data: $PROMETHEUS_DATA_DIR"
echo ""

# Cleanup function
cleanup() {
    echo ""
    echo "Cleaning up..."
    if [ ! -z "$METRICS_SERVER_PID" ]; then
        echo "Stopping metrics server (PID: $METRICS_SERVER_PID)"
        kill $METRICS_SERVER_PID 2>/dev/null || true
    fi
    if [ ! -z "$PROMETHEUS_PID" ]; then
        echo "Stopping Prometheus (PID: $PROMETHEUS_PID)"
        kill $PROMETHEUS_PID 2>/dev/null || true
    fi
    echo "Cleanup complete"
}

trap cleanup EXIT

# Check required tools
echo "Checking required tools..."
command -v node >/dev/null 2>&1 || { echo "Error: node is required but not installed"; exit 1; }
command -v prometheus >/dev/null 2>&1 || { echo "Error: prometheus is required but not installed"; exit 1; }
command -v promtool >/dev/null 2>&1 || { echo "Error: promtool is required but not installed"; exit 1; }
echo "✓ All required tools found"
echo ""

# Step 1: Start metrics server
echo "Step 1: Starting metrics server on port $METRICS_SERVER_PORT..."
cd "$PLUGIN_ROOT"
node "$CYPRESS_DIR/utils/metrics_server.js" > /tmp/metrics-server-$$.log 2>&1 &
METRICS_SERVER_PID=$!
echo "Metrics server started (PID: $METRICS_SERVER_PID)"

# Wait for metrics server to be ready
sleep 2
if ! curl -s "http://localhost:$METRICS_SERVER_PORT/metrics" >/dev/null 2>&1; then
    echo "Error: Metrics server failed to start"
    cat /tmp/metrics-server-$$.log
    exit 1
fi
echo "✓ Metrics server is ready"
echo ""

# Step 2: Generate Prometheus TSDB blocks with current timestamps
echo "Step 2: Generating Prometheus TSDB blocks..."
cd "$PLUGIN_ROOT"
node "$CYPRESS_DIR/utils/backfill_prometheus.js" > /tmp/backfill-$$.log 2>&1
if [ $? -ne 0 ]; then
    echo "Error: Failed to generate backfill data"
    cat /tmp/backfill-$$.log
    exit 1
fi

BACKFILL_FILE="$CYPRESS_DIR/fixtures/prometheus/backfill-data.txt"
if [ ! -f "$BACKFILL_FILE" ]; then
    echo "Error: Backfill file not found at $BACKFILL_FILE"
    exit 1
fi

echo "✓ Generated backfill data file"
echo ""

# Step 3: Create TSDB blocks from backfill data
echo "Step 3: Creating Prometheus TSDB blocks..."
rm -rf "$PROMETHEUS_DATA_DIR"
mkdir -p "$PROMETHEUS_DATA_DIR"

promtool tsdb create-blocks-from openmetrics \
    "$BACKFILL_FILE" \
    "$PROMETHEUS_DATA_DIR" \
    > /tmp/promtool-$$.log 2>&1

if [ $? -ne 0 ]; then
    echo "Error: Failed to create TSDB blocks"
    cat /tmp/promtool-$$.log
    exit 1
fi

BLOCK_COUNT=$(ls -1 "$PROMETHEUS_DATA_DIR" | wc -l)
echo "✓ Created $BLOCK_COUNT TSDB blocks"
echo ""

# Step 4: Start Prometheus with pre-loaded data
echo "Step 4: Starting Prometheus on port $PROMETHEUS_PORT..."
PROMETHEUS_CONFIG="$CYPRESS_DIR/fixtures/prometheus/prometheus.yml"

if [ ! -f "$PROMETHEUS_CONFIG" ]; then
    echo "Error: Prometheus config not found at $PROMETHEUS_CONFIG"
    exit 1
fi

prometheus \
    --config.file="$PROMETHEUS_CONFIG" \
    --storage.tsdb.path="$PROMETHEUS_DATA_DIR" \
    --web.listen-address="0.0.0.0:$PROMETHEUS_PORT" \
    > /tmp/prometheus-$$.log 2>&1 &

PROMETHEUS_PID=$!
echo "Prometheus started (PID: $PROMETHEUS_PID)"
echo ""

# Step 5: Wait for Prometheus to be ready
echo "Step 5: Waiting for Prometheus to be ready..."
MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -s "http://localhost:$PROMETHEUS_PORT/-/ready" >/dev/null 2>&1; then
        echo "✓ Prometheus is ready"
        break
    fi
    ATTEMPT=$((ATTEMPT + 1))
    if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
        echo "Error: Prometheus failed to become ready"
        echo "Last 20 lines of Prometheus log:"
        tail -20 /tmp/prometheus-$$.log
        exit 1
    fi
    sleep 1
done
echo ""

# Step 6: Verify data is queryable
echo "Step 6: Verifying data..."

# Check that sum_over_time works
QUERY='sum_over_time(fault{remoteService="",service="checkout"}[15m])'
RESPONSE=$(curl -s "http://localhost:$PROMETHEUS_PORT/api/v1/query" --data-urlencode "query=$QUERY")
RESULT_COUNT=$(echo "$RESPONSE" | python3 -c "import sys, json; print(len(json.load(sys.stdin)['data']['result']))" 2>/dev/null || echo "0")

if [ "$RESULT_COUNT" -gt "0" ]; then
    echo "✓ sum_over_time query returns $RESULT_COUNT results"
else
    echo "⚠  sum_over_time query returned no results (expected if data timestamps are far from current time)"
    echo "   Waiting for Prometheus to scrape fresh data from metrics server..."
    sleep 10

    # Try again with instant query
    QUERY='fault{remoteService=""}'
    RESPONSE=$(curl -s "http://localhost:$PROMETHEUS_PORT/api/v1/query" --data-urlencode "query=$QUERY")
    RESULT_COUNT=$(echo "$RESPONSE" | python3 -c "import sys, json; print(len(json.load(sys.stdin)['data']['result']))" 2>/dev/null || echo "0")

    if [ "$RESULT_COUNT" -gt "0" ]; then
        echo "✓ Prometheus has scraped $RESULT_COUNT fault metric series from metrics server"
    else
        echo "⚠  Warning: No metrics available yet. Tests may need to wait for scrapes."
    fi
fi

echo ""
echo "============================================================"
echo "APM Test Environment Ready"
echo "============================================================"
echo "Metrics Server: http://localhost:$METRICS_SERVER_PORT/metrics"
echo "Prometheus UI: http://localhost:$PROMETHEUS_PORT"
echo ""
echo "Environment:"
echo "  METRICS_SERVER_PID=$METRICS_SERVER_PID"
echo "  PROMETHEUS_PID=$PROMETHEUS_PID"
echo "  PROMETHEUS_DATA_DIR=$PROMETHEUS_DATA_DIR"
echo ""
echo "To run tests:"
echo "  export PROMETHEUS_CONNECTION_URL=http://localhost:$PROMETHEUS_PORT"
echo "  yarn cypress:run --spec .cypress/integration/apm_test/apm_services.spec.js"
echo ""
echo "Press Ctrl+C to stop all services"
echo "============================================================"

# Keep script running
wait
