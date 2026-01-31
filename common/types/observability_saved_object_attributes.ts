/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SavedObjectAttributes } from '../../../../src/core/types';
import { SavedQuery, SavedVisualization } from './explorer';

export const VISUALIZATION_SAVED_OBJECT = 'observability-visualization';
export const SEARCH_SAVED_OBJECT = 'observability-search';
export const NOTEBOOK_SAVED_OBJECT = 'observability-notebook';
export const CORRELATIONS_SAVED_OBJECT = 'correlations';
export const OBSERVABILTY_SAVED_OBJECTS = [
  VISUALIZATION_SAVED_OBJECT,
  SEARCH_SAVED_OBJECT,
  NOTEBOOK_SAVED_OBJECT,
  CORRELATIONS_SAVED_OBJECT,
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

// APM Configuration Types (reuses correlations saved object type)
export interface ApmConfigEntity {
  tracesDataset?: { id: string };
  serviceMapDataset?: { id: string };
  prometheusDataSource?: { id: string };
}

export interface ApmConfigAttributes extends SavedObjectAttributes {
  title?: string; // 'apm-config'
  correlationType: string; // 'APM-Config-<workspace-id>'
  version: string; // '1.0.0'
  entities: ApmConfigEntity[];
}

export interface ResolvedApmConfig extends Omit<ApmConfigAttributes, 'entities'> {
  objectId?: string;
  tracesDataset: {
    id: string;
    title: string;
    name?: string;
    datasourceId?: string;
    datasourceTitle?: string;
  } | null;
  serviceMapDataset: {
    id: string;
    title: string;
    name?: string;
    datasourceId?: string;
    datasourceTitle?: string;
  } | null;
  prometheusDataSource: {
    id: string; // Saved object ID (for fetching from store)
    name: string; // ConnectionId (for PromQL dataset.id and display)
    meta?: Record<string, unknown>;
  } | null;
}
