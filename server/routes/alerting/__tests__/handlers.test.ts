/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  handleListDatasources,
  handleGetDatasource,
  handleCreateDatasource,
  handleDeleteDatasource,
  handleGetOSMonitors,
  handleCreateOSMonitor,
  handleDeleteOSMonitor,
  handleGetUnifiedAlerts,
  handleGetAlertDetail,
  handleGetRuleDetail,
} from '../handlers';

const mockDsSvc = {
  list: jest.fn(),
  get: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  testConnection: jest.fn(),
  seed: jest.fn(),
};

const mockAlertSvc = {
  getOSMonitors: jest.fn(),
  getOSMonitor: jest.fn(),
  createOSMonitor: jest.fn(),
  updateOSMonitor: jest.fn(),
  deleteOSMonitor: jest.fn(),
  getOSAlerts: jest.fn(),
  acknowledgeOSAlerts: jest.fn(),
  getPromRuleGroups: jest.fn(),
  getPromAlerts: jest.fn(),
  getUnifiedAlerts: jest.fn(),
  getUnifiedRules: jest.fn(),
  getRuleDetail: jest.fn(),
  getAlertDetail: jest.fn(),
};

const mockClient = {} as never;

describe('handlers', () => {
  // ---- Datasource handlers ----
  it('handleListDatasources returns sanitized datasources', async () => {
    mockDsSvc.list.mockResolvedValueOnce([{ id: 'ds-1', name: 'a', auth: { user: 'x' } }]);
    const result = await handleListDatasources(mockDsSvc as never);
    expect(result.status).toBe(200);
    expect(result.body.datasources[0]).not.toHaveProperty('auth');
  });

  it('handleGetDatasource returns 404 when not found', async () => {
    mockDsSvc.get.mockResolvedValueOnce(null);
    const result = await handleGetDatasource(mockDsSvc as never, 'nope');
    expect(result.status).toBe(404);
  });

  it('handleCreateDatasource validates required fields', async () => {
    const result = await handleCreateDatasource(mockDsSvc as never, {
      name: '',
      type: '' as never,
      url: '',
      enabled: true,
    });
    expect(result.status).toBe(400);
    expect(result.body.error).toMatch(/required/);
  });

  it('handleCreateDatasource rejects invalid type', async () => {
    const result = await handleCreateDatasource(mockDsSvc as never, {
      name: 'x',
      type: 'mysql' as never,
      url: 'http://x',
      enabled: true,
    });
    expect(result.status).toBe(400);
    expect(result.body.error).toMatch(/opensearch or prometheus/);
  });

  it('handleDeleteDatasource returns 404 when not found', async () => {
    mockDsSvc.delete.mockResolvedValueOnce(false);
    const result = await handleDeleteDatasource(mockDsSvc as never, 'nope');
    expect(result.status).toBe(404);
  });

  // ---- Monitor handlers ----
  it('handleGetOSMonitors returns monitors', async () => {
    mockAlertSvc.getOSMonitors.mockResolvedValueOnce([{ id: 'mon-1' }]);
    const result = await handleGetOSMonitors(mockAlertSvc as never, mockClient, 'ds-1');
    expect(result).toEqual({ status: 200, body: { monitors: [{ id: 'mon-1' }] } });
  });

  it('handleCreateOSMonitor returns 201', async () => {
    mockAlertSvc.createOSMonitor.mockResolvedValueOnce({ id: 'mon-1' });
    const result = await handleCreateOSMonitor(mockAlertSvc as never, mockClient, 'ds-1', {
      name: 'test',
    } as never);
    expect(result.status).toBe(201);
  });

  it('handleDeleteOSMonitor returns 404 when not found', async () => {
    mockAlertSvc.deleteOSMonitor.mockResolvedValueOnce(false);
    const result = await handleDeleteOSMonitor(mockAlertSvc as never, mockClient, 'ds-1', 'nope');
    expect(result.status).toBe(404);
  });

  // ---- Unified + Detail ----
  it('handleGetUnifiedAlerts parses query and delegates', async () => {
    mockAlertSvc.getUnifiedAlerts.mockResolvedValueOnce({ results: [] });
    const resolver = jest.fn();
    const result = await handleGetUnifiedAlerts(mockAlertSvc as never, resolver, {
      dsIds: 'a,b',
      maxResults: '10',
    });
    expect(result.status).toBe(200);
    expect(mockAlertSvc.getUnifiedAlerts).toHaveBeenCalledWith(resolver, {
      dsIds: ['a', 'b'],
      timeoutMs: undefined,
      maxResults: 10,
    });
  });

  it('handleGetAlertDetail returns 404 when not found', async () => {
    mockAlertSvc.getAlertDetail.mockResolvedValueOnce(null);
    const result = await handleGetAlertDetail(mockAlertSvc as never, mockClient, 'ds-1', 'nope');
    expect(result.status).toBe(404);
  });

  it('handleGetRuleDetail returns 404 when not found', async () => {
    mockAlertSvc.getRuleDetail.mockResolvedValueOnce(null);
    const result = await handleGetRuleDetail(mockAlertSvc as never, mockClient, 'ds-1', 'nope');
    expect(result.status).toBe(404);
  });
});
