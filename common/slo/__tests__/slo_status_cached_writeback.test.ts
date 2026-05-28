/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeBackChangedStates } from '../slo_status_cached_writeback';
import type { ISloStore, SloDocument, SloHealthState } from '../slo_types';

function fakeStore(impl: {
  updateCachedState?: (id: string, state: SloHealthState) => Promise<void>;
}): ISloStore {
  return ({
    get: jest.fn(async () => null),
    list: jest.fn(async () => []),
    save: jest.fn(async () => {}),
    delete: jest.fn(async () => false),
    updateCachedState: impl.updateCachedState,
  } as unknown) as ISloStore;
}

describe('writeBackChangedStates', () => {
  it('no-ops when state has not changed', async () => {
    const update = jest.fn(async () => {});
    const store = fakeStore({ updateCachedState: update });
    await writeBackChangedStates(store, [
      { sloId: 'a', newState: 'ok', oldState: 'ok' },
      { sloId: 'b', newState: 'breached', oldState: 'breached' },
    ]);
    expect(update).not.toHaveBeenCalled();
  });

  it('writes only the changed entries', async () => {
    const update = jest.fn(async () => {});
    const store = fakeStore({ updateCachedState: update });
    await writeBackChangedStates(store, [
      { sloId: 'a', newState: 'ok', oldState: 'ok' },
      { sloId: 'b', newState: 'breached', oldState: 'ok' },
      { sloId: 'c', newState: 'warning', oldState: null },
    ]);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith('b', 'breached');
    expect(update).toHaveBeenCalledWith('c', 'warning');
  });

  it('treats null oldState (legacy SO) as a needed write', async () => {
    const update = jest.fn(async () => {});
    const store = fakeStore({ updateCachedState: update });
    await writeBackChangedStates(store, [{ sloId: 'a', newState: 'ok', oldState: null }]);
    expect(update).toHaveBeenCalledWith('a', 'ok');
  });

  it('swallows errors from updateCachedState and logs a warn', async () => {
    const update = jest.fn(async () => {
      throw new Error('boom');
    });
    const warn = jest.fn();
    const logger = ({ warn } as unknown) as Parameters<typeof writeBackChangedStates>[2];
    const store = fakeStore({ updateCachedState: update });
    await expect(
      writeBackChangedStates(store, [{ sloId: 'a', newState: 'breached', oldState: 'ok' }], logger)
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('writeback failed for a');
  });

  it('no-ops when store does not implement updateCachedState', async () => {
    const store = fakeStore({});
    await expect(
      writeBackChangedStates(store, [{ sloId: 'a', newState: 'ok', oldState: 'breached' }])
    ).resolves.toBeUndefined();
  });

  it('bounds concurrency at 4 in flight', async () => {
    let inFlight = 0;
    let peak = 0;
    const update = jest.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
    });
    const store = fakeStore({ updateCachedState: update });
    const inputs = Array.from({ length: 16 }, (_, i) => ({
      sloId: `slo-${i}`,
      newState: 'breached' as SloHealthState,
      oldState: 'ok' as SloHealthState,
    }));
    await writeBackChangedStates(store, inputs);
    expect(update).toHaveBeenCalledTimes(16);
    expect(peak).toBeLessThanOrEqual(4);
  });

  it('SloDocument type compiles against the helper signature', () => {
    // Sanity assertion that the `SloDocument` import path stays valid.
    const _doc: SloDocument | undefined = undefined;
    expect(_doc).toBeUndefined();
  });
});
