/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ApplicationMapFilters,
  DEFAULT_FILTERS,
  DEFAULT_NAVIGATION_STATE,
  FocusMode,
  MapNavigationState,
  SelectedEdgeState,
  SelectedNodeState,
} from '../../common/types/service_map_types';
import { ENVIRONMENT_GROUP_BY } from '../../common/constants';

/**
 * The topology page's coupled view state: what is drawn (navigation, focus), what is filtered,
 * and what is selected. One user action (open a group, focus a service, leave focus, follow a
 * deep link) changes several of these at once, so they change together, here.
 */
export interface MapViewState {
  filters: ApplicationMapFilters;
  navigation: MapNavigationState;
  /** Focus mode: only this node's connections are drawn; `navigation` is the view underneath. */
  focus: { nodeId: string; mode: FocusMode } | null;
  selectedNode: SelectedNodeState | null;
  selectedEdge: SelectedEdgeState | null;
  /** The services view came from a `?service=` deep link: clearing Group by keeps it. */
  fromUrl: boolean;
}

export const INITIAL_MAP_VIEW_STATE: MapViewState = {
  filters: DEFAULT_FILTERS,
  navigation: DEFAULT_NAVIGATION_STATE,
  focus: null,
  selectedNode: null,
  selectedEdge: null,
  fromUrl: false,
};

const servicesView = (): MapNavigationState => ({
  level: 'services',
  breadcrumbs: [{ id: 'services', label: 'Services' }],
  groupByAttribute: null,
  groupByValue: null,
});

export const groupView = (groupBy: string): MapNavigationState => ({
  level: 'groupBy',
  breadcrumbs: [{ id: 'groupBy', label: groupBy }],
  groupByAttribute: groupBy,
  groupByValue: null,
});

export const groupValueView = (groupBy: string, value: string): MapNavigationState => ({
  level: 'groupByValue',
  breadcrumbs: [
    { id: 'groupBy', label: groupBy },
    { id: `group-${value}`, label: value },
  ],
  groupByAttribute: groupBy,
  groupByValue: value,
});

/** Where leaving focus mode lands (computed by the page from the map's nodes). */
export type ExitFocusTarget =
  | { kind: 'stay' }
  | { kind: 'services' }
  | { kind: 'group'; groupBy: string; value: string; environmentFilterId?: string };

export type MapViewAction =
  /**
   * Sidebar / badge filter change. `environmentGroups` resolves an Environment filter selection
   * to the environment groups it matches (used when grouped by environment).
   */
  | {
      type: 'setFilters';
      filters: ApplicationMapFilters | ((prev: ApplicationMapFilters) => ApplicationMapFilters);
      environmentGroups?: (environments: string[]) => string[];
    }
  /** Map navigation (drill-down, breadcrumb). `environmentFilterId` for an opened environment. */
  | { type: 'navigate'; navigation: MapNavigationState; environmentFilterId?: string }
  /** Focus a node (click, search, or a neighbor in focus mode) and select it. */
  | { type: 'focus'; nodeId: string; selection: SelectedNodeState }
  | { type: 'setFocusMode'; mode: FocusMode }
  /** Leave focus mode for the view containing the service, keeping it selected. */
  | { type: 'exitFocus'; target: ExitFocusTarget }
  /** Select a group node (its insights), without focusing. */
  | { type: 'selectGroup'; selection: SelectedNodeState }
  /** The search was cleared: no focus, no selection. */
  | { type: 'clearSelection' }
  | { type: 'closeDetails' }
  | { type: 'selectEdge'; edge: SelectedEdgeState | null }
  /** `?service=` on mount: start on the services view (the node is selected once loaded). */
  | { type: 'urlService' }
  /**
   * The deep-linked service has loaded: focus and select it. On a map too large to draw whole,
   * the view underneath is its environment (grouped by environment, that environment checked).
   */
  | {
      type: 'deepLink';
      nodeId: string;
      selection: SelectedNodeState;
      environmentGroup?: { value: string; environmentFilterId: string };
    }
  | { type: 'clearAllFilters' };

const sameSelection = (a: string[], b: string[]) => a.join('|') === b.join('|');

