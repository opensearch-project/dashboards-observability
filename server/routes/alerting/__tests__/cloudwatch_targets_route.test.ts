/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * `GET /api/alerting/cloudwatch/targets`: the account scopes and regions the caller may read
 * alarms from. Off → typed 404; on → the source's targets, or one default target synthesized
 * from the configured region; slow (10 s) → classified timeout; failures never echo provider
 * text.
 */
import { registerAlertingRoutes } from '../index';
import { registerDefaultClassifiers } from '../../../../common/error';
import type { CloudWatchTargets } from '../../../../common/types/alerting';

const TARGETS_PATH = '/api/alerting/cloudwatch/targets';

const mockRouter = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
};
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

type Handler = (ctx: unknown, req: unknown, res: unknown) => Promise<unknown>;

function register(deps: { cwBackend?: unknown; cloudWatchRegion?: string }): Handler {
  mockRouter.get.mockClear();
  registerAlertingRoutes(mockRouter as never, {
    osBackend: {} as never,
    promBackend: {} as never,
    mutationSvc: {} as never,
    logger: mockLogger,
    enableMetadataRoutes: false,
    ...(deps as object),
  });
  const call = mockRouter.get.mock.calls.find(
    ([cfg]: [{ path: string }]) => cfg.path === TARGETS_PATH
  );
  if (!call) throw new Error(`route not registered: ${TARGETS_PATH}`);
  return call[1] as Handler;
}

function buildRes() {
  const calls: Record<string, Array<Record<string, unknown>>> = {};
  const make = (key: string) => (arg: Record<string, unknown>) => {
    (calls[key] = calls[key] || []).push(arg);
    return { key, arg };
  };
  return { ok: make('ok'), customError: make('customError'), _calls: calls };
}

/** The classified `errorDetail` of a `customError` response. */
const detailOf = (err: Record<string, unknown>) =>
  (err.body as { attributes: { errorDetail: { category: string; retryable: boolean } } }).attributes
    .errorDetail;

const backendWith = (listTargets: jest.Mock) => async () => ({ listTargets }) as never;

const targets: CloudWatchTargets = {
  regions: [
    { id: 'us-east-1', name: 'US East (N. Virginia)' },
    { id: 'eu-west-1', name: 'Europe (Ireland)' },
  ],
  defaultRegion: 'us-east-1',
  scopes: [
    { label: 'CloudWatch', relation: 'own', defaultRegion: 'us-east-1' },
    { id: 's1', label: 'Production', relation: 'other', defaultRegion: 'eu-west-1' },
  ],
};

describe('GET /api/alerting/cloudwatch/targets', () => {
  beforeAll(() => registerDefaultClassifiers());

  it('returns a typed 404 when CloudWatch is off for the request', async () => {
    const handler = register({ cwBackend: async () => undefined });
    const res = buildRes();
    await handler({}, {}, res);
    expect(res._calls.ok).toBeUndefined();
    const err = res._calls.customError[0];
    expect(err.statusCode).toBe(404);
    expect(detailOf(err).category).toBe('NOT_FOUND');
  });

  it("returns the source's targets, passing an abort signal", async () => {
    const listTargets = jest.fn(async () => targets);
    const handler = register({ cwBackend: backendWith(listTargets) });
    const res = buildRes();
    await handler({}, {}, res);
    expect(res._calls.ok[0].body).toBe(targets);
    expect(listTargets).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
  });

  it('synthesizes one default target in the configured region', async () => {
    const handler = register({
      cwBackend: backendWith(jest.fn(async () => undefined)),
      cloudWatchRegion: 'us-west-2',
    });
    const res = buildRes();
    await handler({}, {}, res);
    expect(res._calls.ok[0].body).toEqual({
      regions: [{ id: 'us-west-2', name: 'us-west-2' }],
      defaultRegion: 'us-west-2',
      scopes: [{ label: 'CloudWatch', relation: 'own', defaultRegion: 'us-west-2' }],
    });
  });

  it('synthesizes one default target with no regions when none is configured', async () => {
    const handler = register({ cwBackend: backendWith(jest.fn(async () => undefined)) });
    const res = buildRes();
    await handler({}, {}, res);
    expect(JSON.parse(JSON.stringify(res._calls.ok[0].body))).toEqual({
      regions: [],
      scopes: [{ label: 'CloudWatch', relation: 'own' }],
    });
  });

  describe('timeout', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('gives a classified 504 timeout after 10 s', async () => {
      const handler = register({
        cwBackend: backendWith(jest.fn(() => new Promise<never>(() => {}))),
      });
      const res = buildRes();
      const done = handler({}, {}, res);
      await jest.advanceTimersByTimeAsync(10_000);
      await done;
      expect(res._calls.ok).toBeUndefined();
      // Same classification as the CloudWatch detail routes' timeout.
      expect(res._calls.customError[0].statusCode).toBe(504);
      const detail = detailOf(res._calls.customError[0]);
      expect(detail.category).toBe('TIMEOUT');
      expect(detail.retryable).toBe(true);
    });
  });

  it('never returns provider text', async () => {
    const providerError = Object.assign(
      new Error('User: arn:aws:sts::123456789012:assumed-role/Admin/me is not authorized'),
      { name: 'AccessDeniedException', $metadata: { httpStatusCode: 403 } }
    );
    const handler = register({
      cwBackend: backendWith(jest.fn(async () => Promise.reject(providerError))),
    });
    const res = buildRes();
    await handler({}, {}, res);
    const err = res._calls.customError[0];
    expect(err.statusCode).toBe(403);
    expect(detailOf(err).category).toBe('PERMISSION_DENIED');
    expect(JSON.stringify(err.body)).not.toContain('123456789012');
  });
});
