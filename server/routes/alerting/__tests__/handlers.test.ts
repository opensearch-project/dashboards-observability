/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Post-Phase-3/5 handler tests. The 6 datasource-CRUD handlers
 * (`handleListDatasources`, `handleGet/Create/Update/Delete/TestDatasource`)
 * are no longer exercised — datasource discovery moved to the client via
 * `useDatasources` and direct saved-object queries. The handlers may still
 * be present as dead exports in `handlers.ts`; they are no longer wired by
 * `registerAlertingRoutes` and no longer have test coverage here.
 *
 * Surviving handlers: monitor CRUD, alerts, unified views, and detail
 * views. Those are what this file covers.
 */

import {
  handleGetOSMonitors,
  handleCreateOSMonitor,
  handleDeleteOSMonitor,
  handleGetUnifiedAlerts,
  handleGetAlertDetail,
  handleGetRuleDetail,
} from '../handlers';

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
