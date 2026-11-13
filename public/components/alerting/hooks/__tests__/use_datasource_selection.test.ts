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
    expect(JSON.parse(window.localStorage.getItem(ALERT_MANAGER_SELECTED_DS_STORAGE_KEY)!)).toEqual(
      ['cluster-b']
    );
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

    expect(JSON.parse(window.localStorage.getItem(ALERT_MANAGER_SELECTED_DS_STORAGE_KEY)!)).toEqual(
      ['cluster-a', 'cluster-b']
    );
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
  describe('while the CloudWatch datasources load', () => {
    const local = ds('local-cluster', 'Local Cluster', 'opensearch');
    const cwProd: Datasource = {
      id: 'cloudwatch_us-east-1_s2',
      name: 'CloudWatch · Prod · us-east-1',
      type: 'cloudwatch',
      url: 'cloudwatch',
      enabled: true,
    };
    const render = (initial: { datasources: Datasource[]; cloudWatchLoading: boolean }) =>
      renderHook(
        (props: { datasources: Datasource[]; cloudWatchLoading: boolean }) =>
          useDatasourceSelection({
            datasources: props.datasources,
            datasourcesLoading: false,
            cloudWatchLoading: props.cloudWatchLoading,
            defaultDatasources: STABLE_DEFAULT_DATASOURCES,
            maxDatasources: 5,
          }),
        { initialProps: initial }
      );
    const stored = () =>
      JSON.parse(window.localStorage.getItem(ALERT_MANAGER_SELECTED_DS_STORAGE_KEY)!);

    it('selects the other datasources first and merges a stored CloudWatch id in later', () => {
      window.localStorage.setItem(
        ALERT_MANAGER_SELECTED_DS_STORAGE_KEY,
        JSON.stringify(['Local Cluster', cwProd.id])
      );
      const before = [local];
      const { result, rerender } = render({ datasources: before, cloudWatchLoading: true });
      expect(result.current.selectedDsIds).toEqual(['local-cluster']);
      // The stored CloudWatch entry isn't overwritten meanwhile.
      expect(stored()).toEqual(['Local Cluster', cwProd.id]);
      const after = [local, cwProd];
      rerender({ datasources: after, cloudWatchLoading: false });
      expect(result.current.selectedDsIds).toEqual(['local-cluster', cwProd.id]);
      expect(stored()).toEqual(['Local Cluster', cwProd.id]);
    });

    it('waits for CloudWatch when only CloudWatch entries are stored', () => {
      window.localStorage.setItem(
        ALERT_MANAGER_SELECTED_DS_STORAGE_KEY,
        JSON.stringify([cwProd.id])
      );
      const before = [local];
      const { result, rerender } = render({ datasources: before, cloudWatchLoading: true });
      expect(result.current.selectedDsIds).toEqual([]);
      const after = [local, cwProd];
      rerender({ datasources: after, cloudWatchLoading: false });
      expect(result.current.selectedDsIds).toEqual([cwProd.id]);
    });

    it('keeps a selection the user made before CloudWatch loaded', () => {
      window.localStorage.setItem(
        ALERT_MANAGER_SELECTED_DS_STORAGE_KEY,
        JSON.stringify(['Local Cluster', cwProd.id])
      );
      const other = ds('id-b', 'cluster-b', 'opensearch');
      const before = [local, other];
      const { result, rerender } = render({ datasources: before, cloudWatchLoading: true });
      act(() => result.current.setSelectedDsIds(['id-b']));
      const after = [local, other, cwProd];
      rerender({ datasources: after, cloudWatchLoading: false });
      expect(result.current.selectedDsIds).toEqual(['id-b']);
    });
  });

  it('persists CloudWatch datasources by id and the others by name', () => {
    const datasources: Datasource[] = [
      ds('local-cluster', 'Local Cluster', 'opensearch'),
      {
        id: 'cloudwatch_us-east-1_s2',
        name: 'CloudWatch · Prod · us-east-1',
        type: 'cloudwatch',
        url: 'cloudwatch',
        enabled: true,
      },
    ];
    const { result } = renderHook(() =>
      useDatasourceSelection({
        datasources,
        datasourcesLoading: false,
        defaultDatasources: STABLE_DEFAULT_DATASOURCES,
        maxDatasources: 5,
      })
    );
    act(() => result.current.setSelectedDsIds(['local-cluster', 'cloudwatch_us-east-1_s2']));
    expect(JSON.parse(window.localStorage.getItem(ALERT_MANAGER_SELECTED_DS_STORAGE_KEY)!)).toEqual(
      ['Local Cluster', 'cloudwatch_us-east-1_s2']
    );
  });

  it('restores the right account when two accounts share a label', () => {
    // Two scopes labelled "Prod": a persisted id restores that scope, not the first match.
    window.localStorage.setItem(
      ALERT_MANAGER_SELECTED_DS_STORAGE_KEY,
      JSON.stringify(['cloudwatch_us-east-1_s2'])
    );
    const datasources: Datasource[] = ['s1', 's2'].map((scope) => ({
      id: `cloudwatch_us-east-1_${scope}`,
      name: `CloudWatch · Prod (${scope}) · us-east-1`,
      type: 'cloudwatch',
      url: 'cloudwatch',
      enabled: true,
    }));
    const { result } = renderHook(() =>
      useDatasourceSelection({
        datasources,
        datasourcesLoading: false,
        defaultDatasources: STABLE_DEFAULT_DATASOURCES,
        maxDatasources: 5,
      })
    );
    expect(result.current.selectedDsIds).toEqual(['cloudwatch_us-east-1_s2']);
  });
});
