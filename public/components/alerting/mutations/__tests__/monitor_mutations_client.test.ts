/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MonitorMutationsClient tests — covers the path-encoding contract
 * (encodeURIComponent on every interpolated id), the missing-id rejection
 * paths, and the acknowledgeAlert timeout-translation path
 * (regression coverage for ps48 F10).
 */
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();

jest.mock('../../../../framework/core_refs', () => ({
  coreRefs: {
    http: {
      post: (...args: unknown[]) => mockPost(...args),
      put: (...args: unknown[]) => mockPut(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
  },
}));

import { MonitorMutationsClient } from '../monitor_mutations_client';

beforeEach(() => {
  mockPost.mockReset();
  mockPut.mockReset();
  mockDelete.mockReset();
});

describe('MonitorMutationsClient', () => {
  let client: MonitorMutationsClient;
  beforeEach(() => {
    client = new MonitorMutationsClient();
  });

  describe('createMonitor', () => {
    it('POSTs to the encoded datasource path with the JSON body', async () => {
      mockPost.mockResolvedValueOnce({ id: 'm-1', monitor: {}, message: 'created' });
      const data = { name: 'm', enabled: true };
      const result = await client.createMonitor(data, 'ds/with/slashes');
      expect(result.id).toBe('m-1');
      expect(mockPost).toHaveBeenCalledWith(
        '/api/alerting/opensearch/ds%2Fwith%2Fslashes/monitors',
        { body: JSON.stringify(data) }
      );
    });
  });

  describe('updateMonitor', () => {
    it('PUTs to the encoded ds + monitor id path', async () => {
      mockPut.mockResolvedValueOnce({ id: 'm-1', monitor: {}, message: 'updated' });
      await client.updateMonitor('id with spaces', { enabled: false }, 'ds-1');
      expect(mockPut).toHaveBeenCalledWith(
        '/api/alerting/opensearch/ds-1/monitors/id%20with%20spaces',
        {
          body: JSON.stringify({ enabled: false }),
        }
      );
    });
  });

  describe('deleteMonitor', () => {
    it('DELETEs the encoded ds + monitor id path', async () => {
      mockDelete.mockResolvedValueOnce({ id: 'm/1', deleted: true });
      const result = await client.deleteMonitor('m/1', 'ds-1');
      expect(result.deleted).toBe(true);
      expect(mockDelete).toHaveBeenCalledWith('/api/alerting/opensearch/ds-1/monitors/m%2F1');
    });
  });

  describe('acknowledgeAlert', () => {
    it('rejects when alertId is missing', async () => {
      await expect(client.acknowledgeAlert('', 'ds-1', 'mon-1')).rejects.toThrow(
        /alertId are required/i
      );
    });

    it('rejects when datasourceId is missing', async () => {
      await expect(client.acknowledgeAlert('a-1', undefined, 'mon-1')).rejects.toThrow(
        /datasourceId/i
      );
    });

    it('rejects when monitorId is missing', async () => {
      await expect(client.acknowledgeAlert('a-1', 'ds-1', undefined)).rejects.toThrow(/monitorId/i);
    });

    it('POSTs the acknowledge body and encodes ds + monitor ids in the path', async () => {
      mockPost.mockResolvedValueOnce({ id: 'a-1', acknowledged: true });
      const result = await client.acknowledgeAlert('a/1', 'ds 1', 'mon/1');
      expect(result.acknowledged).toBe(true);
      expect(mockPost).toHaveBeenCalledTimes(1);
      const [path, opts] = mockPost.mock.calls[0];
      expect(path).toBe('/api/alerting/opensearch/ds%201/monitors/mon%2F1/acknowledge');
      expect(opts.body).toBe(JSON.stringify({ alerts: ['a/1'] }));
      expect(opts.signal).toBeDefined();
    });

    it('translates AbortError into a "timed out" message after the timeout fires', async () => {
      jest.useFakeTimers();
      try {
        // Resolve with the abort error after the controller fires.
        mockPost.mockImplementationOnce(
          (_path: string, opts: { signal: AbortSignal }) =>
            new Promise((_resolve, reject) => {
              opts.signal.addEventListener('abort', () => {
                const err = new Error('aborted');
                err.name = 'AbortError';
                reject(err);
              });
            })
        );
        const promise = client.acknowledgeAlert('a-1', 'ds-1', 'mon-1', {
          timeoutMs: 1000,
        });
        // Pre-attach a no-op catch so the rejection isn't reported as
        // unhandled when the fake timer fires below.
        promise.catch(() => undefined);
        jest.advanceTimersByTime(1000);
        await expect(promise).rejects.toThrow(/Acknowledge request timed out after 1000ms/);
      } finally {
        jest.useRealTimers();
      }
    });

    it('rethrows non-abort errors verbatim', async () => {
      mockPost.mockRejectedValueOnce(new Error('500 server error'));
      await expect(client.acknowledgeAlert('a-1', 'ds-1', 'mon-1')).rejects.toThrow(
        '500 server error'
      );
    });
  });
});
