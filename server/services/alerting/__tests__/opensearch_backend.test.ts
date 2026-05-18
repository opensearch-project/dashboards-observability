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

    it('URL-encodes the monitorId before interpolating into the path', async () => {
      // Defense-in-depth: route-layer `alertingIdSchema` already restricts
      // the character set, but if the schema is bypassed (e.g., direct
      // service call from another plugin), the transport must still escape
      // URL-unsafe characters so nothing crosses path boundaries.
      const { client, request } = makeClient([
        {
          body: {
            _id: 'foo',
            monitor: monitorHit('foo', 'A')._source,
          },
        },
      ]);
      await backend.getMonitor(client, 'foo/bar');
      expect(request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/_plugins/_alerting/monitors/foo%2Fbar',
        body: undefined,
      });
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

      const { alerts, totalAlerts, truncated } = await backend.getAlerts(client);
      expect(totalAlerts).toBe(2);
      expect(truncated).toBe(false);
      expect(alerts.map((a) => a.id)).toEqual(['a-1', 'a-2']);
      expect(alerts[0].severity).toBe('1');
      expect(alerts[1].state).toBe('ACKNOWLEDGED');
      expect(request).toHaveBeenCalledTimes(1);
    });

    // ---- range-based filter + cap ----

    const mkAlert = (id: string, start: number, end: number | null) => ({
      id,
      monitor_id: 'mon-1',
      monitor_name: 'A',
      trigger_id: 't-1',
      trigger_name: 'trig',
      state: end === null ? 'ACTIVE' : 'COMPLETED',
      severity: 3,
      start_time: start,
      end_time: end,
      last_notification_time: end ?? start,
    });

    const WINDOW_START = 1_000_000;
    const WINDOW_END = 2_000_000;

    it('no range ⇒ behavior identical to today (truncated false, no filtering)', async () => {
      const { client } = makeClient([
        {
          body: {
            totalAlerts: 2,
            alerts: [mkAlert('a-1', 500, 600), mkAlert('a-2', 3_000_000, null)],
          },
        },
      ]);
      const result = await backend.getAlerts(client);
      // Neither would overlap [1M, 2M] if filtered, but no filter ⇒ both returned
      expect(result.alerts).toHaveLength(2);
      expect(result.truncated).toBe(false);
      expect(result.totalAlerts).toBe(2);
    });

    it('zero overlap ⇒ empty alerts, truncated:false', async () => {
      const { client } = makeClient([
        {
          body: {
            totalAlerts: 2,
            alerts: [mkAlert('a-before', 0, 100), mkAlert('a-after', 5_000_000, 6_000_000)],
          },
        },
      ]);
      const result = await backend.getAlerts(client, {
        startMs: WINDOW_START,
        endMs: WINDOW_END,
      });
      expect(result.alerts).toEqual([]);
      expect(result.totalAlerts).toBe(0);
      expect(result.truncated).toBe(false);
    });

    it('interval-overlap predicate: all overlap cases', async () => {
      const activeBefore = mkAlert('active-before', 500, null); // INCLUDED
      const resolvedBefore = mkAlert('resolved-before', 0, 500); // EXCLUDED
      const resolvedInside = mkAlert('resolved-inside', 1_200_000, 1_800_000); // INCLUDED
      const spansStart = mkAlert('spans-start', 500, 1_500_000); // INCLUDED
      const spansEndResolved = mkAlert('spans-end-r', 1_500_000, 2_500_000); // INCLUDED
      const spansEndActive = mkAlert('spans-end-a', 1_500_000, null); // INCLUDED
      const entirelyAfter = mkAlert('after', 3_000_000, 4_000_000); // EXCLUDED

      const { client } = makeClient([
        {
          body: {
            totalAlerts: 7,
            alerts: [
              activeBefore,
              resolvedBefore,
              resolvedInside,
              spansStart,
              spansEndResolved,
              spansEndActive,
              entirelyAfter,
            ],
          },
        },
      ]);
      const result = await backend.getAlerts(client, {
        startMs: WINDOW_START,
        endMs: WINDOW_END,
      });
      const ids = result.alerts.map((a) => a.id).sort();
      expect(ids).toEqual(
        ['active-before', 'resolved-inside', 'spans-start', 'spans-end-r', 'spans-end-a'].sort()
      );
      expect(result.truncated).toBe(false);
      expect(result.totalAlerts).toBe(5);
    });

    it('sparse-overlap on a huge backlog hits SCAN_CAP and sets truncated:true', async () => {
      // Cluster with a 10k+ alert backlog where almost none overlap the
      // picked window. The post-filter cap (1000 matches) never trips, but
      // the scan cap (10k raw rows = 100 pages of 100) must, so the user
      // gets the "search incomplete" hint instead of an empty list.
      const outOfWindow = mkAlert('out', 0, 100); // resolves before the window
      const responses: Array<{ body: unknown }> = [];
      // The pagination loop terminates on `pageAlerts.length < PAGE_SIZE`,
      // so every page must be exactly PAGE_SIZE (100) until the scan cap
      // breaks the loop. Provide 100 full pages.
      for (let p = 0; p < 100; p++) {
        responses.push({
          body: {
            totalAlerts: 50_000,
            alerts: Array.from({ length: 100 }, (_, i) => ({
              ...outOfWindow,
              id: `out-${p}-${i}`,
            })),
          },
        });
      }

      const { client, request } = makeClient(responses);
      const result = await backend.getAlerts(client, {
        startMs: WINDOW_START,
        endMs: WINDOW_END,
      });
      // No alerts overlap the window — final list is empty …
      expect(result.alerts).toHaveLength(0);
      // … but truncated must still flip so the UI surfaces "search incomplete".
      expect(result.truncated).toBe(true);
      // Loop stopped at SCAN_CAP (10k = 100 pages); shouldn't have walked further.
      expect(request).toHaveBeenCalledTimes(100);
    });

    it('caps at 1000 overlapping alerts and sets truncated:true', async () => {
      // Construct 1001 alerts, all overlapping the window. The helper
      // returns up to PAGE_SIZE (100) per call; we need 11 pages to yield
      // >1000 alerts, but the cap should stop pagination somewhere in the
      // 11th page (we only verify cap + truncated flag, not exact call count).
      const makePage = (from: number) =>
        Array.from({ length: 100 }, (_, i) => mkAlert(`a-${from + i}`, 1_200_000, 1_800_000));
      const lastPage = Array.from({ length: 1 }, (_, i) =>
        mkAlert(`a-${1000 + i}`, 1_200_000, 1_800_000)
      );
      const responses: Array<{ body: unknown }> = [];
      for (let p = 0; p < 10; p++) {
        responses.push({ body: { totalAlerts: 1001, alerts: makePage(p * 100) } });
      }
      responses.push({ body: { totalAlerts: 1001, alerts: lastPage } });

      const { client } = makeClient(responses);
      const result = await backend.getAlerts(client, {
        startMs: WINDOW_START,
        endMs: WINDOW_END,
      });
      expect(result.alerts).toHaveLength(1000);
      expect(result.truncated).toBe(true);
      expect(result.totalAlerts).toBe(1000);
    });

    // ---- monitorId scoping ----

    it('appends URL-encoded monitorId when provided', async () => {
      const { client, request } = makeClient([{ body: { totalAlerts: 0, alerts: [] } }]);
      await backend.getAlerts(client, { monitorId: 'mon/with/slash' });
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          path: expect.stringContaining('&monitorId=mon%2Fwith%2Fslash'),
        })
      );
    });

    // ---- limit semantics ----

    const makeMinimalAlertPage = (from: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: `a-${from + i}`,
        monitor_id: 'm-1',
        monitor_name: 'A',
        trigger_id: 't-1',
        trigger_name: 'trig',
        state: 'COMPLETED',
        severity: 3,
      }));

    it('limit shrinks PAGE_SIZE and trims to exactly limit', async () => {
      const { client, request } = makeClient([
        { body: { totalAlerts: 50, alerts: makeMinimalAlertPage(0, 5) } },
      ]);
      const result = await backend.getAlerts(client, { monitorId: 'm-1', limit: 5 });
      expect(result.alerts).toHaveLength(5);
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          path: expect.stringContaining('size=5'),
        })
      );
      expect(request).toHaveBeenCalledTimes(1);
    });

    it('limit > 100 clamps PAGE_SIZE to 100 and iterates until trimmed to limit', async () => {
      const { client, request } = makeClient([
        { body: { totalAlerts: 200, alerts: makeMinimalAlertPage(0, 100) } },
        { body: { totalAlerts: 200, alerts: makeMinimalAlertPage(100, 100) } },
      ]);
      const result = await backend.getAlerts(client, { monitorId: 'm-1', limit: 150 });
      expect(result.alerts).toHaveLength(150);
      expect(request).toHaveBeenCalledTimes(2);
      expect(request).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          path: expect.stringContaining('size=100'),
        })
      );
    });

    it('limit short-circuit sets truncated when more rows are available upstream', async () => {
      // Monitor has 50 alerts upstream; caller requests only 20. The loop
      // breaks after page 1 (which is full at PAGE_SIZE=limit=20), and
      // `truncated` must be true so future callers can surface "more
      // available" rather than treating the bounded slice as complete.
      const { client } = makeClient([
        { body: { totalAlerts: 50, alerts: makeMinimalAlertPage(0, 20) } },
      ]);
      const result = await backend.getAlerts(client, { monitorId: 'm-1', limit: 20 });
      expect(result.alerts).toHaveLength(20);
      expect(result.truncated).toBe(true);
    });

    it('limit not reached ⇒ truncated stays false', async () => {
      // Upstream has fewer rows than the limit; loop exits via the
      // `pageAlerts.length < PAGE_SIZE` end-of-stream signal.
      const { client } = makeClient([
        { body: { totalAlerts: 3, alerts: makeMinimalAlertPage(0, 3) } },
      ]);
      const result = await backend.getAlerts(client, { monitorId: 'm-1', limit: 20 });
      expect(result.alerts).toHaveLength(3);
      expect(result.truncated).toBe(false);
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