/** A new Group by: its top level, with focus and selection cleared. */
function applyGroupByChange(state: MapViewState, filters: ApplicationMapFilters): MapViewState {
  const navigation = filters.groupBy
    ? groupView(filters.groupBy)
    : state.fromUrl
      ? state.navigation
      : DEFAULT_NAVIGATION_STATE;
  return {
    ...state,
    filters,
    navigation,
    focus: null,
    selectedNode: null,
    selectedEdge: null,
    fromUrl: filters.groupBy ? false : state.fromUrl,
  };
}

export function mapViewReducer(state: MapViewState, action: MapViewAction): MapViewState {
  switch (action.type) {
    case 'setFilters': {
      const filters =
        typeof action.filters === 'function' ? action.filters(state.filters) : action.filters;
      if (filters.groupBy !== state.filters.groupBy) return applyGroupByChange(state, filters);

      // Grouped by environment, the Environment filter and the opened environment are one
      // choice: one environment opens it, several (or none) return to the environment groups.
      const environmentsChanged = !sameSelection(filters.environments, state.filters.environments);
      if (
        filters.groupBy === ENVIRONMENT_GROUP_BY &&
        environmentsChanged &&
        action.environmentGroups
      ) {
        const groups = action.environmentGroups(filters.environments);
        return {
          ...state,
          filters,
          navigation:
            groups.length === 1
              ? groupValueView(ENVIRONMENT_GROUP_BY, groups[0])
              : groupView(ENVIRONMENT_GROUP_BY),
          focus: null,
          selectedNode: null,
          selectedEdge: null,
        };
      }
      return { ...state, filters };
    }

    case 'navigate': {
      const next = { ...state, navigation: action.navigation, focus: null };
      if (action.navigation.groupByAttribute !== ENVIRONMENT_GROUP_BY) return next;
      if (action.navigation.level === 'groupByValue' && action.environmentFilterId) {
        // Opening an environment checks it.
        return {
          ...next,
          filters: { ...state.filters, environments: [action.environmentFilterId] },
        };
      }
      if (action.navigation.level === 'groupBy' && state.filters.environments.length === 1) {
        // Back to all environments: drop a selection that only meant "the one I had open".
        return { ...next, filters: { ...state.filters, environments: [] } };
      }
      return next;
    }

    case 'focus':
      return {
        ...state,
        focus: { nodeId: action.nodeId, mode: state.focus?.mode ?? 'direct' },
        selectedNode: action.selection,
        selectedEdge: null,
      };

    case 'setFocusMode':
      return state.focus ? { ...state, focus: { ...state.focus, mode: action.mode } } : state;

    case 'exitFocus': {
      const left = { ...state, focus: null };
      const { target } = action;
      if (target.kind === 'stay') return left;
      if (target.kind === 'services') return { ...left, navigation: servicesView() };
      const isEnvironment = target.groupBy === ENVIRONMENT_GROUP_BY;
      return {
        ...left,
        filters: {
          ...state.filters,
          groupBy: target.groupBy,
          ...(isEnvironment &&
            target.environmentFilterId && { environments: [target.environmentFilterId] }),
        },
        navigation: groupValueView(target.groupBy, target.value),
        fromUrl: false,
      };
    }

    case 'selectGroup':
      return { ...state, selectedNode: action.selection, selectedEdge: null };

    case 'clearSelection':
      return { ...state, focus: null, selectedNode: null };

    case 'closeDetails':
      return { ...state, selectedNode: null };

    case 'selectEdge':
      return {
        ...state,
        selectedEdge: action.edge,
        selectedNode: action.edge ? null : state.selectedNode,
      };

    case 'urlService':
      return { ...state, navigation: servicesView(), fromUrl: true };

    case 'deepLink': {
      const focused = {
        ...state,
        focus: { nodeId: action.nodeId, mode: 'direct' as FocusMode },
        selectedNode: action.selection,
        selectedEdge: null,
      };
      if (!action.environmentGroup) return focused;
      return {
        ...focused,
        filters: {
          ...state.filters,
          groupBy: ENVIRONMENT_GROUP_BY,
          environments: [action.environmentGroup.environmentFilterId],
        },
        navigation: groupValueView(ENVIRONMENT_GROUP_BY, action.environmentGroup.value),
        fromUrl: false,
      };
    }

    case 'clearAllFilters':
      // Dependencies are not a filter here (the sidebar checkbox controls them).
      return state.filters.groupBy !== DEFAULT_FILTERS.groupBy
        ? applyGroupByChange(state, DEFAULT_FILTERS)
        : { ...state, filters: DEFAULT_FILTERS };

    default:
      return state;
  }
}
