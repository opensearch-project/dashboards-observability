/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useBatchCreate } from '../suggest_use_batch_create';
import type { Suggestion } from '../suggest_engine';
import type { SloApiClient } from '../slo_api_client';

jest.mock('../../../../../../../../src/plugins/opensearch_dashboards_react/public', () => ({
  // toMountPoint normally wraps a JSX node in a mount-point function; for the
  // tests we just need the input back so we can assert on the rendered link.
  toMountPoint: (node: React.ReactNode) => node,
}));

function fakeSuggestion(key: string, name = key): Suggestion {
  return ({
    key,
    kindId: 'http-availability',
    kind: 'HTTP availability',
    reason: '',
    sourceMetric: 'm',
    detected: {},
    estimatedRuleCount: 13,
    input: {
      spec: {
        datasourceId: 'ds-1',
        name,
        enabled: true,
        mode: 'active',
        service: 'svc',
        owner: { teams: ['t'] },
        sli: {
          type: 'single',
          definition: {
            backend: 'prometheus',
            type: 'availability',
            calcMethod: 'events',
            metric: 'm',
          },
          dimensions: [],
        },
        objectives: [{ name: 'o', target: 0.99 }],
        budgetWarningThresholds: [],
        window: { type: 'rolling', duration: '28d' },
        alerting: { strategy: 'mwmbr', burnRates: [] },
        alarms: {
          sliHealth: { enabled: false },
          attainmentBreach: { enabled: false },
          budgetWarning: { enabled: true },
          noData: { enabled: false, forDuration: '10m' },
          resolved: { enabled: false },
        },
        exclusionWindows: [],
        labels: {},
        annotations: {},
      },
    },
  } as unknown) as Suggestion;
}

function makeNotifications() {
  return {
    toasts: {
      addSuccess: jest.fn(),
      addDanger: jest.fn(),
      addWarning: jest.fn(),
      addInfo: jest.fn(),
      addError: jest.fn(),
    },
  };
}

function makeHistory() {
  return ({ push: jest.fn() } as unknown) as Parameters<typeof useBatchCreate>[0]['history'];
}

describe('useBatchCreate', () => {
  it('initial state is idle', () => {
    const apiClient = ({ create: jest.fn() } as unknown) as Pick<SloApiClient, 'create'>;
    const { result } = renderHook(() =>
      useBatchCreate({
        apiClient,
        notifications: (makeNotifications() as unknown) as Parameters<
          typeof useBatchCreate
        >[0]['notifications'],
        history: makeHistory(),
      })
    );
    expect(result.current.isCreating).toBe(false);
    expect(result.current.rowStatusMap).toEqual({});
    expect(result.current.progress).toBeNull();
  });

  it('runCreate is a no-op when picks is empty', async () => {
    const create = jest.fn();
    const apiClient = ({ create } as unknown) as Pick<SloApiClient, 'create'>;
    const notifications = makeNotifications();
    const { result } = renderHook(() =>
      useBatchCreate({
        apiClient,
        notifications: (notifications as unknown) as Parameters<
          typeof useBatchCreate
        >[0]['notifications'],
        history: makeHistory(),
      })
    );
    await act(async () => {
      await result.current.runCreate([]);
    });
    expect(create).not.toHaveBeenCalled();
    expect(notifications.toasts.addSuccess).not.toHaveBeenCalled();
  });

  it('flips status pending→creating→success and fires the success toast', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const apiClient = ({ create } as unknown) as Pick<SloApiClient, 'create'>;
    const notifications = makeNotifications();
    const { result } = renderHook(() =>
      useBatchCreate({
        apiClient,
        notifications: (notifications as unknown) as Parameters<
          typeof useBatchCreate
        >[0]['notifications'],
        history: makeHistory(),
      })
    );

    const picks = [fakeSuggestion('a'), fakeSuggestion('b')];
    await act(async () => {
      await result.current.runCreate(picks);
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.current.rowStatusMap.a.status).toBe('success');
    expect(result.current.rowStatusMap.b.status).toBe('success');
    expect(result.current.isCreating).toBe(false);
    expect(result.current.progress).toBeNull();
    expect(notifications.toasts.addSuccess).toHaveBeenCalledTimes(1);
    expect(notifications.toasts.addSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/Created 2 SLOs/) })
    );
  });

  it('uses the singular toast title when one SLO succeeds', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const notifications = makeNotifications();
    const { result } = renderHook(() =>
      useBatchCreate({
        apiClient: ({ create } as unknown) as Pick<SloApiClient, 'create'>,
        notifications: (notifications as unknown) as Parameters<
          typeof useBatchCreate
        >[0]['notifications'],
        history: makeHistory(),
      })
    );
    await act(async () => {
      await result.current.runCreate([fakeSuggestion('a')]);
    });
    expect(notifications.toasts.addSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Created 1 SLO' })
    );
  });

  it('records error message on row + fires danger toast on partial failure', async () => {
    const create = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'));
    const notifications = makeNotifications();
    const { result } = renderHook(() =>
      useBatchCreate({
        apiClient: ({ create } as unknown) as Pick<SloApiClient, 'create'>,
        notifications: (notifications as unknown) as Parameters<
          typeof useBatchCreate
        >[0]['notifications'],
        history: makeHistory(),
      })
    );
    await act(async () => {
      await result.current.runCreate([fakeSuggestion('a'), fakeSuggestion('b')]);
    });
    const errorRow = Object.values(result.current.rowStatusMap).find((s) => s.status === 'error');
    expect(errorRow).toBeDefined();
    expect(errorRow!.message).toBe('boom');
    expect(notifications.toasts.addDanger).toHaveBeenCalledTimes(1);
    expect(notifications.toasts.addSuccess).not.toHaveBeenCalled();
  });

  it('isCreating gates correctly during in-flight work', async () => {
    let release: () => void = () => {};
    const create = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const { result } = renderHook(() =>
      useBatchCreate({
        apiClient: ({ create } as unknown) as Pick<SloApiClient, 'create'>,
        notifications: (makeNotifications() as unknown) as Parameters<
          typeof useBatchCreate
        >[0]['notifications'],
        history: makeHistory(),
      })
    );

    let runPromise!: Promise<void>;
    act(() => {
      runPromise = result.current.runCreate([fakeSuggestion('a')]);
    });
    await waitFor(() => expect(result.current.isCreating).toBe(true));
    await act(async () => {
      release();
      await runPromise;
    });
    expect(result.current.isCreating).toBe(false);
  });
});
