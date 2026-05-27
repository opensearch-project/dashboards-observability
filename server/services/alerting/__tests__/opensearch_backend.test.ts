/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AlertingOSClient, Logger, OSPPLTrigger } from '../../../../common/types/alerting';
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
      // Fixture monitors are query_level_monitor — triggers are OS-native, not PPL.
      // Cast through `as` since `triggers` is a union of OSTrigger | OSPPLTrigger.
      const t0 = result[0].triggers[0] as import('../../../../common/types/alerting').OSTrigger;
      expect(t0.id).toBe('t-1');
      expect(t0.severity).toBe('1');
      expect(t0.actions[0].destination_id).toBe('d-1');

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
  });

  describe('getDestinations', () => {
    it('hits the /_plugins/_notifications/channels endpoint', async () => {
      const { client, request } = makeClient([{ body: { total_hits: 0, channel_list: [] } }]);
      await backend.getDestinations(client);
      expect(request).toHaveBeenCalledWith({
        method: 'GET',
        path: '/_plugins/_notifications/channels',
        body: undefined,
      });
    });

    it('maps channel_list entries to the OSDestination picker shape', async () => {
      // Verbatim shape from
      // https://docs.opensearch.org/latest/observing-your-data/notifications/api/
      // — `channel_list[]` carries config_id / name / description / config_type / is_enabled.
      const { client } = makeClient([
        {
          body: {
            start_index: 0,
            total_hits: 2,
            total_hit_relation: 'eq',
            channel_list: [
              {
                config_id: 'sample-id',
                name: 'Sample Slack Channel',
                description: 'This is a Slack channel',
                config_type: 'slack',
                is_enabled: true,
              },
              {
                config_id: 'wh-1',
                name: 'pager',
                config_type: 'webhook',
                is_enabled: true,
              },
            ],
          },
        },
      ]);
      const result = await backend.getDestinations(client);
      expect(result.destinations).toEqual([
        { id: 'sample-id', type: 'slack', name: 'Sample Slack Channel' },
        { id: 'wh-1', type: 'webhook', name: 'pager' },
      ]);
      expect(result.totalDestinations).toBe(2);
      expect(result.truncated).toBe(false);
    });

    it('flags truncated when total_hits exceeds the returned channel_list', async () => {
      // The `/channels` endpoint doesn't accept a client-supplied size
      // parameter — the upstream applies its own cap. When `total_hits`
      // exceeds the page we got back, we hint to the user that older
      // channels may be missing from the picker.
      const channelList = Array.from({ length: 100 }, (_, i) => ({
        config_id: `c-${i}`,
        name: `chan-${i}`,
        config_type: 'slack',
        is_enabled: true,
      }));
      const { client } = makeClient([{ body: { total_hits: 350, channel_list: channelList } }]);
      const result = await backend.getDestinations(client);
      expect(result.destinations).toHaveLength(100);
      expect(result.totalDestinations).toBe(350);
      expect(result.truncated).toBe(true);
    });

    it('falls back to mapped length when upstream omits total_hits', async () => {
      const { client } = makeClient([
        {
          body: {
            channel_list: [
              { config_id: 'c-1', name: 'ops', config_type: 'slack', is_enabled: true },
            ],
          },
        },
      ]);
      const result = await backend.getDestinations(client);
      expect(result.totalDestinations).toBe(1);
      expect(result.truncated).toBe(false);
    });

    it('returns an empty list when channel_list is missing', async () => {
      // Defense-in-depth: if upstream changes shape (e.g. error returning
      // an empty body), the picker should render "no destinations" — not
      // crash on the `.map`.
      const { client } = makeClient([{ body: {} }]);
      const result = await backend.getDestinations(client);
      expect(result.destinations).toEqual([]);
      expect(result.totalDestinations).toBe(0);
      expect(result.truncated).toBe(false);
    });

    it('emits empty strings rather than throwing when fields are missing', async () => {
      const { client } = makeClient([{ body: { channel_list: [{ config_type: 'slack' }] } }]);
      const result = await backend.getDestinations(client);
      expect(result.destinations).toEqual([{ id: '', name: '', type: 'slack' }]);
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

const pplMonitorHit = (id: string, name: string) => ({
  _id: id,
  _source: {
    type: 'monitor',
    monitor_type: 'ppl_monitor',
    name,
    enabled: true,
    schedule: { period: { interval: 5, unit: 'MINUTES' } },
    inputs: [
      {
        ppl_input: { query: 'source = logs-* | stats count() as cnt', query_language: 'ppl' },
      },
    ],
    triggers: [
      {
        ppl_trigger: {
          id: 'ppl-t-1',
          name: 'high-count',
          severity: '2',
          actions: [
            {
              id: 'ppl-a-1',
              name: 'page',
              destination_id: 'd-pd',
              message_template: { source: 'too many' },
            },
          ],
          type: 'number_of_results',
          num_results_condition: '>',
          num_results_value: 10,
        },
      },
    ],
    last_update_time: 1_700_000_000_000,
  },
  sort: [id],
});

describe('HttpOpenSearchBackend — PPL monitor mapping', () => {
  const backend = new HttpOpenSearchBackend(mockLogger);

  it('preserves monitor_type "ppl_monitor" through the mapper', async () => {
    const { client } = makeClient([
      { body: { hits: { hits: [pplMonitorHit('mon-ppl-1', 'ppl')] } } },
    ]);
    const [m] = await backend.getMonitors(client);
    expect(m.monitor_type).toBe('ppl_monitor');
  });

  it('unwraps ppl_trigger and exposes the canonical PPL trigger shape', async () => {
    const { client } = makeClient([
      { body: { hits: { hits: [pplMonitorHit('mon-ppl-1', 'ppl')] } } },
    ]);
    const [m] = await backend.getMonitors(client);
    const trigger = m.triggers[0] as OSPPLTrigger;
    expect(trigger.ppl_trigger).toBeDefined();
    expect(trigger.ppl_trigger.id).toBe('ppl-t-1');
    expect(trigger.ppl_trigger.severity).toBe('2');
    expect(trigger.ppl_trigger.type).toBe('number_of_results');
    expect(trigger.ppl_trigger.num_results_condition).toBe('>');
    expect(trigger.ppl_trigger.num_results_value).toBe(10);
    expect(trigger.ppl_trigger.actions[0].destination_id).toBe('d-pd');
  });

  it('passes inputs through unchanged for PPL monitors', async () => {
    const { client } = makeClient([
      { body: { hits: { hits: [pplMonitorHit('mon-ppl-1', 'ppl')] } } },
    ]);
    const [m] = await backend.getMonitors(client);
    expect(m.inputs[0]).toEqual({
      ppl_input: { query: 'source = logs-* | stats count() as cnt', query_language: 'ppl' },
    });
  });

  it('falls back to query_level_monitor for unknown monitor_type strings', async () => {
    const hit = pplMonitorHit('mon-x', 'x');
    (hit._source as Record<string, unknown>).monitor_type = 'mystery_monitor';
    const { client } = makeClient([{ body: { hits: { hits: [hit] } } }]);
    const [m] = await backend.getMonitors(client);
    expect(m.monitor_type).toBe('query_level_monitor');
  });
});

// ============================================================================
// updateMonitor — round-trip preservation of plugin-internal fields
// ============================================================================
//
// Regression coverage for F5: prior to merging the user input onto the raw
// upstream document, `updateMonitor` merged onto `mapMonitor(...)`, which only
// modeled the OSD-known fields. Anything the alerting plugin attached that we
// don't model — `data_sources`, `last_run_context`, `owner`, `enabled_time`,
// future fields — was silently stripped on every PUT.
describe('HttpOpenSearchBackend — updateMonitor round-trip', () => {
  const backend = new HttpOpenSearchBackend(mockLogger);

  function captureBody(request: jest.Mock, callIndex: number): Record<string, unknown> {
    const call = request.mock.calls[callIndex];
    if (!call) throw new Error(`no request at index ${callIndex}`);
    return (call[0] as { body?: Record<string, unknown> }).body ?? {};
  }

  it('preserves plugin-internal fields the OSD layer does not model', async () => {
    const upstreamSource = {
      type: 'monitor',
      monitor_type: 'ppl_monitor',
      name: 'mon-1',
      enabled: true,
      schedule: { period: { interval: 5, unit: 'MINUTES' } },
      inputs: [
        {
          ppl_input: { query: 'source = logs-*', query_language: 'ppl' },
        },
      ],
      triggers: [],
      last_update_time: 1700000000000,
      // These four are present on real upstream documents but not on the
      // typed `OSMonitor` projection. They MUST round-trip on PUT.
      data_sources: { foo: 'bar' },
      last_run_context: { lastFiredAt: 1700000000000 },
      owner: 'alerting',
      enabled_time: 1690000000000,
    };

    const { client, request } = makeClient([
      { body: { _id: 'mon-1', _seq_no: 5, _primary_term: 2, monitor: upstreamSource } },
      { body: { _id: 'mon-1', monitor: upstreamSource } },
    ]);

    await backend.updateMonitor(client, 'mon-1', { name: 'renamed' });

    const putBody = captureBody(request, 1);
    expect(putBody.data_sources).toEqual({ foo: 'bar' });
    expect(putBody.last_run_context).toEqual({ lastFiredAt: 1700000000000 });
    expect(putBody.owner).toBe('alerting');
    expect(putBody.enabled_time).toBe(1690000000000);
    // user-supplied input is still applied
    expect(putBody.name).toBe('renamed');
  });

  // Sister regression to F5: protect against the *clobber* path. The body
  // schema uses `unknowns: 'allow'`, so a client request can carry any of
  // the plugin-owned keys; the spread `{ ...rawUpstream, ...input }` would
  // then let the client's value win. We re-spread the originals after
  // `input` so the caller cannot edit those fields through this route.
  it('rejects caller attempts to clobber plugin-internal fields via the request body', async () => {
    const upstreamSource = {
      type: 'monitor',
      monitor_type: 'ppl_monitor',
      name: 'mon-1',
      enabled: true,
      schedule: { period: { interval: 5, unit: 'MINUTES' } },
      inputs: [{ ppl_input: { query: 'source = logs-*', query_language: 'ppl' } }],
      triggers: [],
      last_update_time: 1700000000000,
      data_sources: { tenant: 'tenant-a' },
      last_run_context: { lastFiredAt: 1700000000000 },
      owner: 'alerting',
      enabled_time: 1690000000000,
    };

    const { client, request } = makeClient([
      { body: { _id: 'mon-1', _seq_no: 5, _primary_term: 2, monitor: upstreamSource } },
      { body: { _id: 'mon-1', monitor: upstreamSource } },
    ]);

    await backend.updateMonitor(client, 'mon-1', ({
      name: 'renamed',
      // Hostile input: try to clobber tenant scoping + ownership + state.
      data_sources: { tenant: 'evil-tenant' },
      last_run_context: { lastFiredAt: 0 },
      owner: 'attacker',
      enabled_time: 0,
    } as unknown) as Parameters<typeof backend.updateMonitor>[2]);

    const putBody = captureBody(request, 1);
    expect(putBody.data_sources).toEqual({ tenant: 'tenant-a' });
    expect(putBody.last_run_context).toEqual({ lastFiredAt: 1700000000000 });
    expect(putBody.owner).toBe('alerting');
    expect(putBody.enabled_time).toBe(1690000000000);
    // The harmless field still passes through.
    expect(putBody.name).toBe('renamed');
  });
});
