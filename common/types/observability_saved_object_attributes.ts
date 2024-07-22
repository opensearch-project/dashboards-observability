/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectAttributes } from '../../../../src/core/types';
import { SavedQuery, SavedVisualization } from './explorer';

export const VISUALIZATION_SAVED_OBJECT = 'observability-visualization';
export const SEARCH_SAVED_OBJECT = 'observability-search';
export const NOTEBOOK_SAVED_OBJECT = 'observability-notebook';
export const OBSERVABILTY_SAVED_OBJECTS = [
  VISUALIZATION_SAVED_OBJECT,
  SEARCH_SAVED_OBJECT,
  NOTEBOOK_SAVED_OBJECT,
] as const;
export const SAVED_OBJECT_VERSION = 1;

export interface VisualizationSavedObjectAttributes extends SavedObjectAttributes {
  title: string;
  description: string;
  version: number;
  createdTimeMs: number;
  savedVisualization: SavedVisualization;
}

export interface SearchSavedObjectAttributes extends SavedObjectAttributes {
  title: string;
  description: string;
  version: number;
  createdTimeMs: number;
  savedQuery: SavedQuery;
}
