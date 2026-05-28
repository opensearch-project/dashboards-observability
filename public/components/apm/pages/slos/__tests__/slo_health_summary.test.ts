/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import type { SloApiClient } from '../slo_api_client';
import type { PaginatedResponse } from '../../../../../../common/types/alerting';
import type { SloHealthState, SloSummary } from '../../../../../../common/slo/slo_types';
import {
  __resetAggregateFallbackLatchForTests,
  classifySloKind,
  rollupSloHealth,
  useServiceSloHealth,
} from '../slo_health_summary';
import type { SloAggregateResponse } from '../../../../../../common/slo/slo_types';

function makeSummary(
  overrides: Partial<SloSummary> & Pick<SloSummary, 'id' | 'service'>
): SloSummary {
  const { id, service, status, name, ...rest } = overrides;
  const state: SloHealthState = status?.state ?? 'ok';
  return {
    id,
    datasourceId: 'ds-1',
    datasourceType: 'prometheus',
    name: name ?? id,
    enabled: true,
    mode: 'active',
    service,
    owner: { teams: [] },
    sliNodeType: 'single',
    sliBackend: 'prometheus',
    sliLeafType: 'availability',
    objectiveCount: 1,
    worstTarget: 0.99,
    window: { type: 'rolling', duration: '28d' },
    labels: {},
    status: {
      sloId: id,
      objectives: [],
      state,
      firingCount: 0,
      ruleCount: 1,
      computedAt: '2026-05-01T00:00:00Z',
      ...(status ?? {}),
    },
    ...rest,
  } as SloSummary;
}

describe('classifySloKind (heuristic)', () => {
  it('maps prometheus + availability leaf to apm-availability', () => {
    const slo = makeSummary({
      id: 'a',
      service: 'foo',
      sliBackend: 'prometheus',
      sliLeafType: 'availability',
    });
    expect(classifySloKind(slo)).toBe('apm-availability');
  });

  it('maps prometheus + latency_threshold leaf to apm-latency', () => {
    const slo = makeSummary({
      id: 'a',
      service: 'foo',
      sliBackend: 'prometheus',
      sliLeafType: 'latency_threshold',
    });
    expect(classifySloKind(slo)).toBe('apm-latency');
  });

  it('returns undefined for opensearch-backed SLIs', () => {
    const slo = makeSummary({
      id: 'a',
      service: 'foo',
      sliBackend: 'opensearch',
      sliLeafType: 'availability',
    });
    expect(classifySloKind(slo)).toBeUndefined();
  });

  it('returns undefined for unknown leaf types', () => {
    const slo = makeSummary({
      id: 'a',
      service: 'foo',
      sliBackend: 'prometheus',
      sliLeafType: 'error_count',
    });
    expect(classifySloKind(slo)).toBeUndefined();
  });

  it('prefers a stored canonicalKind tag over the heuristic', () => {
    // Heuristic would say apm-latency (latency_threshold leaf); the tag wins.
    const slo = makeSummary({
      id: 'tagged',
      service: 'foo',
      sliBackend: 'prometheus',
      sliLeafType: 'latency_threshold',
      canonicalKind: 'apm-availability',
    });
    expect(classifySloKind(slo)).toBe('apm-availability');
  });

  it('returns the full suggestion kind when canonicalKind is a non-APM tag', () => {
    const slo = makeSummary({
      id: 'tagged',
      service: 'foo',
      sliBackend: 'prometheus',
      sliLeafType: 'availability',
      canonicalKind: 'http-availability',
    });
    expect(classifySloKind(slo)).toBe('http-availability');
  });
});

