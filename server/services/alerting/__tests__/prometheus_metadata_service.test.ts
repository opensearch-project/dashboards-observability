/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AlertingOSClient,
  Datasource,
  DatasourceService,
  Logger,
  PrometheusMetadataProvider,
  PrometheusMetricMetadata,
} from '../../../../common/types/alerting/types';
import { PrometheusMetadataService } from '../prometheus_metadata_service';

const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const ds: Datasource = {
  id: 'ds-1',
  name: 'prom',
  type: 'prometheus',
  url: 'http://prom',
  enabled: true,
};

const mockClient = ({} as unknown) as AlertingOSClient;

function makeProvider(
  overrides: Partial<Record<keyof PrometheusMetadataProvider, jest.Mock>> = {}
): {
  provider: PrometheusMetadataProvider;
  mocks: Record<keyof PrometheusMetadataProvider, jest.Mock>;
} {
  const mocks: Record<keyof PrometheusMetadataProvider, jest.Mock> = {
    getMetricNames: overrides.getMetricNames ?? jest.fn().mockResolvedValue([]),
    getLabelNames: overrides.getLabelNames ?? jest.fn().mockResolvedValue([]),
    getLabelValues: overrides.getLabelValues ?? jest.fn().mockResolvedValue([]),
    getMetricMetadata: overrides.getMetricMetadata ?? jest.fn().mockResolvedValue([]),
  };
  return { provider: (mocks as unknown) as PrometheusMetadataProvider, mocks };
}

function makeDatasourceService(
  getImpl: (id: string) => Promise<Datasource | null> = async () => ds
): DatasourceService {
  return ({
    list: jest.fn(),
    get: jest.fn(getImpl),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    testConnection: jest.fn(),
    listWorkspaces: jest.fn(),
  } as unknown) as DatasourceService;
}

