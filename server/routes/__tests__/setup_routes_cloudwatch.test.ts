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
  const request = { headers: {} };

  it('builds no backend without a source', () => {
    setup({ cloudWatch: { isEnabled: async () => true, region: 'us-east-1' } });
    expect(alertingDeps().cwBackend).toBeUndefined();
  });

  it('turns CloudWatch off for a request whose flag is off, without building a source', async () => {
    const factory = jest.fn();
    setup({
      cloudWatch: { isEnabled: async () => false },
      cloudWatchAlarmSourceFactory: factory,
    });
    await expect(alertingDeps().cwBackend(request)).resolves.toBeUndefined();
    expect(factory).not.toHaveBeenCalled();
  });

  it('turns CloudWatch off for a request the source declines', async () => {
    setup({
      cloudWatch: { isEnabled: async () => true },
      cloudWatchAlarmSourceFactory: jest.fn().mockResolvedValue(undefined),
    });
    await expect(alertingDeps().cwBackend(request)).resolves.toBeUndefined();
  });

  it('builds the backend per request over the source when the flag and source agree', async () => {
    const source = {} as CloudWatchAlarmSource;
    const factory = jest.fn().mockReturnValue(source);
    setup({
      cloudWatch: { isEnabled: async () => true, region: 'us-west-2' },
      cloudWatchAlarmSourceFactory: factory,
    });
    const { cwBackend, cloudWatchRegion } = alertingDeps();
    expect(cloudWatchRegion).toBe('us-west-2');
    await expect(cwBackend(request)).resolves.toBeInstanceOf(CloudWatchBackend);
    expect(factory).toHaveBeenCalledWith(request);
  });

  it('leaves the region to the source when none is configured', () => {
    setup({
      cloudWatch: { isEnabled: async () => true },
      cloudWatchAlarmSourceFactory: jest.fn(),
    });
    expect(alertingDeps().cloudWatchRegion).toBeUndefined();
  });
});