describe('rollupSloHealth', () => {
  it('returns empty per-service buckets with missingCanonicalPair=true', () => {
    const { bySvc, aggregate } = rollupSloHealth(['foo', 'bar'], []);
    expect(bySvc.get('foo')).toMatchObject({
      total: 0,
      hasAvailability: false,
      hasLatency: false,
      missingCanonicalPair: true,
    });
    expect(bySvc.get('bar')).toBeDefined();
    expect(aggregate.total).toBe(0);
    expect(aggregate.missingCanonicalPair).toBe(true);
  });

  it('counts state buckets using the `no_data` underscore value', () => {
    const summaries = [
      makeSummary({ id: 'a', service: 'foo', status: { state: 'ok' } as any }),
      makeSummary({ id: 'b', service: 'foo', status: { state: 'no_data' } as any }),
      makeSummary({ id: 'c', service: 'foo', status: { state: 'breached' } as any }),
    ];
    const { bySvc, aggregate } = rollupSloHealth(['foo'], summaries);
    const foo = bySvc.get('foo')!;
    expect(foo).toMatchObject({ total: 3, ok: 1, noData: 1, breached: 1 });
    expect(aggregate).toMatchObject({ total: 3, ok: 1, noData: 1, breached: 1 });
  });

  it('detects a complete canonical pair', () => {
    const summaries = [
      makeSummary({
        id: 'a',
        service: 'foo',
        sliBackend: 'prometheus',
        sliLeafType: 'availability',
      }),
      makeSummary({
        id: 'b',
        service: 'foo',
        sliBackend: 'prometheus',
        sliLeafType: 'latency_threshold',
      }),
    ];
    const { bySvc, aggregate } = rollupSloHealth(['foo'], summaries);
    expect(bySvc.get('foo')).toMatchObject({
      hasAvailability: true,
      hasLatency: true,
      missingCanonicalPair: false,
    });
    expect(aggregate.missingCanonicalPair).toBe(false);
  });

  it('flags aggregate missingCanonicalPair when any service is incomplete', () => {
    const summaries = [
      makeSummary({
        id: 'a',
        service: 'foo',
        sliBackend: 'prometheus',
        sliLeafType: 'availability',
      }),
      makeSummary({
        id: 'b',
        service: 'foo',
        sliBackend: 'prometheus',
        sliLeafType: 'latency_threshold',
      }),
      makeSummary({
        id: 'c',
        service: 'bar',
        sliBackend: 'prometheus',
        sliLeafType: 'availability',
      }),
    ];
    const { bySvc, aggregate } = rollupSloHealth(['foo', 'bar'], summaries);
    expect(bySvc.get('foo')!.missingCanonicalPair).toBe(false);
    expect(bySvc.get('bar')!.missingCanonicalPair).toBe(true);
    expect(aggregate.missingCanonicalPair).toBe(true);
  });

  it('counts non-APM suggestion kinds toward hasAvailability / hasLatency by suffix', () => {
    // Decision: for canonical-pair purposes, any *-availability or *-latency
    // tag counts toward the corresponding side. So an HTTP availability SLO
    // + an RPC latency SLO completes the pair for a service — the pair is
    // "one of each kind of thing," not "an APM-specific availability and
    // latency SLO."
    const summaries = [
      makeSummary({
        id: 'a',
        service: 'foo',
        canonicalKind: 'http-availability',
        // Give the heuristic a reason to disagree — the tag must win.
        sliBackend: 'prometheus',
        sliLeafType: 'custom',
      }),
      makeSummary({
        id: 'b',
        service: 'foo',
        canonicalKind: 'rpc-latency',
        sliBackend: 'prometheus',
        sliLeafType: 'custom',
      }),
    ];
    const { bySvc } = rollupSloHealth(['foo'], summaries);
    expect(bySvc.get('foo')).toMatchObject({
      hasAvailability: true,
      hasLatency: true,
      missingCanonicalPair: false,
    });
  });

  it('falls back to the heuristic when canonicalKind is absent', () => {
    // Legacy SLO without a stored tag — heuristic classifies from sliLeafType.
    const summaries = [
      makeSummary({
        id: 'legacy',
        service: 'foo',
        sliBackend: 'prometheus',
        sliLeafType: 'availability',
      }),
    ];
    const { bySvc } = rollupSloHealth(['foo'], summaries);
    expect(bySvc.get('foo')).toMatchObject({
      hasAvailability: true,
      hasLatency: false,
    });
  });

  it('ignores summaries for services outside the requested set', () => {
    const summaries = [
      makeSummary({ id: 'a', service: 'foo' }),
      makeSummary({ id: 'b', service: 'orphan' }),
    ];
    const { bySvc, aggregate } = rollupSloHealth(['foo'], summaries);
    expect(bySvc.has('orphan')).toBe(false);
    expect(aggregate.total).toBe(1);
    expect(bySvc.get('foo')!.total).toBe(1);
  });
});

