/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `withRouteTimeout`: the CloudWatch detail routes' upper bound. It must reject with a
 * `TimeoutError` and abort the signal handed to the source, on timeout or client disconnect.
 */
import { Subject } from 'rxjs';
import { withRouteTimeout } from '../index';
import { TimeoutError } from '../../../services/alerting/timeout_error';

function fakeRequest() {
  const aborted$ = new Subject<void>();
  return { request: { events: { aborted$ } } as never, aborted$ };
}

/** A unit of work that never settles on its own, recording the signal it was given. */
function pendingWork() {
  const seen: { signal?: AbortSignal } = {};
  const work = (signal: AbortSignal) => {
    seen.signal = signal;
    return new Promise<never>(() => {});
  };
  return { work, seen };
}

describe('withRouteTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns the result and leaves the signal alone when the work finishes in time', async () => {
    const { request, aborted$ } = fakeRequest();
    let signal: AbortSignal | undefined;
    const result = await withRouteTimeout(
      request,
      async (s) => {
        signal = s;
        return 'ok';
      },
      1000,
      'test'
    );
    expect(result).toBe('ok');
    expect(signal?.aborted).toBe(false);
    // Unsubscribed once settled: a later disconnect no longer aborts.
    aborted$.next();
    expect(signal?.aborted).toBe(false);
  });

  it('rejects with a TimeoutError and aborts the signal when the work takes too long', async () => {
    const { request } = fakeRequest();
    const { work, seen } = pendingWork();
    const result = withRouteTimeout(request, work, 1000, 'CloudWatch alarm detail');
    jest.advanceTimersByTime(1000);
    await expect(result).rejects.toBeInstanceOf(TimeoutError);
    expect(seen.signal?.aborted).toBe(true);
  });

  it('aborts the signal when the client disconnects', () => {
    const { request, aborted$ } = fakeRequest();
    const { work, seen } = pendingWork();
    void withRouteTimeout(request, work, 1000, 'test').catch(() => undefined);
    expect(seen.signal?.aborted).toBe(false);
    aborted$.next();
    expect(seen.signal?.aborted).toBe(true);
  });
});
