/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Endpoints that should be treated as equivalent to the OSD-primary cluster
 * connection (`opensearch.hosts` in `opensearch_dashboards.yml`).
 *
 * Used by Alert Manager on both sides:
 *   - UI (`use_datasources.ts`) collapses matching `data-source` saved objects
 *     onto the synthetic "Local Cluster" row so users do not see duplicate
 *     entries for the same physical cluster.
 *   - Server (`getAlertingClient`) routes requests for matching saved
 *     objects through `ctx.core.opensearch.client` instead of the MDS
 *     scoped client, because the stored hostname (e.g. the
 *     docker-compose service name `opensearch`) may not resolve from the
 *     OSD process itself.
 *
 * The pattern is a heuristic — it can misroute an SSH-tunneled remote
 * cluster forwarded to a local port. That tradeoff is accepted for dev
 * parity with the UI's existing behaviour.
 */
export const LOCAL_ENDPOINT_PATTERN = /localhost|127\.0\.0\.1|0\.0\.0\.0|::1|opensearch:9200|opensearch-cluster-master|opensearch-master/i;

export function isLocalEndpoint(endpoint: string | undefined | null): boolean {
  if (!endpoint) return false;
  return LOCAL_ENDPOINT_PATTERN.test(endpoint);
}
