/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  INITIAL_MAP_VIEW_STATE,
  MapViewState,
  groupValueView,
  groupView,
  mapViewReducer,
} from '../application_map_state';
import { DEFAULT_FILTERS, DEFAULT_NAVIGATION_STATE } from '../../../common/types/service_map_types';

const selection = (nodeId: string) => ({
  nodeId,
  serviceName: nodeId,
  environment: 'dev',
  platformType: 'Generic',
});
const edge = {
  edgeId: 'e1',
  sourceService: 'a',
  sourceEnvironment: 'dev',
  targetService: 'b',
  sourceNodeId: 'a',
  targetNodeId: 'b',
} as any;

const reduce = (state: MapViewState, ...actions: Array<Parameters<typeof mapViewReducer>[1]>) =>
  actions.reduce(mapViewReducer, state);

describe('mapViewReducer', () => {
  it('a new Group by opens its top level and clears focus and selection', () => {
    const state = reduce(
      INITIAL_MAP_VIEW_STATE,
      { type: 'focus', nodeId: 'a', selection: selection('a') },
      { type: 'setFilters', filters: { ...DEFAULT_FILTERS, groupBy: 'environment' } }
    );
    expect(state.navigation).toEqual(groupView('environment'));
    expect(state.focus).toBeNull();
    expect(state.selectedNode).toBeNull();
  });

  it('clearing Group by keeps a deep-linked services view, otherwise returns to the application', () => {
    const grouped = { ...DEFAULT_FILTERS, groupBy: 'environment' };
    const fromUrl = reduce(
      INITIAL_MAP_VIEW_STATE,
      { type: 'urlService' },
      { type: 'setFilters', filters: { ...DEFAULT_FILTERS, faultRateThresholds: [] } }
    );
    expect(fromUrl.navigation.level).toBe('services');

    const plain = reduce(
      INITIAL_MAP_VIEW_STATE,
      { type: 'setFilters', filters: grouped },
      { type: 'setFilters', filters: DEFAULT_FILTERS }
    );
    expect(plain.navigation).toEqual(DEFAULT_NAVIGATION_STATE);
  });

  describe('grouped by environment', () => {
    const grouped = reduce(INITIAL_MAP_VIEW_STATE, {
      type: 'setFilters',
      filters: { ...DEFAULT_FILTERS, groupBy: 'environment' },
    });
    const environmentGroups = (envs: string[]) => envs;

    it('opening an environment checks it; going back clears it', () => {
      const opened = reduce(grouped, {
        type: 'navigate',
        navigation: groupValueView('environment', 'dev'),
        environmentFilterId: 'dev',
      });
      expect(opened.filters.environments).toEqual(['dev']);
      const back = reduce(opened, { type: 'navigate', navigation: groupView('environment') });
      expect(back.filters.environments).toEqual([]);
    });

    it('checking one environment opens it; several return to the groups', () => {
      const one = reduce(grouped, {
        type: 'setFilters',
        filters: { ...grouped.filters, environments: ['dev'] },
        environmentGroups,
      });
      expect(one.navigation).toEqual(groupValueView('environment', 'dev'));
      const two = reduce(one, {
        type: 'setFilters',
        filters: { ...one.filters, environments: ['dev', 'qa'] },
        environmentGroups,
      });
      expect(two.navigation).toEqual(groupView('environment'));
    });

    it('other filter changes leave the view alone', () => {
      const opened = reduce(grouped, {
        type: 'navigate',
        navigation: groupValueView('environment', 'dev'),
        environmentFilterId: 'dev',
      });
      const filtered = reduce(opened, {
        type: 'setFilters',
        filters: (prev) => ({ ...prev, searchQuery: 'cart' }),
        environmentGroups,
      });
      expect(filtered.navigation).toEqual(opened.navigation);
      expect(filtered.filters.searchQuery).toBe('cart');
    });
  });

  describe('focus', () => {
    it('keeps the mode when the focus moves to a neighbor, and selects it', () => {
      const state = reduce(
        INITIAL_MAP_VIEW_STATE,
        { type: 'focus', nodeId: 'a', selection: selection('a') },
        { type: 'setFocusMode', mode: 'path' },
        { type: 'focus', nodeId: 'b', selection: selection('b') }
      );
      expect(state.focus).toEqual({ nodeId: 'b', mode: 'path' });
      expect(state.selectedNode?.nodeId).toBe('b');
    });

    it("exit lands on the service's group with the service still selected", () => {
      const state = reduce(
        INITIAL_MAP_VIEW_STATE,
        { type: 'focus', nodeId: 'a', selection: selection('a') },
        {
          type: 'exitFocus',
          target: {
            kind: 'group',
            groupBy: 'environment',
            value: 'dev',
            environmentFilterId: 'dev',
          },
        }
      );
      expect(state.focus).toBeNull();
      expect(state.navigation).toEqual(groupValueView('environment', 'dev'));
      expect(state.filters).toMatchObject({ groupBy: 'environment', environments: ['dev'] });
      expect(state.selectedNode?.nodeId).toBe('a');
    });

    it('navigation leaves focus; clearing the search drops focus and selection', () => {
      const focused = reduce(INITIAL_MAP_VIEW_STATE, {
        type: 'focus',
        nodeId: 'a',
        selection: selection('a'),
      });
      expect(
        reduce(focused, { type: 'navigate', navigation: DEFAULT_NAVIGATION_STATE }).focus
      ).toBeNull();
      const cleared = reduce(focused, { type: 'clearSelection' });
      expect(cleared.focus).toBeNull();
      expect(cleared.selectedNode).toBeNull();
    });
  });

  it('a deep link into a large map focuses the service over its environment', () => {
    const state = reduce(
      INITIAL_MAP_VIEW_STATE,
      { type: 'urlService' },
      {
        type: 'deepLink',
        nodeId: 'a',
        selection: selection('a'),
        environmentGroup: { value: 'dev', environmentFilterId: 'dev' },
      }
    );
    expect(state.focus).toEqual({ nodeId: 'a', mode: 'direct' });
    expect(state.navigation).toEqual(groupValueView('environment', 'dev'));
    expect(state.filters).toMatchObject({ groupBy: 'environment', environments: ['dev'] });
    expect(state.fromUrl).toBe(false);
  });

  it('selecting an edge closes the node flyout; clear all resets the filters', () => {
    const state = reduce(
      INITIAL_MAP_VIEW_STATE,
      { type: 'selectGroup', selection: selection('group-dev') },
      { type: 'selectEdge', edge }
    );
    expect(state.selectedNode).toBeNull();
    expect(state.selectedEdge).toBe(edge);

    const cleared = reduce(
      state,
      {
        type: 'setFilters',
        filters: { ...DEFAULT_FILTERS, groupBy: 'environment', searchQuery: 'x' },
      },
      { type: 'clearAllFilters' }
    );
    expect(cleared.filters).toEqual(DEFAULT_FILTERS);
    expect(cleared.navigation).toEqual(DEFAULT_NAVIGATION_STATE);
  });
});
