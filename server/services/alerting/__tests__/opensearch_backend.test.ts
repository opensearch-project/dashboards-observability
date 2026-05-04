/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AlertingOSClient, Logger } from '../../../../common/types/alerting';
import { HttpOpenSearchBackend } from '../opensearch_backend';

const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

/**
 * Build an AlertingOSClient whose transport.request returns canned responses in
 * sequence. Each call in `responses` is either the body object (wrapped as
 * `{ body }`) or a rejected Error.
 */
function makeClient(
  responses: Array<{ body: unknown } | Error>
): {
  client: AlertingOSClient;
  request: jest.Mock;
} {
  const request = jest.fn();
  responses.forEach((r) => {
    if (r instanceof Error) request.mockRejectedValueOnce(r);
    else request.mockResolvedValueOnce(r);
  });
  return {
    client: ({ transport: { request } } as unknown) as AlertingOSClient,
    request,
  };
}

const monitorHit = (id: string, name: string) => ({
  _id: id,
  _source: {
    type: 'monitor',
    monitor_type: 'query_level_monitor',
    name,
    enabled: true,
    schedule: { period: { interval: 1, unit: 'MINUTES' } },
    inputs: [],
    triggers: [
      {
        query_level_trigger: {
          id: 't-1',
          name: 'trigger',
          severity: 1,
          condition: { script: { source: 'ok', lang: 'painless' } },
          actions: [
            {
              id: 'a-1',
              name: 'slack',
              destination_id: 'd-1',
              message_template: { source: 'hi' },
              throttle_enabled: true,
            },
          ],
        },
      },
    ],
    last_update_time: 1_700_000_000_000,
  },
  sort: [id],
});

describe('HttpOpenSearchBackend', () => {
  const backend = new HttpOpenSearchBackend(mockLogger);

  describe('getMonitors', () => {
    it('paginates via search_after and maps raw hits to OSMonitor', async () => {
      const page1 = Array.from({ length: 100 }, (_, i) => monitorHit(`mon-${i}`, `A${i}`));
      const { client, request } = makeClient([
        { body: { hits: { hits: page1 } } },
        { body: { hits: { hits: [monitorHit('mon-100', 'last')] } } },
      ]);

      const result = await backend.getMonitors(client);
      expect(result).toHaveLength(101);
      expect(result[0].triggers[0].id).toBe('t-1');
      expect(result[0].triggers[0].severity).toBe('1');
      expect(result[0].triggers[0].actions[0].destination_id).toBe('d-1');

      expect(request).toHaveBeenCalledTimes(2);
      // Second call should include search_after derived from the last hit of page 1.
      expect(request.mock.calls[1][0]).toEqual(
        expect.objectContaining({
          method: 'POST',
          path: '/_plugins/_alerting/monitors/_search',
          body: expect.objectContaining({ search_after: ['mon-99'] }),
        })
      );
    });

    it('stops paginating when a short page is returned', async () => {
      const { client, request } = makeClient([
        { body: { hits: { hits: [monitorHit('mon-1', 'A')] } } },
      ]);
      const result = await backend.getMonitors(client);
      expect(result).toHaveLength(1);
      expect(request).toHaveBeenCalledTimes(1);
    });
  });

  describe('getMonitor', () => {
    it('maps a GET response into an OSMonitor', async () => {
      const { client, request } = makeClient([
        {
          body: {
            _id: 'mon-1',
            monitor: monitorHit('mon-1', 'A')._source,
          },
        },
      ]);
      const result = await backend.getMonitor(client, 'mon-1');
      expect(result?.id).toBe('mon-1');
      expect(request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/_plugins/_alerting/monitors/mon-1',
        body: undefined,
      });
    });

    it('returns null when the monitor is missing (statusCode 404)', async () => {
      const err = Object.assign(new Error('index_not_found_exception'), { statusCode: 404 });
      const { client } = makeClient([err]);
      expect(await backend.getMonitor(client, 'missing')).toBeNull();
    });

    it('rethrows non-404 errors', async () => {
      const err = Object.assign(new Error('server error'), { statusCode: 500 });
      const { client } = makeClient([err]);
      await expect(backend.getMonitor(client, 'mon-1')).rejects.toMatchObject({
        statusCode: 500,
      });
    });
  });

  describe('getAlerts', () => {
    it('paginates and returns mapped alerts plus totalAlerts', async () => {
      const { client, request } = makeClient([
        {
          body: {
            totalAlerts: 2,
            alerts: [
              {
                id: 'a-1',
                monitor_id: 'mon-1',
                monitor_name: 'A',
                trigger_id: 't-1',
                trigger_name: 'trig',
                state: 'ACTIVE',
                severity: 1,
              },
              {
                alert_id: 'a-2',
                monitor_id: 'mon-1',
                monitor_name: 'A',
                trigger_id: 't-1',
                trigger_name: 'trig',
                state: 'ACKNOWLEDGED',
                severity: '2',
              },
            ],
          },
        },
      ]);

      const { alerts, totalAlerts } = await backend.getAlerts(client);
      expect(totalAlerts).toBe(2);
      expect(alerts.map((a) => a.id)).toEqual(['a-1', 'a-2']);
      expect(alerts[0].severity).toBe('1');
      expect(alerts[1].state).toBe('ACKNOWLEDGED');
      expect(request).toHaveBeenCalledTimes(1);
    });
  });

  describe('getDestinations', () => {
    it('maps raw destinations to OSDestination shape', async () => {
      const { client } = makeClient([
        {
          body: {
            destinations: [
              {
                id: 'd-1',
                type: 'slack',
                name: 'ops',
                slack: { url: 'https://hooks' },
                last_update_time: 100,
              },
            ],
          },
        },
      ]);
      const result = await backend.getDestinations(client);
      expect(result).toEqual([
        {
          id: 'd-1',
          type: 'slack',
          name: 'ops',
          slack: { url: 'https://hooks' },
          custom_webhook: undefined,
          email: undefined,
          last_update_time: 100,
          schema_version: undefined,
        },
      ]);
    });
  });

  describe('runMonitor', () => {
    it('forwards dryrun flag and returns raw body', async () => {
      const { client, request } = makeClient([{ body: { executed: true } }]);
      const result = await backend.runMonitor(client, 'mon-1', true);
      expect(result).toEqual({ executed: true });
      expect(request).toHaveBeenCalledWith({
        method: 'POST',
        path: '/_plugins/_alerting/monitors/mon-1/_execute',
        body: { dryrun: true },
      });
    });
  });
});
