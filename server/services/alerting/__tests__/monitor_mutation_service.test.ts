/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for `MonitorMutationService` — the service that absorbed the 4
 * OS-Alerting write paths from `HttpOpenSearchBackend` in Phase 5. REST
 * behaviour is identical to the prior backend so these assertions mirror
 * what `opensearch_backend.test.ts` used to cover for mutations.
 */

import type { AlertingOSClient, Logger, OSMonitor } from '../../../../common/types/alerting';
import { MonitorMutationService } from '../monitor_mutation_service';
import { isAlertManagerError } from '../errors';

const err = (message: string, statusCode: number): Error =>
  Object.assign(new Error(message), { statusCode });

const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

function makeClient(
  responses: Array<{ body: unknown } | Error>
): { client: AlertingOSClient; request: jest.Mock } {
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

const monitorSource = (id: string, name: string) => ({
  _id: id,
  monitor: {
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
          actions: [],
        },
      },
    ],
    last_update_time: 1_700_000_000_000,
  },
});

describe('MonitorMutationService', () => {
  const svc = new MonitorMutationService(mockLogger);

  describe('createMonitor', () => {
    it('forces type=monitor on the body and maps the response', async () => {
      const { client, request } = makeClient([{ body: monitorSource('mon-new', 'New') }]);

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

      const result = await svc.createMonitor(client, input);
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
            ...monitorSource('mon-1', 'A'),
            _seq_no: 42,
            _primary_term: 3,
          },
        },
        { body: monitorSource('mon-1', 'A renamed') },
      ]);

      const result = await svc.updateMonitor(client, 'mon-1', { name: 'A renamed' });
      expect(result?.name).toBe('A renamed');
      expect(request.mock.calls[1][0].method).toBe('PUT');
      expect(request.mock.calls[1][0].path).toBe(
        '/_plugins/_alerting/monitors/mon-1?if_seq_no=42&if_primary_term=3'
      );
    });

    it('returns null when the monitor does not exist (404 on GET)', async () => {
      const { client } = makeClient([err('not_found_exception', 404)]);
      expect(await svc.updateMonitor(client, 'missing', { name: 'x' })).toBeNull();
    });

    it('rethrows non-404 errors on the GET', async () => {
      const { client } = makeClient([err('server error', 500)]);
      await expect(svc.updateMonitor(client, 'mon-1', { name: 'x' })).rejects.toMatchObject({
        statusCode: 500,
      });
    });

    it('throws a typed internal error when seq_no/primary_term are missing', async () => {
      // GET succeeds but the response lacks _seq_no and _primary_term — we
      // must refuse to downgrade to a non-CAS PUT.
      const { client } = makeClient([{ body: monitorSource('mon-1', 'A') }]);
      let thrown: unknown;
      try {
        await svc.updateMonitor(client, 'mon-1', { name: 'x' });
      } catch (e) {
        thrown = e;
      }
      expect(isAlertManagerError(thrown)).toBe(true);
      expect((thrown as { kind: string }).kind).toBe('internal');
    });

    it('throws a typed conflict error on 409 from the PUT', async () => {
      const { client } = makeClient([
        {
          body: {
            ...monitorSource('mon-1', 'A'),
            _seq_no: 1,
            _primary_term: 1,
          },
        },
        err('version_conflict_engine_exception', 409),
      ]);
      let thrown: unknown;
      try {
        await svc.updateMonitor(client, 'mon-1', { name: 'x' });
      } catch (e) {
        thrown = e;
      }
      expect(isAlertManagerError(thrown)).toBe(true);
      expect((thrown as { kind: string }).kind).toBe('conflict');
      expect((thrown as { resourceId?: string }).resourceId).toBe('mon-1');
    });
  });

  describe('deleteMonitor', () => {
    it('returns true on success and false on 404', async () => {
      const a = makeClient([{ body: {} }]);
      expect(await svc.deleteMonitor(a.client, 'mon-1')).toBe(true);
      expect(a.request).toHaveBeenCalledWith({
        method: 'DELETE',
        path: '/_plugins/_alerting/monitors/mon-1',
        body: undefined,
      });

      const b = makeClient([err('not_found', 404)]);
      expect(await svc.deleteMonitor(b.client, 'mon-1')).toBe(false);
    });

    it('rethrows non-404 errors', async () => {
      const { client } = makeClient([err('server error', 500)]);
      await expect(svc.deleteMonitor(client, 'mon-1')).rejects.toMatchObject({
        statusCode: 500,
      });
    });
  });

  describe('acknowledgeAlerts', () => {
    it('POSTs alert ids to the monitor _acknowledge path', async () => {
      const { client, request } = makeClient([{ body: { success: [] } }]);
      await svc.acknowledgeAlerts(client, 'mon-1', ['a-1', 'a-2']);
      expect(request).toHaveBeenCalledWith({
        method: 'POST',
        path: '/_plugins/_alerting/monitors/mon-1/_acknowledge/alerts',
        body: { alerts: ['a-1', 'a-2'] },
      });
    });
  });
});
