/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AlertingOSClient,
  AlertmanagerSilence,
  PrometheusBackend,
} from '../../../../common/types/alerting';
import {
  extractReceiverIntegrations,
  handleCreateAlertmanagerSilence,
  handleDeleteAlertmanagerSilence,
  handleGetAlertmanagerAlertGroups,
  handleGetAlertmanagerAlerts,
  handleGetAlertmanagerConfig,
  handleGetAlertmanagerReceivers,
  handleGetAlertmanagerSilences,
  handleGetAlertmanagerStatus,
} from '../alertmanager_handlers';

const mockClient = ({} as unknown) as AlertingOSClient;

/** Build a PrometheusBackend mock where every Alertmanager method is a jest.fn (so handlers pass the 501 guard). */
function makeBackend(overrides: Record<string, jest.Mock> = {}): PrometheusBackend {
  const base: Record<string, jest.Mock> = {
    getAlertmanagerAlerts: jest.fn(),
    getSilences: jest.fn(),
    createSilence: jest.fn(),
    deleteSilence: jest.fn(),
    getAlertmanagerStatus: jest.fn(),
    getAlertmanagerReceivers: jest.fn(),
    getAlertmanagerAlertGroups: jest.fn(),
  };
  return ({ ...base, ...overrides } as unknown) as PrometheusBackend;
}

