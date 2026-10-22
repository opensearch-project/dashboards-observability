/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for the synthetic-request builder used by every server-initiated
 * PromQL read. The fix forwards the inbound request opaquely so the search
 * strategy's `client.asScoped(request)` carries the caller's auth; the core
 * mechanism is `buildSearchRequest` spreading `sourceRequest` and then
 * overriding `body` / `dataSourceId`. These tests pin that contract:
 *   - the forwarded request's auth context (`headers`, `auth`) survives,
 *   - the synthetic `body` and the server-chosen `dataSourceId` always win
 *     over any same-named field carried on `sourceRequest`,
 *   - an absent `sourceRequest` yields just `{ body, dataSourceId? }`.
 *
 * `buildSearchRequest` is private, so we exercise it through the public
 * `runPromQLInstant` / `runPromQLRange` entry points and capture the request
 * object handed to the injected searcher.
 */

import {
  nameFromSeries,
  runPromQLInstant,
  runPromQLRange,
  setPromQLSearcher,
  resetPromQLSearcherForTests,
} from '../promql_search';
import type { PromQLSearcher } from '../promql_search';
import type { RequestHandlerContext } from '../../../../../../src/core/server';

const ctx = {} as RequestHandlerContext;

/** Capture the request + options the searcher receives. */
function captureSearcher(): {
  searcher: PromQLSearcher;
  calls: () => Array<{ request: Record<string, unknown>; options: { strategy: string } }>;
} {
  const recorded: Array<{ request: Record<string, unknown>; options: { strategy: string } }> = [];
  const searcher = (async (_c, request, options) => {
    recorded.push({ request: request as Record<string, unknown>, options });
    // Minimal well-formed empty envelope so rebuildEnvelope doesn't throw.
    return ({ type: 'data_frame', body: { fields: [] } } as unknown) as never;
  }) as PromQLSearcher;
  return { searcher, calls: () => recorded };
}

beforeEach(() => resetPromQLSearcherForTests());
afterEach(() => resetPromQLSearcherForTests());

describe('buildSearchRequest (via runPromQLInstant/runPromQLRange)', () => {
  it('forwards the inbound request auth context (headers AND auth) onto the search request', async () => {
    const cap = captureSearcher();
    setPromQLSearcher(cap.searcher);
    const sourceRequest = {
      headers: { authorization: 'Bearer tok', 'x-custom-auth': 'abc' },
      auth: { isAuthenticated: true },
    } as never;

    await runPromQLInstant(ctx, {
      dqName: 'conn',
      query: 'vector(1)',
      timeSec: 100,
      sourceRequest,
    });

    const { request, options } = cap.calls()[0];
    expect(options.strategy).toBe('promql');
    expect(request.headers).toEqual({ authorization: 'Bearer tok', 'x-custom-auth': 'abc' });
    expect(request.auth).toEqual({ isAuthenticated: true });
    // The synthetic PromQL payload is present alongside the forwarded auth.
    expect((request.body as { query: { query: string } }).query.query).toBe('vector(1)');
    expect(request.dataSourceId).toBeUndefined(); // none passed
  });

  it('overrides body and dataSourceId even if the forwarded request carries its own', async () => {
    const cap = captureSearcher();
    setPromQLSearcher(cap.searcher);
    // A hostile/odd inbound request that happens to carry body + dataSourceId —
    // the synthetic values must win so datasource routing and the query can't
    // be hijacked by the caller's request shape.
    const sourceRequest = {
      headers: { authorization: 'Bearer tok' },
      body: { query: { query: 'DROP', language: 'PROMQL' } },
      dataSourceId: 'attacker-ds',
    } as never;

    await runPromQLRange(ctx, {
      dqName: 'conn',
      query: 'rate(x[5m])',
      startSec: 1,
      endSec: 2,
      stepSec: 1,
      dataSourceId: 'server-ds',
      sourceRequest,
    });

    const { request } = cap.calls()[0];
    // body is the synthetic PromQL body, NOT the forwarded one.
    expect((request.body as { query: { query: string } }).query.query).toBe('rate(x[5m])');
    // dataSourceId is the server-chosen one, NOT the forwarded one.
    expect(request.dataSourceId).toBe('server-ds');
    // Auth context still forwarded.
    expect(request.headers).toEqual({ authorization: 'Bearer tok' });
  });

  it('yields just { body, dataSourceId? } when no sourceRequest is provided', async () => {
    const cap = captureSearcher();
    setPromQLSearcher(cap.searcher);

    await runPromQLInstant(ctx, {
      dqName: 'conn',
      query: 'up',
      timeSec: 100,
      dataSourceId: 'ds-1',
      // no sourceRequest
    });

    const { request } = cap.calls()[0];
    expect(request.headers).toBeUndefined();
    expect(request.auth).toBeUndefined();
    expect(request.dataSourceId).toBe('ds-1');
    expect((request.body as { query: { query: string } }).query.query).toBe('up');
    // Only the expected keys are present.
    expect(Object.keys(request).sort()).toEqual(['body', 'dataSourceId']);
  });
});