describe('useServiceSloHealth', () => {
  function makeApiClient(opts: { aggregate?: jest.Mock; list?: jest.Mock }): SloApiClient {
    return ({
      aggregate: opts.aggregate ?? jest.fn(),
      list: opts.list ?? jest.fn(),
    } as unknown) as SloApiClient;
  }

  function aggregateResponse(
    serviceNames: string[],
    summaries: SloSummary[]
  ): SloAggregateResponse {
    // Build the response shape the server produces by routing through the
    // same rollup — keeps the fixture honest without re-deriving numbers by hand.
    const { bySvc } = rollupSloHealth(serviceNames, summaries);
    const out: SloAggregateResponse = { bySvc: {} };
    for (const name of serviceNames) {
      const bucket = bySvc.get(name);
      out.bySvc[name] = bucket
        ? {
            total: bucket.total,
            ok: bucket.ok,
            warning: bucket.warning,
            breached: bucket.breached,
            noData: bucket.noData,
            stale: bucket.stale,
            disabled: bucket.disabled,
            rulesMissing: bucket.rulesMissing,
            hasAvailability: bucket.hasAvailability,
            hasLatency: bucket.hasLatency,
            missingCanonicalPair: bucket.missingCanonicalPair,
            slos: bucket.slos,
          }
        : {
            total: 0,
            ok: 0,
            warning: 0,
            breached: 0,
            noData: 0,
            stale: 0,
            disabled: 0,
            rulesMissing: 0,
            hasAvailability: false,
            hasLatency: false,
            missingCanonicalPair: true,
            slos: [],
          };
    }
    return out;
  }

  function page(
    results: SloSummary[],
    opts: Partial<Omit<PaginatedResponse<SloSummary>, 'results'>> = {}
  ): PaginatedResponse<SloSummary> {
    return {
      results,
      total: opts.total ?? results.length,
      page: opts.page ?? 1,
      pageSize: opts.pageSize ?? results.length,
      hasMore: opts.hasMore ?? false,
    };
  }

  function notFoundError(): Error {
    const err = new Error('Not found') as Error & {
      response?: { status: number };
    };
    err.response = { status: 404 };
    return err;
  }

  beforeEach(() => {
    __resetAggregateFallbackLatchForTests();
  });

  it('returns empty buckets and does not fetch when datasourceId is absent', async () => {
    const aggregate = jest.fn();
    const list = jest.fn();
    const apiClient = makeApiClient({ aggregate, list });
    const { result } = renderHook(() =>
      useServiceSloHealth({
        serviceNames: ['foo'],
        datasourceId: '',
        apiClient,
      })
    );
    expect(result.current.isLoading).toBe(false);
    expect(aggregate).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
    expect(result.current.aggregate.total).toBe(0);
    expect(result.current.bySvc.get('foo')).toMatchObject({ total: 0 });
  });

  it('returns empty buckets and does not fetch when serviceNames is empty', () => {
    const aggregate = jest.fn();
    const list = jest.fn();
    const apiClient = makeApiClient({ aggregate, list });
    const { result } = renderHook(() =>
      useServiceSloHealth({
        serviceNames: [],
        datasourceId: 'ds-1',
        apiClient,
      })
    );
    expect(aggregate).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
    expect(result.current.aggregate.total).toBe(0);
  });

  it('prefers the aggregate endpoint and rolls up per-service buckets in one call', async () => {
    const summaries = [
      makeSummary({
        id: 'a',
        service: 'foo',
        sliBackend: 'prometheus',
        sliLeafType: 'availability',
        status: { state: 'ok' } as any,
      }),
      makeSummary({
        id: 'b',
        service: 'foo',
        sliBackend: 'prometheus',
        sliLeafType: 'latency_threshold',
        status: { state: 'breached' } as any,
      }),
      makeSummary({
        id: 'c',
        service: 'bar',
        sliBackend: 'prometheus',
        sliLeafType: 'availability',
        status: { state: 'no_data' } as any,
      }),
    ];
    const aggregate = jest.fn().mockResolvedValue(aggregateResponse(['foo', 'bar'], summaries));
    const list = jest.fn();
    const apiClient = makeApiClient({ aggregate, list });

    const { result } = renderHook(() =>
      useServiceSloHealth({
        serviceNames: ['foo', 'bar'],
        datasourceId: 'ds-1',
        apiClient,
      })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(aggregate).toHaveBeenCalledTimes(1);
    expect(aggregate).toHaveBeenCalledWith({
      services: ['foo', 'bar'],
      datasourceId: 'ds-1',
    });
    expect(list).not.toHaveBeenCalled();
    expect(result.current.bySvc.get('foo')).toMatchObject({
      total: 2,
      ok: 1,
      breached: 1,
      hasAvailability: true,
      hasLatency: true,
      missingCanonicalPair: false,
    });
    expect(result.current.bySvc.get('bar')).toMatchObject({
      total: 1,
      noData: 1,
      hasAvailability: true,
      hasLatency: false,
      missingCanonicalPair: true,
    });
    expect(result.current.aggregate.total).toBe(3);
  });

  it('falls back to list fan-out on a 404 from aggregate', async () => {
    const aggregate = jest.fn().mockRejectedValue(notFoundError());
    const list = jest.fn().mockResolvedValue(
      page([
        makeSummary({
          id: 'a',
          service: 'foo',
          sliBackend: 'prometheus',
          sliLeafType: 'availability',
        }),
      ])
    );
    const apiClient = makeApiClient({ aggregate, list });

    const { result } = renderHook(() =>
      useServiceSloHealth({
        serviceNames: ['foo'],
        datasourceId: 'ds-1',
        apiClient,
      })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(aggregate).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        service: ['foo'],
        datasourceId: ['ds-1'],
        page: 1,
      })
    );
    expect(result.current.bySvc.get('foo')?.total).toBe(1);
  });

  it('skips the aggregate call after a prior 404 in the same session', async () => {
    const aggregate = jest.fn().mockRejectedValue(notFoundError());
    const list = jest.fn().mockResolvedValue(page([]));
    const apiClient = makeApiClient({ aggregate, list });

    const { result, rerender } = renderHook(
      ({ ds }) =>
        useServiceSloHealth({
          serviceNames: ['foo'],
          datasourceId: ds,
          apiClient,
        }),
      { initialProps: { ds: 'ds-1' } }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(aggregate).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(1);

    // Change datasourceId — new fetch, but the aggregate latch means we
    // should skip straight to `list` without a second aggregate attempt.
    rerender({ ds: 'ds-2' });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(aggregate).toHaveBeenCalledTimes(1);
  });

  it('surfaces non-404 aggregate errors without falling back', async () => {
    const aggregate = jest.fn().mockRejectedValue(new Error('boom'));
    const list = jest.fn();
    const apiClient = makeApiClient({ aggregate, list });
    const { result } = renderHook(() =>
      useServiceSloHealth({
        serviceNames: ['foo'],
        datasourceId: 'ds-1',
        apiClient,
      })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toEqual(new Error('boom'));
    expect(list).not.toHaveBeenCalled();
    expect(result.current.aggregate.total).toBe(0);
  });

  it('fallback path pages through when total exceeds pageSize and warns', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const aggregate = jest.fn().mockRejectedValue(notFoundError());
    const services = Array.from({ length: 20 }, (_, i) => `svc-${i}`);
    const firstResults = Array.from({ length: 80 }, (_, i) =>
      makeSummary({ id: `a-${i}`, service: services[i % services.length] })
    );
    const secondResults = [makeSummary({ id: 'b-0', service: services[0] })];
    const list = jest
      .fn()
      .mockResolvedValueOnce(
        page(firstResults, { total: 81, pageSize: 80, page: 1, hasMore: true })
      )
      .mockResolvedValueOnce(
        page(secondResults, { total: 81, pageSize: 80, page: 2, hasMore: false })
      );
    const apiClient = makeApiClient({ aggregate, list });

    const { result } = renderHook(() =>
      useServiceSloHealth({
        serviceNames: services,
        datasourceId: 'ds-1',
        apiClient,
      })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls[1][0]).toMatchObject({ page: 2 });
    expect(warn).toHaveBeenCalled();
    expect(result.current.aggregate.total).toBe(81);
    warn.mockRestore();
  });

  it('does not refetch when serviceNames identity changes but content matches', async () => {
    const aggregate = jest.fn().mockResolvedValue(aggregateResponse(['foo', 'bar'], []));
    const apiClient = makeApiClient({ aggregate });
    const { rerender } = renderHook(
      ({ names }) =>
        useServiceSloHealth({
          serviceNames: names,
          datasourceId: 'ds-1',
          apiClient,
        }),
      { initialProps: { names: ['foo', 'bar'] } }
    );
    await waitFor(() => expect(aggregate).toHaveBeenCalledTimes(1));
    rerender({ names: ['bar', 'foo'] }); // same set, different order + identity
    await Promise.resolve();
    expect(aggregate).toHaveBeenCalledTimes(1);
  });

  it('refetches when refetch() is called', async () => {
    const aggregate = jest.fn().mockResolvedValue(aggregateResponse(['foo'], []));
    const apiClient = makeApiClient({ aggregate });
    const { result } = renderHook(() =>
      useServiceSloHealth({
        serviceNames: ['foo'],
        datasourceId: 'ds-1',
        apiClient,
      })
    );
    await waitFor(() => expect(aggregate).toHaveBeenCalledTimes(1));
    act(() => {
      result.current.refetch();
    });
    await waitFor(() => expect(aggregate).toHaveBeenCalledTimes(2));
  });

  it('truncates + warns when serviceNames exceeds the 200-service cap', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const many = Array.from({ length: 250 }, (_, i) => `svc-${i}`);
    const aggregate = jest.fn().mockResolvedValue({ bySvc: {} } as SloAggregateResponse);
    const apiClient = makeApiClient({ aggregate });
    renderHook(() =>
      useServiceSloHealth({
        serviceNames: many,
        datasourceId: 'ds-1',
        apiClient,
      })
    );
    await waitFor(() => expect(aggregate).toHaveBeenCalledTimes(1));
    expect(aggregate.mock.calls[0][0].services.length).toBe(200);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
