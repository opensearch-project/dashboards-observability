/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase-5 Alertmanager handler tests.
 *
 * After the route reduction only `handleGetAlertmanagerConfig` and the
 * shared `extractReceiverIntegrations` helper remain in
 * `alertmanager_handlers.ts`. The other six AM admin handlers (alerts,
 * silences CRUD, status, receivers, alert-groups) moved out — the upstream
 * `query_enhancements` resource manager covers them once it exposes
 * STATUS/RECEIVERS/SILENCES/ALERTS resource types.
 */

import type {
  AlertingOSClient,
  Datasource,
  PrometheusBackend,
} from '../../../../common/types/alerting';
import { extractReceiverIntegrations, handleGetAlertmanagerConfig } from '../alertmanager_handlers';

const mockClient = ({} as unknown) as AlertingOSClient;
const mockDs: Datasource = {
  id: 'ds-prom',
  name: 'prom',
  type: 'prometheus',
  url: '',
  enabled: true,
  directQueryName: 'prom',
};

/** Build a PrometheusBackend mock where `getAlertmanagerStatus` is overridable. */
function makeBackend(overrides: Record<string, jest.Mock> = {}): PrometheusBackend {
  const base: Record<string, jest.Mock> = {
    getAlertmanagerStatus: jest.fn(),
  };
  return ({ ...base, ...overrides } as unknown) as PrometheusBackend;
}

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
    expect(extractReceiverIntegrations({})).toEqual([{ type: 'none', summary: 'No integrations' }]);
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
    const result = await handleGetAlertmanagerConfig(backend, mockClient, mockDs);
    expect(result.status).toBe(200);
    expect(result.body.available).toBe(true);
    expect(result.body.code).toBe('ok');
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
    const result = await handleGetAlertmanagerConfig(backend, mockClient, mockDs);
    expect(result.status).toBe(200);
    expect(result.body.available).toBe(true);
    expect(result.body.config).toBeUndefined();
    expect(result.body.configParseError).toMatch(/Failed to parse YAML/);
  });

  it('returns available:false with code=not_configured when backend cannot provide Alertmanager status', async () => {
    const backend = ({} as unknown) as PrometheusBackend;
    const result = await handleGetAlertmanagerConfig(backend, mockClient, mockDs);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      available: false,
      code: 'not_configured',
      error: 'Alertmanager not configured',
    });
  });

  it('maps upstream 401 to HTTP 401 with code=unauthorized and a safe message', async () => {
    const err = Object.assign(new Error('auth header missing in upstream'), { statusCode: 401 });
    const backend = makeBackend({
      getAlertmanagerStatus: jest.fn().mockRejectedValue(err),
    });
    const result = await handleGetAlertmanagerConfig(backend, mockClient, mockDs);
    expect(result.status).toBe(401);
    expect(result.body).toEqual({
      available: false,
      code: 'unauthorized',
      error: 'Unauthorized',
    });
    // The original "auth header missing in upstream" must NOT appear in the response.
    expect(JSON.stringify(result.body)).not.toContain('auth header missing');
  });

  it('maps upstream 403 to HTTP 403 with code=unauthorized', async () => {
    const err = Object.assign(new Error('forbidden'), { statusCode: 403 });
    const backend = makeBackend({
      getAlertmanagerStatus: jest.fn().mockRejectedValue(err),
    });
    const result = await handleGetAlertmanagerConfig(backend, mockClient, mockDs);
    expect(result.status).toBe(403);
    expect(result.body.code).toBe('unauthorized');
    expect(result.body.error).toBe('Forbidden');
  });

  it('maps a generic upstream failure to HTTP 500 with code=upstream_error and a sanitized message', async () => {
    const backend = makeBackend({
      getAlertmanagerStatus: jest
        .fn()
        .mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.42:9093')),
    });
    const result = await handleGetAlertmanagerConfig(backend, mockClient, mockDs);
    expect(result.status).toBe(500);
    expect(result.body.code).toBe('upstream_error');
    expect(result.body.error).toBe('Failed to fetch Alertmanager config');
    // The IP address from the thrown error must not appear in the response.
    expect(JSON.stringify(result.body)).not.toContain('10.0.0.42');
  });
});
