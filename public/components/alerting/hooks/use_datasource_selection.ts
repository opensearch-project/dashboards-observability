/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Encapsulates the Alerts page's datasource-selection lifecycle:
 *   1. Resolve initial selection from localStorage / admin-curated default
 *      / fallback to the first discovered datasource.
 *   2. Persist the chosen names back to localStorage on every change.
 *   3. Clamp to `maxDatasources`.
 *   4. Wrap the change callback with stable identity.
 *
 * The priority order is unchanged from the inline implementation in
 * `alarms_page.tsx` — extracting it here keeps the page focused on tab
 * orchestration without changing semantics.
 */
import { useCallback, useEffect, useState } from 'react';
import type { Datasource } from '../../../../common/types/alerting';
import { ALERT_MANAGER_SELECTED_DS_STORAGE_KEY } from '../../../../common/constants/alerting_settings';
import {
  loadPersistedSelection as loadPersistedSelectionRaw,
  persistSelection as persistSelectionRaw,
  resolveDatasourceTokens,
} from '../alarms_page_helpers';

export interface UseDatasourceSelectionParams {
  datasources: Datasource[];
  datasourcesLoading: boolean;
  defaultDatasources: string[];
  maxDatasources: number;
}

export interface UseDatasourceSelectionResult {
  selectedDsIds: string[];
  /**
   * Stable callback bound to `setSelectedDsIds`. Returns nothing — the
   * caller can reset companion state (page numbers etc.) inline if it
   * needs to.
   */
  setSelectedDsIds: (ids: string[]) => void;
}

const loadPersistedSelection = () =>
  loadPersistedSelectionRaw(ALERT_MANAGER_SELECTED_DS_STORAGE_KEY);
const persistSelection = (names: string[]) =>
  persistSelectionRaw(ALERT_MANAGER_SELECTED_DS_STORAGE_KEY, names);

export function useDatasourceSelection({
  datasources,
  datasourcesLoading,
  defaultDatasources,
  maxDatasources,
}: UseDatasourceSelectionParams): UseDatasourceSelectionResult {
  const [selectedDsIds, setSelectedDsIdsState] = useState<string[]>([]);

  // Resolve initial selection priority order:
  //   1. Previously-persisted names from localStorage (user's last
  //      explicit choice — wins over the admin default so refresh
  //      doesn't stomp their selection).
  //   2. `observability:alertManagerSelectedDatasources` setting
  //      (names / ids / directQueryName / mdsId). Also used as a
  //      fallthrough when localStorage exists but none of its entries
  //      resolve — e.g., the user's cached datasources were deleted.
  //   3. First discovered datasource.
  // Always clamp to the current `maxDatasources` — so if the admin
  // lowers the cap after the user stored 5 names, we drop the overflow.
  useEffect(() => {
    if (datasourcesLoading) return;
    setSelectedDsIdsState((prev) => {
      if (prev.length > 0) return prev.slice(0, maxDatasources);

      const persistedNames = loadPersistedSelection();
      if (persistedNames.length > 0) {
        const resolved = resolveDatasourceTokens(persistedNames, datasources);
        if (resolved.length > 0) return resolved.slice(0, maxDatasources);
        // All cached entries were stale (datasources removed). Fall
        // through to the admin-curated setting below rather than
        // jumping straight to "first datasource" — the setting is a
        // better backup than an arbitrary pick.
      }

      if (defaultDatasources.length > 0) {
        const resolved = resolveDatasourceTokens(defaultDatasources, datasources);
        if (resolved.length > 0) return resolved.slice(0, maxDatasources);
      }

      const first = datasources[0]?.id;
      return first ? [first] : [];
    });
  }, [datasources, datasourcesLoading, defaultDatasources, maxDatasources]);

  // Persist the selection (by name) whenever it changes and we know the
  // datasource list. Names survive server restarts; ids don't.
  //
  // Skip the empty case: `selectedDsIds` starts as `[]` before the init
  // effect resolves a real selection, and both effects depend on
  // `datasources` — so on the first datasources-loaded render this effect
  // can fire with the still-empty initial state and clobber a valid
  // persisted selection.
  useEffect(() => {
    if (datasources.length === 0) return;
    if (selectedDsIds.length === 0) return;
    const names = selectedDsIds
      .map((id) => datasources.find((d) => d.id === id)?.name)
      .filter((n): n is string => typeof n === 'string');
    persistSelection(names);
  }, [selectedDsIds, datasources]);

  const setSelectedDsIds = useCallback((ids: string[]) => {
    setSelectedDsIdsState(ids);
  }, []);

  return { selectedDsIds, setSelectedDsIds };
}
