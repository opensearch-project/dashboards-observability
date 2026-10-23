/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CloudWatch alarms need both the config flag and a deployment-provided source: this plugin
 * ships no AWS SDK, so with no source the CloudWatch backend is never built.
 */
const mockRegisterAlertingRoutes = jest.fn();
jest.mock('../alerting', () => ({
  registerAlertingRoutes: (...args: unknown[]) => mockRegisterAlertingRoutes(...args),
}));

import { setupRoutes } from '../index';
import { CloudWatchBackend } from '../../services/alerting/cloudwatch/cloudwatch_backend';
import type { CloudWatchAlarmSource } from '../../services/alerting/cloudwatch/types';

const router = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  patch: jest.fn(),
  handleLegacyErrors: (handler: unknown) => handler,
};
const client = { asScoped: jest.fn(), callAsInternalUser: jest.fn() };
const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

function alertingDeps() {
  return mockRegisterAlertingRoutes.mock.calls[0][1];
}

function setup(extra: Record<string, unknown>) {
  setupRoutes({
    router: router as never,
    client: client as never,
    dataSourceEnabled: false,
    logger: logger as never,
    ...extra,
  });
}

beforeEach(() => jest.clearAllMocks());

describe('setupRoutes CloudWatch alarms', () => {
  it('stays off with the flag but no source', () => {
    setup({ cloudWatch: { enabled: true, region: 'us-east-1' } });
    expect(alertingDeps().cwBackend).toBeUndefined();
    expect(alertingDeps().cloudWatch).toEqual({ enabled: false, region: 'us-east-1' });
  });

  it('stays off with a source but no flag', () => {
    setup({
      cloudWatch: { enabled: false, region: 'us-east-1' },
      cloudWatchAlarmSourceFactory: jest.fn(),
    });
    expect(alertingDeps().cwBackend).toBeUndefined();
  });

  it('builds the backend per request over the source when both are present', () => {
    const source = {} as CloudWatchAlarmSource;
    const factory = jest.fn().mockReturnValue(source);
    setup({
      cloudWatch: { enabled: true, region: 'us-west-2' },
      cloudWatchAlarmSourceFactory: factory,
    });
    const { cwBackend, cloudWatch } = alertingDeps();
    expect(cloudWatch).toEqual({ enabled: true, region: 'us-west-2' });
    expect(typeof cwBackend).toBe('function');
    const request = { headers: {} };
    expect(cwBackend(request)).toBeInstanceOf(CloudWatchBackend);
    expect(factory).toHaveBeenCalledWith(request);
  });
});
