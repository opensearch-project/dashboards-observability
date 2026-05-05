/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Monitors table helpers — React-independent constants and small types used
 * across the split sub-files of the monitors table. Kept framework-free so
 * they can be imported by either the `.ts` utility modules or the `.tsx`
 * component modules without pulling in JSX deps.
 *
 * Contents:
 *   - `INTERNAL_LABEL_KEYS` — label keys hidden from the Labels facet UI
 *   - `BACKEND_DISPLAY` — datasource-type → display-name map
 *   - `SavedSearch` — persisted search + filter snapshot
 */
import type { FilterState } from './monitors_table_filters';

// ============================================================================
// Constants
// ============================================================================

export const INTERNAL_LABEL_KEYS = new Set([
  'monitor_type',
  'monitor_kind',
  'datasource_id',
  '_workspace',
  'monitor_id',
  'trigger_id',
  'trigger_name',
]);

export const BACKEND_DISPLAY: Record<string, string> = {
  opensearch: 'OpenSearch',
  prometheus: 'Prometheus',
};

// ============================================================================
// Types
// ============================================================================

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  filters: FilterState;
}
