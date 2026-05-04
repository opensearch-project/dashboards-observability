/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * REST API handlers for Prometheus metadata discovery endpoints.
 * Framework-agnostic: returns { status, body } objects.
 * Follows the same pattern as server/routes/slo_handlers.ts.
 */

import type { PrometheusMetadataService } from '../../services/alerting/prometheus_metadata_service';
import type { Logger } from '../../../common/types/alerting';
import type { HandlerResult } from './route_utils';

const MAX_RESULTS = 200;

// --------------------------------------------------------------------------
// Get Metric Names
// --------------------------------------------------------------------------

export async function handleGetMetricNames(
  service: PrometheusMetadataService,
  client: any,
  dsId: string,
  search?: string,
  logger?: Logger
): Promise<HandlerResult> {
  try {
    const names = await service.getMetricNames(client, dsId, search);
    // Sort alphabetically and limit to MAX_RESULTS
    const sorted = [...names].sort();
    const limited = sorted.slice(0, MAX_RESULTS);
    return {
      status: 200,
      body: { metrics: limited, total: names.length, truncated: names.length > MAX_RESULTS },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (logger) logger.warn(`handleGetMetricNames failed for ds=${dsId}: ${msg}`);
    return { status: 200, body: { metrics: [], total: 0, truncated: false } };
  }
}

// --------------------------------------------------------------------------
// Get Label Names
// --------------------------------------------------------------------------

export async function handleGetLabelNames(
  service: PrometheusMetadataService,
  client: any,
  dsId: string,
  metric?: string,
  logger?: Logger
): Promise<HandlerResult> {
  try {
    const names = await service.getLabelNames(client, dsId, metric);
    const sorted = [...names].sort();
    return { status: 200, body: { labels: sorted } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (logger) logger.warn(`handleGetLabelNames failed for ds=${dsId}: ${msg}`);
    return { status: 200, body: { labels: [] } };
  }
}

// --------------------------------------------------------------------------
// Get Label Values
// --------------------------------------------------------------------------

export async function handleGetLabelValues(
  service: PrometheusMetadataService,
  client: any,
  dsId: string,
  labelName: string,
  selector?: string,
  logger?: Logger
): Promise<HandlerResult> {
  try {
    const values = await service.getLabelValues(client, dsId, labelName, selector);
    const sorted = [...values].sort();
    const limited = sorted.slice(0, MAX_RESULTS);
    return {
      status: 200,
      body: { values: limited, total: values.length, truncated: values.length > MAX_RESULTS },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (logger)
      logger.warn(`handleGetLabelValues failed for ds=${dsId}, label=${labelName}: ${msg}`);
    return { status: 200, body: { values: [], total: 0, truncated: false } };
  }
}

// --------------------------------------------------------------------------
// Get Metric Metadata
// --------------------------------------------------------------------------

export async function handleGetMetricMetadata(
  service: PrometheusMetadataService,
  client: any,
  dsId: string,
  logger?: Logger
): Promise<HandlerResult> {
  try {
    const metadata = await service.getMetricMetadata(client, dsId);
    return { status: 200, body: { metadata } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (logger) logger.warn(`handleGetMetricMetadata failed for ds=${dsId}: ${msg}`);
    return { status: 200, body: { metadata: [] } };
  }
}
