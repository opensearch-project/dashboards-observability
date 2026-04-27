/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AlarmsApiClient, HttpClient } from '../alarms_client';

const mockHttp: jest.Mocked<HttpClient> = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
};

let client: AlarmsApiClient;

beforeEach(() => {
  client = new AlarmsApiClient(mockHttp);
});

describe('AlarmsApiClient', () => {
  // ---- Datasources ----
  it('listDatasources calls GET /api/alerting/datasources', async () => {
    mockHttp.get.mockResolvedValueOnce({ datasources: [{ id: 'ds-1' }] });
    const result = await client.listDatasources();
    expect(mockHttp.get).toHaveBeenCalledWith('/api/alerting/datasources', undefined);
    expect(result).toEqual([{ id: 'ds-1' }]);
  });

  // ---- Alerts paginated ----
  it('listAlertsPaginated passes dsIds and maxResults as query', async () => {
    mockHttp.get.mockResolvedValueOnce({ results: [{ id: 'a1' }] });
    const res = await client.listAlertsPaginated(['ds-1', 'ds-2'], 1, 25);
    expect(mockHttp.get).toHaveBeenCalledWith('/api/alerting/unified/alerts', {
      query: { maxResults: '25', dsIds: 'ds-1,ds-2' },
    });
    expect(res.results).toEqual([{ id: 'a1' }]);
  });

  // ---- Rules paginated ----
  it('listRulesPaginated calls GET /api/alerting/unified/rules', async () => {
    mockHttp.get.mockResolvedValueOnce({ rules: [{ id: 'r1' }] });
    const res = await client.listRulesPaginated([], 1, 10);
    expect(mockHttp.get).toHaveBeenCalledWith('/api/alerting/unified/rules', {
      query: { maxResults: '10' },
    });
    expect(res.results).toEqual([{ id: 'r1' }]);
  });

  // ---- Monitor CRUD ----
  it('createMonitor posts to /api/alerting/opensearch/:dsId/monitors', async () => {
    mockHttp.post.mockResolvedValueOnce({ id: 'mon-1' });
    const body = { name: 'test' };
    const result = await client.createMonitor(body, 'ds-1');
    expect(mockHttp.post).toHaveBeenCalledWith('/api/alerting/opensearch/ds-1/monitors', {
      body: JSON.stringify(body),
    });
    expect(result).toEqual({ id: 'mon-1' });
  });

  it('updateMonitor puts to monitors/:id', async () => {
    mockHttp.put.mockResolvedValueOnce({ id: 'mon-1' });
    await client.updateMonitor('mon-1', { name: 'updated' }, 'ds-1');
    expect(mockHttp.put).toHaveBeenCalledWith('/api/alerting/opensearch/ds-1/monitors/mon-1', {
      body: JSON.stringify({ name: 'updated' }),
    });
  });

  it('deleteMonitor calls DELETE on monitors/:id', async () => {
    mockHttp.delete.mockResolvedValueOnce({ deleted: true });
    const result = await client.deleteMonitor('mon-1', 'ds-1');
    expect(mockHttp.delete).toHaveBeenCalledWith(
      '/api/alerting/opensearch/ds-1/monitors/mon-1',
      undefined
    );
    expect(result).toEqual({ deleted: true });
  });

  it('importMonitors posts to monitors/import', async () => {
    mockHttp.post.mockResolvedValueOnce({ imported: 1, total: 1, results: [] });
    await client.importMonitors([{ name: 'x' }], 'ds-1');
    expect(mockHttp.post).toHaveBeenCalledWith('/api/alerting/opensearch/ds-1/monitors/import', {
      body: JSON.stringify([{ name: 'x' }]),
    });
  });

  it('exportMonitors calls GET monitors/export', async () => {
    mockHttp.get.mockResolvedValueOnce({ monitors: [] });
    await client.exportMonitors('ds-1');
    expect(mockHttp.get).toHaveBeenCalledWith(
      '/api/alerting/opensearch/ds-1/monitors/export',
      undefined
    );
  });

  // ---- Alertmanager config ----
  it('getAlertmanagerConfig passes dsId as query', async () => {
    mockHttp.get.mockResolvedValueOnce({ available: true });
    await client.getAlertmanagerConfig('ds-1');
    expect(mockHttp.get).toHaveBeenCalledWith('/api/alerting/alertmanager/config', {
      query: { dsId: 'ds-1' },
    });
  });

  // ---- Acknowledge ----
  it('acknowledgeAlert posts to /alerts/:id/acknowledge', async () => {
    mockHttp.post.mockResolvedValueOnce({ id: 'a1', state: 'ack', result: {} });
    await client.acknowledgeAlert('a1', 'ds-1', 'mon-1');
    expect(mockHttp.post).toHaveBeenCalledWith('/api/alerting/alerts/a1/acknowledge', {
      body: JSON.stringify({ datasourceId: 'ds-1', monitorId: 'mon-1' }),
    });
  });

  // ---- Detail views ----
  it('getAlertDetail calls GET with dsId and alertId', async () => {
    mockHttp.get.mockResolvedValueOnce({ id: 'a1' });
    await client.getAlertDetail('ds-1', 'a1');
    expect(mockHttp.get).toHaveBeenCalledWith('/api/alerting/alerts/ds-1/a1', undefined);
  });

  it('getRuleDetail calls GET with dsId and ruleId', async () => {
    mockHttp.get.mockResolvedValueOnce({ id: 'r1' });
    await client.getRuleDetail('ds-1', 'r1');
    expect(mockHttp.get).toHaveBeenCalledWith('/api/alerting/rules/ds-1/r1', undefined);
  });

  // ---- Cache ----
  it('cachedGet deduplicates concurrent calls', async () => {
    mockHttp.get.mockResolvedValue({ datasources: [] });
    await Promise.all([client.listDatasources(), client.listDatasources()]);
    expect(mockHttp.get).toHaveBeenCalledTimes(1);
  });

  it('invalidateCache clears cached data', async () => {
    mockHttp.get.mockResolvedValue({ datasources: [] });
    await client.listDatasources();
    client.invalidateCache();
    await client.listDatasources();
    expect(mockHttp.get).toHaveBeenCalledTimes(2);
  });
});
