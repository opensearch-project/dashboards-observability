/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { INFRA_PAGE_SIZE } from '../../common/infra_constants';
import { InfraLabelFilter, InfraLayout } from '../../common/types/infra_types';

/** UI state of the Infrastructure tab (not the data, which comes from the hook). */
export interface InfraViewState {
  layout: InfraLayout;
  /** Cards shown; "Load more" adds INFRA_PAGE_SIZE. */
  displayCount: number;
  search: string;
  filters: InfraLabelFilter[];
  showReplaced: boolean;
}

export type InfraViewAction =
  | { type: 'setLayout'; layout: InfraLayout }
  | { type: 'loadMore' }
  | { type: 'setSearch'; search: string }
  | { type: 'setFilters'; filters: InfraLabelFilter[] }
  | { type: 'toggleReplaced' };

export const INITIAL_DISPLAY_COUNT = INFRA_PAGE_SIZE * 2;

export const initialInfraViewState: InfraViewState = {
  layout: 'grid',
  displayCount: INITIAL_DISPLAY_COUNT,
  search: '',
  filters: [],
  showReplaced: false,
};

/** A new search or filter starts the grid from the first page again, as the Metrics page does. */
export function infraViewReducer(state: InfraViewState, action: InfraViewAction): InfraViewState {
  switch (action.type) {
    case 'setLayout':
      return { ...state, layout: action.layout };
    case 'loadMore':
      return { ...state, displayCount: state.displayCount + INFRA_PAGE_SIZE };
    case 'setSearch':
      return { ...state, search: action.search, displayCount: INITIAL_DISPLAY_COUNT };
    case 'setFilters':
      return { ...state, filters: action.filters, displayCount: INITIAL_DISPLAY_COUNT };
    case 'toggleReplaced':
      return { ...state, showReplaced: !state.showReplaced };
  }
}