describe('alertmanager_handlers', () => {
  describe('handleGetAlertmanagerAlerts', () => {
    it('returns 200 with alerts from the backend', async () => {
      const alerts = [{ fingerprint: 'abc', labels: { alertname: 'HighCpu' } }];
      const backend = makeBackend({ getAlertmanagerAlerts: jest.fn().mockResolvedValue(alerts) });
      const result = await handleGetAlertmanagerAlerts(backend, mockClient);
      expect(result).toEqual({ status: 200, body: { alerts } });
    });

    it('returns 501 when backend lacks Alertmanager support', async () => {
      const backend = ({ getSilences: jest.fn() } as unknown) as PrometheusBackend;
      const result = await handleGetAlertmanagerAlerts(backend, mockClient);
      expect(result.status).toBe(501);
      expect(result.body).toEqual({ error: 'Alertmanager not configured' });
    });

    it('routes upstream errors through toHandlerResult', async () => {
      const backend = makeBackend({
        getAlertmanagerAlerts: jest.fn().mockRejectedValue(new Error('alertmanager not found')),
      });
      const result = await handleGetAlertmanagerAlerts(backend, mockClient);
      expect(result.status).toBe(404);
      expect(result.body).toEqual({ error: 'alertmanager not found' });
    });
  });

  describe('handleGetAlertmanagerSilences', () => {
    it('returns silences from the backend', async () => {
      const silences = [{ id: 's1', status: { state: 'active' } }];
      const backend = makeBackend({ getSilences: jest.fn().mockResolvedValue(silences) });
      const result = await handleGetAlertmanagerSilences(backend, mockClient);
      expect(result).toEqual({ status: 200, body: { silences } });
    });
  });

  describe('handleCreateAlertmanagerSilence', () => {
    it('forwards body to backend and returns the silence id', async () => {
      const createSilence = jest.fn().mockResolvedValue('silence-42');
      const backend = makeBackend({ createSilence });
      const silence: AlertmanagerSilence = {
        createdBy: 'alice',
        comment: 'maintenance',
        startsAt: '2026-04-23T00:00:00Z',
        endsAt: '2026-04-23T02:00:00Z',
        matchers: [{ name: 'env', value: 'staging', isRegex: false, isEqual: true }],
      };
      const result = await handleCreateAlertmanagerSilence(backend, mockClient, silence);
      expect(createSilence).toHaveBeenCalledWith(mockClient, silence);
      expect(result).toEqual({ status: 200, body: { silenceID: 'silence-42' } });
    });

    it('surfaces validation errors from the backend as 400', async () => {
      const backend = makeBackend({
        createSilence: jest.fn().mockRejectedValue(new Error('matchers: required field')),
      });
      const result = await handleCreateAlertmanagerSilence(backend, mockClient, {
        createdBy: '',
        comment: '',
        startsAt: '',
        endsAt: '',
        matchers: [],
      });
      expect(result.status).toBe(400);
    });
  });

  describe('handleDeleteAlertmanagerSilence', () => {
    it('forwards the id to backend and returns success flag', async () => {
      const deleteSilence = jest.fn().mockResolvedValue(true);
      const backend = makeBackend({ deleteSilence });
      const result = await handleDeleteAlertmanagerSilence(backend, mockClient, 'silence-42');
      expect(deleteSilence).toHaveBeenCalledWith(mockClient, 'silence-42');
      expect(result).toEqual({ status: 200, body: { success: true } });
    });
  });

  describe('handleGetAlertmanagerStatus', () => {
    it('returns the status body verbatim', async () => {
      const status = { cluster: { status: 'ready', peers: [] }, uptime: '1h' };
      const backend = makeBackend({ getAlertmanagerStatus: jest.fn().mockResolvedValue(status) });
      const result = await handleGetAlertmanagerStatus(backend, mockClient);
      expect(result).toEqual({ status: 200, body: status });
    });
  });

  describe('handleGetAlertmanagerReceivers', () => {
    it('wraps receivers in a receivers key', async () => {
      const receivers = [{ name: 'default', integrations: [] }];
      const backend = makeBackend({
        getAlertmanagerReceivers: jest.fn().mockResolvedValue(receivers),
      });
      const result = await handleGetAlertmanagerReceivers(backend, mockClient);
      expect(result).toEqual({ status: 200, body: { receivers } });
    });

    it('returns 501 when backend has no receivers method', async () => {
      const backend = ({} as unknown) as PrometheusBackend;
      const result = await handleGetAlertmanagerReceivers(backend, mockClient);
      expect(result.status).toBe(501);
      expect(result.body).toEqual({ error: 'Alertmanager receivers not available' });
    });
  });

  describe('handleGetAlertmanagerAlertGroups', () => {
    it('wraps groups in a groups key', async () => {
      const groups = [{ labels: { alertname: 'A' }, alerts: [] }];
      const backend = makeBackend({
        getAlertmanagerAlertGroups: jest.fn().mockResolvedValue(groups),
      });
      const result = await handleGetAlertmanagerAlertGroups(backend, mockClient);
      expect(result).toEqual({ status: 200, body: { groups } });
    });
  });

  describe('extractReceiverIntegrations', () => {
    it('summarises slack, email, pagerduty, and webhook configs', () => {
      expect(
        extractReceiverIntegrations({
          slack_configs: [{ channel: '#ops' }],
          email_configs: [{ to: 'oncall@example.com' }],
          pagerduty_configs: [{ service_key: 'pd-key-123' }],
          webhook_configs: [{ url: 'https://example.com/hook' }],
        })
      ).toEqual([
        { type: 'webhook', summary: 'https://example.com/hook' },
        { type: 'slack', summary: '#ops' },
        { type: 'email', summary: 'oncall@example.com' },
        { type: 'pagerduty', summary: 'pd-key-123' },
      ]);
    });

    it('falls back to type name for unknown config types and returns "none" when empty', () => {
      expect(extractReceiverIntegrations({ telegram_configs: [{}] })).toEqual([
        { type: 'telegram', summary: 'telegram' },
      ]);
      expect(extractReceiverIntegrations({})).toEqual([
        { type: 'none', summary: 'No integrations' },
      ]);
    });
  });

  describe('handleGetAlertmanagerConfig', () => {
    const validYaml = `
global:
  resolve_timeout: 5m
route:
  receiver: default
  group_by: ['alertname']
receivers:
  - name: default
    slack_configs:
      - channel: '#ops-alerts'
        api_url: 'https://hooks.slack.com/x'
  - name: email-team
    email_configs:
      - to: 'team@example.com'
inhibit_rules: []
`;

    it('parses a valid Alertmanager YAML config into structured form', async () => {
      const backend = makeBackend({
        getAlertmanagerStatus: jest.fn().mockResolvedValue({
          config: { original: validYaml },
          cluster: { status: 'ready', peers: ['a', 'b'] },
          uptime: '2h',
          versionInfo: { version: '0.27.0' },
        }),
      });
      const result = await handleGetAlertmanagerConfig(backend, mockClient);
      expect(result.status).toBe(200);
      expect(result.body.available).toBe(true);
      expect(result.body.cluster).toEqual({
        status: 'ready',
        peers: ['a', 'b'],
        peerCount: 2,
      });
      expect(result.body.configParseError).toBeUndefined();
      expect(result.body.config.receivers).toEqual([
        { name: 'default', integrations: [{ type: 'slack', summary: '#ops-alerts' }] },
        { name: 'email-team', integrations: [{ type: 'email', summary: 'team@example.com' }] },
      ]);
      expect(result.body.raw).toBe(validYaml);
    });

    it('captures a configParseError on malformed YAML but still returns 200', async () => {
      const backend = makeBackend({
        getAlertmanagerStatus: jest.fn().mockResolvedValue({
          config: { original: 'route:\n  receiver: default\n  bad: [unclosed' },
          cluster: { status: 'ready', peers: [] },
        }),
      });
      const result = await handleGetAlertmanagerConfig(backend, mockClient);
      expect(result.status).toBe(200);
      expect(result.body.available).toBe(true);
      expect(result.body.config).toBeUndefined();
      expect(result.body.configParseError).toMatch(/Failed to parse YAML/);
    });

    it('returns available:false when backend cannot provide Alertmanager status', async () => {
      const backend = ({} as unknown) as PrometheusBackend;
      const result = await handleGetAlertmanagerConfig(backend, mockClient);
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ available: false, error: 'Alertmanager not configured' });
    });

    it('returns available:false with message when upstream throws', async () => {
      const backend = makeBackend({
        getAlertmanagerStatus: jest.fn().mockRejectedValue(new Error('connection refused')),
      });
      const result = await handleGetAlertmanagerConfig(backend, mockClient);
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ available: false, error: 'connection refused' });
    });
  });
});