describe('nameFromSeries', () => {
  it('reads the name prefix of the current `name{labels}` shape', () => {
    expect(nameFromSeries('slo:sli_error:ratio_rate_3d:sli_ab12{slo_window="3d"}')).toBe(
      'slo:sli_error:ratio_rate_3d:sli_ab12'
    );
  });

  it('reads a bare name with no labels', () => {
    expect(nameFromSeries('up{}')).toBe('up');
    expect(nameFromSeries('up')).toBe('up');
  });

  it('reads `__name__` from the older `{__name__="...", ...}` shape', () => {
    expect(nameFromSeries('{__name__="slo:x", slo_window="3d"}')).toBe('slo:x');
    expect(nameFromSeries('{job="a", __name__="slo:x"}')).toBe('slo:x');
  });

  it('returns empty for an aggregation result that has no metric name', () => {
    expect(nameFromSeries('{}')).toBe('');
    expect(nameFromSeries('{job="a"}')).toBe('');
    expect(nameFromSeries('')).toBe('');
  });

  it('does not mistake a label value containing `__name__=` for the name', () => {
    expect(nameFromSeries('real_metric{path="__name__=\\"fake\\""}')).toBe('real_metric');
  });

  it('undoes Vega bracket escaping and the multi-query label prefix', () => {
    expect(nameFromSeries('A: slo:x{path="/a\\[0\\]"}')).toBe('slo:x');
    expect(nameFromSeries('A: {__name__="slo:x"}')).toBe('slo:x');
  });
});

describe('runPromQLInstant envelope rebuild', () => {
  function frame(rows: Array<{ series: string; labels: Record<string, string>; value: number }>) {
    return ({
      type: 'data_frame',
      body: {
        fields: [
          { name: 'Time', values: rows.map(() => 1_700_000_000_000) },
          { name: 'Series', values: rows.map((r) => r.series) },
          { name: 'Labels', values: rows.map((r) => r.labels) },
          { name: 'Value', values: rows.map((r) => r.value) },
        ],
      },
    } as unknown) as never;
  }

  it.each([
    ['current', 'slo:sli_error:ratio_rate_3d:sli_ab12{slo_window="3d"}'],
    ['older', '{__name__="slo:sli_error:ratio_rate_3d:sli_ab12", slo_window="3d"}'],
  ])('restores __name__ on each sample for the %s Series shape', async (_shape, series) => {
    setPromQLSearcher((async () =>
      frame([{ series, labels: { slo_window: '3d' }, value: 0.25 }])) as PromQLSearcher);
    const env = await runPromQLInstant(ctx, { dqName: 'ds', query: 'q', timeSec: 1 });
    const result = (env as { results: Record<string, { result: unknown[] }> }).results.ds.result;
    expect(result).toEqual([
      {
        metric: { __name__: 'slo:sli_error:ratio_rate_3d:sli_ab12', slo_window: '3d' },
        value: [1_700_000_000, '0.25'],
      },
    ]);
  });

  it('keeps NaN samples so callers can tell an idle source from a missing rule', async () => {
    setPromQLSearcher((async () =>
      frame([{ series: 'slo:x{}', labels: {}, value: Number.NaN }])) as PromQLSearcher);
    const env = await runPromQLInstant(ctx, { dqName: 'ds', query: 'q', timeSec: 1 });
    const result = (env as { results: Record<string, { result: Array<{ value: unknown }> }> })
      .results.ds.result;
    expect(result).toHaveLength(1);
    expect(result[0].value).toEqual([1_700_000_000, 'NaN']);
  });
});
