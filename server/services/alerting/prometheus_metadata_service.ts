/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Caching wrapper for Prometheus metadata discovery APIs.
 *
 * Implements stale-while-revalidate:
 *  - Serves cached data immediately if available (even if stale)
 *  - Triggers a background refresh when cache entry is past TTL
 *  - On first request (cache miss), waits for the result
 *
 * Cache keys are scoped by datasource ID and method arguments.
 * Differentiated TTLs: metric names 5min, label names 5min, label values 90s, metadata 10min.
 *
 * All methods resolve the Datasource from DatasourceService, then delegate to the provider.
 * On error: logs warning, returns empty array, never throws.
 *
 * Lifetime: instances are **per-request** (constructed inside the route
 * handler against a per-request scoped SavedObjects client). That intentionally
 * dies with the request to avoid cross-tenant cache leaks — the previous
 * shared-singleton design served cached data primed by another principal
 * without a permission check. A per-request cache still helps within a
 * single handler when multiple methods fetch the same resource, and keeps
 * the API shape intact.
 */

import type {
  DatasourceService,
  Logger,
  PrometheusMetadataProvider,
  PrometheusMetricMetadata,
} from '../../../common/types/alerting';

// TTL values in milliseconds
const TTL_METRIC_NAMES = 5 * 60_000; // 5 minutes
const TTL_LABEL_NAMES = 5 * 60_000; // 5 minutes
const TTL_LABEL_VALUES = 90_000; // 90 seconds
const TTL_METADATA = 10 * 60_000; // 10 minutes

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
  ttlMs: number;
}

export class PrometheusMetadataService {
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly refreshing = new Set<string>();

  constructor(
    private readonly provider: PrometheusMetadataProvider,
    private readonly datasourceService: DatasourceService,
    private readonly logger: Logger
  ) {}

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  async getMetricNames(client: any, dsId: string, search?: string): Promise<string[]> {
    const cacheKey = `${dsId}:metricNames`;
    const names = await this.cachedFetch<string[]>(cacheKey, TTL_METRIC_NAMES, () =>
      this.fetchMetricNames(client, dsId)
    );
    if (search) {
      const lower = search.toLowerCase();
      return names.filter((n) => n.toLowerCase().includes(lower));
    }
    return names;
  }

  async getLabelNames(client: any, dsId: string, metric?: string): Promise<string[]> {
    const cacheKey = `${dsId}:labelNames:${metric || ''}`;
    return this.cachedFetch<string[]>(cacheKey, TTL_LABEL_NAMES, () =>
      this.fetchLabelNames(client, dsId, metric)
    );
  }

  async getLabelValues(
    client: any,
    dsId: string,
    labelName: string,
    selector?: string
  ): Promise<string[]> {
    const cacheKey = `${dsId}:labelValues:${labelName}:${selector || ''}`;
    return this.cachedFetch<string[]>(cacheKey, TTL_LABEL_VALUES, () =>
      this.fetchLabelValues(client, dsId, labelName, selector)
    );
  }

  async getMetricMetadata(client: any, dsId: string): Promise<PrometheusMetricMetadata[]> {
    const cacheKey = `${dsId}:metricMetadata`;
    return this.cachedFetch<PrometheusMetricMetadata[]>(cacheKey, TTL_METADATA, () =>
      this.fetchMetricMetadata(client, dsId)
    );
  }

  /** Invalidate all cache entries for a specific datasource. */
  invalidate(dsId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${dsId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  /** Invalidate the entire cache. */
  invalidateAll(): void {
    this.cache.clear();
  }

  // --------------------------------------------------------------------------
  // Cache logic — stale-while-revalidate
  // --------------------------------------------------------------------------

  private async cachedFetch<T>(
    cacheKey: string,
    ttlMs: number,
    fetchFn: () => Promise<T>
  ): Promise<T> {
    const entry = this.cache.get(cacheKey) as CacheEntry<T> | undefined;
    const now = Date.now();

    if (entry) {
      const isStale = now - entry.fetchedAt > entry.ttlMs;
      if (isStale && !this.refreshing.has(cacheKey)) {
        // Trigger background refresh
        this.refreshing.add(cacheKey);
        fetchFn()
          .then((data) => {
            this.cache.set(cacheKey, { data, fetchedAt: Date.now(), ttlMs });
          })
          .catch((err) => {
            this.logger.warn(`Background refresh failed for ${cacheKey}: ${err}`);
          })
          .finally(() => {
            this.refreshing.delete(cacheKey);
          });
      }
      // Return stale data immediately
      return entry.data;
    }

    // Cache miss — must wait for the result
    try {
      const data = await fetchFn();
      this.cache.set(cacheKey, { data, fetchedAt: Date.now(), ttlMs });
      return data;
    } catch (err) {
      this.logger.warn(`Cache miss fetch failed for ${cacheKey}: ${err}`);
      return ([] as unknown) as T;
    }
  }

  // --------------------------------------------------------------------------
  // Fetch delegates — resolve datasource then call provider
  // --------------------------------------------------------------------------

  private async fetchMetricNames(client: any, dsId: string): Promise<string[]> {
    const ds = await this.datasourceService.get(dsId);
    if (!ds) {
      this.logger.warn(`Datasource ${dsId} not found for getMetricNames`);
      return [];
    }
    return this.provider.getMetricNames(client, ds);
  }

  private async fetchLabelNames(client: any, dsId: string, metric?: string): Promise<string[]> {
    const ds = await this.datasourceService.get(dsId);
    if (!ds) {
      this.logger.warn(`Datasource ${dsId} not found for getLabelNames`);
      return [];
    }
    return this.provider.getLabelNames(client, ds, metric);
  }

  private async fetchLabelValues(
    client: any,
    dsId: string,
    labelName: string,
    selector?: string
  ): Promise<string[]> {
    const ds = await this.datasourceService.get(dsId);
    if (!ds) {
      this.logger.warn(`Datasource ${dsId} not found for getLabelValues`);
      return [];
    }
    return this.provider.getLabelValues(client, ds, labelName, selector);
  }

  private async fetchMetricMetadata(
    client: any,
    dsId: string
  ): Promise<PrometheusMetricMetadata[]> {
    const ds = await this.datasourceService.get(dsId);
    if (!ds) {
      this.logger.warn(`Datasource ${dsId} not found for getMetricMetadata`);
      return [];
    }
    return this.provider.getMetricMetadata(client, ds);
  }
}