describe('PrometheusMetadataService', () => {
  describe('getMetricNames', () => {
    it('fetches from provider on cache miss and caches the result', async () => {
      const { provider, mocks } = makeProvider({
        getMetricNames: jest.fn().mockResolvedValue(['up', 'node_cpu_seconds_total']),
      });
      const svc = new PrometheusMetadataService(provider, makeDatasourceService(), mockLogger);

      const first = await svc.getMetricNames(mockClient, 'ds-1');
      const second = await svc.getMetricNames(mockClient, 'ds-1');

      expect(first).toEqual(['up', 'node_cpu_seconds_total']);
      expect(second).toEqual(['up', 'node_cpu_seconds_total']);
      expect(mocks.getMetricNames).toHaveBeenCalledTimes(1);
    });

    it('filters cached names by case-insensitive substring when search is given', async () => {
      const { provider } = makeProvider({
        getMetricNames: jest
          .fn()
          .mockResolvedValue(['up', 'node_cpu_seconds_total', 'http_requests_total']),
      });
      const svc = new PrometheusMetadataService(provider, makeDatasourceService(), mockLogger);

      expect(await svc.getMetricNames(mockClient, 'ds-1', 'CPU')).toEqual([
        'node_cpu_seconds_total',
      ]);
      expect(await svc.getMetricNames(mockClient, 'ds-1', 'total')).toEqual([
        'node_cpu_seconds_total',
        'http_requests_total',
      ]);
    });

    it('returns [] and logs when datasource is not found', async () => {
      const { provider, mocks } = makeProvider();
      const dss = makeDatasourceService(async () => null);
      const svc = new PrometheusMetadataService(provider, dss, mockLogger);

      expect(await svc.getMetricNames(mockClient, 'missing')).toEqual([]);
      expect(mocks.getMetricNames).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Datasource missing not found')
      );
    });

    it('returns [] and logs when the provider throws on cache miss', async () => {
      const { provider } = makeProvider({
        getMetricNames: jest.fn().mockRejectedValue(new Error('boom')),
      });
      const svc = new PrometheusMetadataService(provider, makeDatasourceService(), mockLogger);

      expect(await svc.getMetricNames(mockClient, 'ds-1')).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Cache miss fetch failed for ds-1:metricNames')
      );
    });
  });

  describe('getLabelNames', () => {
    it('keys cache by metric argument so different metrics miss independently', async () => {
      const { provider, mocks } = makeProvider({
        getLabelNames: jest.fn().mockResolvedValue(['job', 'instance']),
      });
      const svc = new PrometheusMetadataService(provider, makeDatasourceService(), mockLogger);

      await svc.getLabelNames(mockClient, 'ds-1');
      await svc.getLabelNames(mockClient, 'ds-1'); // cached
      await svc.getLabelNames(mockClient, 'ds-1', 'node_cpu_seconds_total'); // different key

      expect(mocks.getLabelNames).toHaveBeenCalledTimes(2);
      expect(mocks.getLabelNames).toHaveBeenNthCalledWith(1, mockClient, ds, undefined);
      expect(mocks.getLabelNames).toHaveBeenNthCalledWith(
        2,
        mockClient,
        ds,
        'node_cpu_seconds_total'
      );
    });
  });

  describe('getLabelValues', () => {
    it('forwards labelName and selector to the provider and caches by both', async () => {
      const { provider, mocks } = makeProvider({
        getLabelValues: jest.fn().mockResolvedValue(['prod', 'staging']),
      });
      const svc = new PrometheusMetadataService(provider, makeDatasourceService(), mockLogger);

      expect(await svc.getLabelValues(mockClient, 'ds-1', 'env', 'up{job="api"}')).toEqual([
        'prod',
        'staging',
      ]);
      expect(mocks.getLabelValues).toHaveBeenCalledWith(mockClient, ds, 'env', 'up{job="api"}');

      // same key → cached
      await svc.getLabelValues(mockClient, 'ds-1', 'env', 'up{job="api"}');
      expect(mocks.getLabelValues).toHaveBeenCalledTimes(1);

      // different selector → miss
      await svc.getLabelValues(mockClient, 'ds-1', 'env', 'up{job="web"}');
      expect(mocks.getLabelValues).toHaveBeenCalledTimes(2);
    });
  });

  describe('getMetricMetadata', () => {
    it('caches metadata results per datasource', async () => {
      const meta: PrometheusMetricMetadata[] = [
        { metric: 'up', type: 'gauge', help: 'whether the target is up' },
      ];
      const { provider, mocks } = makeProvider({
        getMetricMetadata: jest.fn().mockResolvedValue(meta),
      });
      const svc = new PrometheusMetadataService(provider, makeDatasourceService(), mockLogger);

      expect(await svc.getMetricMetadata(mockClient, 'ds-1')).toEqual(meta);
      expect(await svc.getMetricMetadata(mockClient, 'ds-1')).toEqual(meta);
      expect(mocks.getMetricMetadata).toHaveBeenCalledTimes(1);
    });
  });

  describe('stale-while-revalidate', () => {
    const realNow = Date.now;
    afterEach(() => {
      Date.now = realNow;
    });

    it('returns stale data immediately and triggers a background refresh past TTL', async () => {
      const { provider, mocks } = makeProvider({
        getMetricNames: jest
          .fn()
          .mockResolvedValueOnce(['old-metric'])
          .mockResolvedValueOnce(['fresh-metric']),
      });
      const svc = new PrometheusMetadataService(provider, makeDatasourceService(), mockLogger);

      let now = 1_000_000;
      Date.now = () => now;

      // Prime the cache at t=0
      expect(await svc.getMetricNames(mockClient, 'ds-1')).toEqual(['old-metric']);
      expect(mocks.getMetricNames).toHaveBeenCalledTimes(1);

      // Advance past the 5-minute TTL for metricNames
      now += 6 * 60_000;

      // Returns stale value synchronously; kicks off background refresh
      expect(await svc.getMetricNames(mockClient, 'ds-1')).toEqual(['old-metric']);
      expect(mocks.getMetricNames).toHaveBeenCalledTimes(2);

      // Flush the background promise chain
      await new Promise((resolve) => setImmediate(resolve));

      // New request now hits the refreshed cache
      expect(await svc.getMetricNames(mockClient, 'ds-1')).toEqual(['fresh-metric']);
      expect(mocks.getMetricNames).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalidate', () => {
    it('drops entries matching the dsId prefix and leaves others intact', async () => {
      const { provider, mocks } = makeProvider({
        getMetricNames: jest.fn().mockResolvedValue(['a']),
      });
      const dss = makeDatasourceService(async (id) => ({ ...ds, id }));
      const svc = new PrometheusMetadataService(provider, dss, mockLogger);

      await svc.getMetricNames(mockClient, 'ds-1');
      await svc.getMetricNames(mockClient, 'ds-2');
      expect(mocks.getMetricNames).toHaveBeenCalledTimes(2);

      svc.invalidate('ds-1');

      await svc.getMetricNames(mockClient, 'ds-1'); // miss → fetch
      await svc.getMetricNames(mockClient, 'ds-2'); // still cached
      expect(mocks.getMetricNames).toHaveBeenCalledTimes(3);
    });

    it('invalidateAll clears everything', async () => {
      const { provider, mocks } = makeProvider({
        getMetricNames: jest.fn().mockResolvedValue(['a']),
      });
      const svc = new PrometheusMetadataService(provider, makeDatasourceService(), mockLogger);

      await svc.getMetricNames(mockClient, 'ds-1');
      svc.invalidateAll();
      await svc.getMetricNames(mockClient, 'ds-1');
      expect(mocks.getMetricNames).toHaveBeenCalledTimes(2);
    });
  });
});
