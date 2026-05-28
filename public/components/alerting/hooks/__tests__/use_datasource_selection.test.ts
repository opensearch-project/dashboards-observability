/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * use_datasource_selection hook tests.
 *
 * Covers the init/persist effect ordering hazard: when `selectedDsIds`
 * starts as `[]` and both effects run on the first datasources-loaded
 * render, the persistence effect must skip the empty-state pass so it
 * doesn't clobber the localStorage entry the init effect is about to
 * resolve from.
 */
import { act, renderHook } from '@testing-library/react';

import { useDatasourceSelection } from '../use_datasource_selection';
import { ALERT_MANAGER_SELECTED_DS_STORAGE_KEY } from '../../../../../common/constants/alerting_settings';
import type { Datasource } from '../../../../../common/types/alerting';

const ds = (id: string, name: string, type: Datasource['type'] = 'OpenSearch'): Datasource => ({
  id,
  name,
  type,
});

beforeEach(() => {
  window.localStorage.clear();
});

// Stable references — passing fresh literals through `renderHook`'s
// callback would re-fire the init effect on every render and infinite-
// loop, since both the init and persistence effects depend on `datasources`.
// In production, the page wraps these values in `useMemo`.
const STABLE_DEFAULT_DATASOURCES: string[] = [];

describe('useDatasourceSelection', () => {
  it('never writes an empty array to localStorage', () => {
    // Persisted: user previously chose `cluster-b`.
    window.localStorage.setItem(
      ALERT_MANAGER_SELECTED_DS_STORAGE_KEY,
      JSON.stringify(['cluster-b'])
    );
    const setItemSpy = jest.spyOn(window.localStorage.__proto__, 'setItem');

    const datasources = [ds('id-a', 'cluster-a'), ds('id-b', 'cluster-b')];
    renderHook(
      ({ datasources: dsList }: { datasources: Datasource[] }) =>
        useDatasourceSelection({
          datasources: dsList,
          datasourcesLoading: false,
          defaultDatasources: STABLE_DEFAULT_DATASOURCES,
          maxDatasources: 5,
        }),
      { initialProps: { datasources } }
    );

    // Every setItem call against the alert-manager key must carry a
    // non-empty array. The fix's job is to ensure the persistence effect
    // never fires with the still-empty initial state.
    const writes = (setItemSpy.mock.calls as Array<[string, string]>).filter(
      ([key]) => key === ALERT_MANAGER_SELECTED_DS_STORAGE_KEY
    );
    for (const [, raw] of writes) {
      expect(JSON.parse(raw)).not.toEqual([]);
    }
    setItemSpy.mockRestore();
  });

  it('does not clobber a persisted selection on first datasources-loaded render', () => {
    // Persisted: user previously chose `cluster-b`.
    window.localStorage.setItem(
      ALERT_MANAGER_SELECTED_DS_STORAGE_KEY,
      JSON.stringify(['cluster-b'])
    );

    const datasources = [ds('id-a', 'cluster-a'), ds('id-b', 'cluster-b')];

    const { result } = renderHook(
      ({ datasources: dsList }: { datasources: Datasource[] }) =>
        useDatasourceSelection({
          datasources: dsList,
          datasourcesLoading: false,
          defaultDatasources: STABLE_DEFAULT_DATASOURCES,
          maxDatasources: 5,
        }),
      { initialProps: { datasources } }
    );

    // The init effect resolves the persisted name → id.
    expect(result.current.selectedDsIds).toEqual(['id-b']);

    // localStorage still carries the resolved name — was NOT overwritten
    // with `[]` by the persistence effect firing on the empty initial
    // state.
    expect(
      JSON.parse(window.localStorage.getItem(ALERT_MANAGER_SELECTED_DS_STORAGE_KEY)!)
    ).toEqual(['cluster-b']);
  });

  it('persists a new selection once the user picks one', () => {
    const datasources = [ds('id-a', 'cluster-a'), ds('id-b', 'cluster-b')];

    const { result } = renderHook(
      ({ datasources: dsList }: { datasources: Datasource[] }) =>
        useDatasourceSelection({
          datasources: dsList,
          datasourcesLoading: false,
          defaultDatasources: STABLE_DEFAULT_DATASOURCES,
          maxDatasources: 5,
        }),
      { initialProps: { datasources } }
    );

    act(() => {
      result.current.setSelectedDsIds(['id-a', 'id-b']);
    });

    expect(
      JSON.parse(window.localStorage.getItem(ALERT_MANAGER_SELECTED_DS_STORAGE_KEY)!)
    ).toEqual(['cluster-a', 'cluster-b']);
  });

  it('falls back to the first datasource when nothing is persisted', () => {
    const datasources = [ds('id-a', 'cluster-a'), ds('id-b', 'cluster-b')];

    const { result } = renderHook(
      ({ datasources: dsList }: { datasources: Datasource[] }) =>
        useDatasourceSelection({
          datasources: dsList,
          datasourcesLoading: false,
          defaultDatasources: STABLE_DEFAULT_DATASOURCES,
          maxDatasources: 5,
        }),
      { initialProps: { datasources } }
    );

    expect(result.current.selectedDsIds).toEqual(['id-a']);
  });
});
