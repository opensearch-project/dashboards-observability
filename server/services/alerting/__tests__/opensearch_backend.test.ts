/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AlertingOSClient, Logger, OSMonitor } from '../../../../common/types/alerting/types';
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

    it('returns null when the monitor is missing (HTTP 404)', async () => {
      const { client } = makeClient([new Error('HTTP 404 not found')]);
      expect(await backend.getMonitor(client, 'missing')).toBeNull();
    });

    it('rethrows non-404 errors', async () => {
      const { client } = makeClient([new Error('HTTP 500 server error')]);
      await expect(backend.getMonitor(client, 'mon-1')).rejects.toThrow('HTTP 500');
    });
  });

  describe('createMonitor', () => {
    it('forces type=monitor on the body and maps the response', async () => {
      const { client, request } = makeClient([
        {
          body: {
            _id: 'mon-new',
            monitor: monitorHit('mon-new', 'New')._source,
          },
        },
      ]);

      const input = ({
        type: 'monitor',
        monitor_type: 'query_level_monitor',
        name: 'New',
        enabled: true,
        schedule: { period: { interval: 1, unit: 'MINUTES' } },
        inputs: [],
        triggers: [],
        last_update_time: 0,
      } as unknown) as Omit<OSMonitor, 'id'>;

      const result = await backend.createMonitor(client, input);
      expect(result.id).toBe('mon-new');
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/_plugins/_alerting/monitors',
          body: expect.objectContaining({ type: 'monitor', name: 'New' }),
        })
      );
    });
  });

  describe('updateMonitor', () => {
    it('reads current state then PUTs with if_seq_no/if_primary_term', async () => {
      const { client, request } = makeClient([
        {
          body: {
            _id: 'mon-1',
            _seq_no: 42,
            _primary_term: 3,
            monitor: monitorHit('mon-1', 'A')._source,
          },
        },
        {
          body: {
            _id: 'mon-1',
            monitor: monitorHit('mon-1', 'A renamed')._source,
          },
        },
      ]);

      const result = await backend.updateMonitor(client, 'mon-1', { name: 'A renamed' });
      expect(result?.name).toBe('A renamed');
      expect(request.mock.calls[1][0].method).toBe('PUT');
      expect(request.mock.calls[1][0].path).toBe(
        '/_plugins/_alerting/monitors/mon-1?if_seq_no=42&if_primary_term=3'
      );
    });

    it('returns null when the monitor does not exist', async () => {
      const { client } = makeClient([new Error('HTTP 404')]);
      expect(await backend.updateMonitor(client, 'missing', { name: 'x' })).toBeNull();
    });
  });

  describe('deleteMonitor', () => {
    it('returns true on success and false on 404', async () => {
      const a = makeClient([{ body: {} }]);
      expect(await backend.deleteMonitor(a.client, 'mon-1')).toBe(true);
      expect(a.request).toHaveBeenCalledWith({
        method: 'DELETE',
        path: '/_plugins/_alerting/monitors/mon-1',
        body: undefined,
      });

      const b = makeClient([new Error('HTTP 404')]);
      expect(await backend.deleteMonitor(b.client, 'mon-1')).toBe(false);
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

  describe('acknowledgeAlerts', () => {
    it('POSTs alert ids to the monitor _acknowledge path', async () => {
      const { client, request } = makeClient([{ body: { success: [] } }]);
      await backend.acknowledgeAlerts(client, 'mon-1', ['a-1', 'a-2']);
      expect(request).toHaveBeenCalledWith({
        method: 'POST',
        path: '/_plugins/_alerting/monitors/mon-1/_acknowledge/alerts',
        body: { alerts: ['a-1', 'a-2'] },
      });
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
